// Elisa Kevin Veragoo + ChatGPT
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=JSON.parse(fs.readFileSync(process.argv[2]??'lib/instrument-forms.json'));
const annotation=Array.isArray(source)?source.find(f=>f.field_name==='cnv_next_appointment_date').field_annotation:source.clinic_visit.find(f=>f.name==='cnv_next_appointment_date').annotation;
assert.ok(annotation.startsWith('@CALCTEXT('));
const expression=annotation.slice('@CALCTEXT('.length,-1);
const pattern=/isblankormissingcode|if|and|<=|\[[a-zA-Z0-9_]+\]|[(),]/g;
const tokens=expression.match(pattern);assert.equal(expression.replace(pattern,'').trim(),'');
let index=0;
function atom(){
 const token=tokens[index++];
 if(token.startsWith('['))return {kind:'ref',name:token.slice(1,-1)};
 if(token==='('){const result=parse();assert.equal(tokens[index++],')');return result;}
 assert.ok(['if','isblankormissingcode'].includes(token));assert.equal(tokens[index++],'(');
 const args=[parse()];while(tokens[index]===','){index++;args.push(parse());}assert.equal(tokens[index++],')');
 return {kind:token,args};
}
function comparison(){let node=atom();if(tokens[index]==='<='){index++;node={kind:'<=',left:node,right:atom()};}return node;}
function parse(){let node=comparison();while(tokens[index]==='and'){index++;node={kind:'and',left:node,right:comparison()};}return node;}
const tree=parse();assert.equal(index,tokens.length);
function evaluate(node,values){
 if(node.kind==='ref')return values[node.name]??'';
 if(node.kind==='if')return evaluate(node.args[0],values)?evaluate(node.args[1],values):evaluate(node.args[2],values);
 if(node.kind==='isblankormissingcode')return evaluate(node.args[0],values)==='';
 if(node.kind==='and')return evaluate(node.left,values)&&evaluate(node.right,values);
 if(node.kind==='<=')return evaluate(node.left,values)<=evaluate(node.right,values);
 throw Error('Unsupported expression');
}
const fields=['cnv_next_med_date','cnv_next_blood_date','cnv_next_doctor_date','cnv_next_addicto_date','cnv_next_lab_review_date',...(expression.includes('[cnv_next_other_date]')?['cnv_next_other_date']:[])];
const dates=['2026-12-01','2026-11-20','2026-11-15','2026-11-10','2026-11-05','2026-11-01'];
for(const legacy of ['','2020-01-01','2027-01-01'])for(let mask=0;mask<2**fields.length;mask++){
 const values={cnv_legacy_next_date:legacy,...Object.fromEntries(fields.flatMap((field,i)=>mask&(1<<i)?[[field,dates[i]]]:[]))};
 const expected=fields.map(f=>values[f]).filter(Boolean).sort()[0]??legacy;
 assert.equal(evaluate(tree,values),expected,`REDCap expression mismatch for mask ${mask}`);
}
assert.equal(evaluate(tree,Object.fromEntries(fields.map(f=>[f,'2026-11-05']))),'2026-11-05');
console.log(`REDCap formula checks passed: ${fields.length} service dates, all ${2**fields.length} blank/nonblank combinations, ties, and historical fallback precedence.`);
