//
//  consolidate-cne.mjs
//  pils-app
//
//  Created by Elisa Kevin Veragoo + ChatGPT on 21/10/2026.
//
// Explicit additive consolidation. Original fields/answers are retained.
import fs from 'node:fs';import assert from 'node:assert/strict';
const dir=fs.readFileSync('/tmp/pils-cne-consolidation-path','utf8');
async function api(p){const r=await fetch(process.env.REDCAP_API_URL,{method:'POST',body:new URLSearchParams({token:process.env.REDCAP_API_TOKEN,format:'json',returnFormat:'json',...p}),signal:AbortSignal.timeout(120000)});const d=await r.json();if(!r.ok||d?.error)throw Error(d?.error||'REDCap request failed');return d;}
const phase=process.argv[2],m=await api({content:'metadata'}),id=m[0].field_name;
const cne=m.filter(f=>f.form_name==='clinic_enrollment').map(f=>f.field_name);
const risk=cne.slice(cne.indexOf('cne_age_first_sex'),cne.indexOf('cne_sti_symp_6m'));
const sti=cne.filter(n=>n.startsWith('cne_sti_')),violence=cne.filter(n=>n.startsWith('cne_violence'));
const retired=[...risk,...sti,...violence];assert.equal(retired.length,32);
async function readRows(){const names=m.filter(f=>['clinic_enrollment','clinic_visit','risk_assessment','violence_disclosure'].includes(f.form_name)).map(f=>f.field_name);return api({content:'record',action:'export',type:'flat',...Object.fromEntries([id,...names].map((n,i)=>[`fields[${i}]`,n]))});}
const save=(name,data)=>fs.writeFileSync(`${dir}/${name}.json`,JSON.stringify(data),{mode:0o600,flag:'wx'});
if(phase==='prepare'){
 assert.deepEqual(m,JSON.parse(fs.readFileSync(dir+'/metadata-before.json')));
 const rows=await readRows();save('records-before',rows);
 for(const row of rows)for(const n of retired){const f=m.find(f=>f.field_name===n);if(f.field_type==='checkbox')assert.ok(!Object.entries(row).some(([k,v])=>k.startsWith(n+'___')&&v==='1'),`New source selections found: ${n}`);else assert.ok(!row[n],`New source answer found: ${n}`);}
 const updated=structuredClone(m),created=[];
 const find=n=>updated.find(f=>f.field_name===n);
 function add(field,after){assert.ok(!find(field.field_name),`Existing destination ${field.field_name}`);updated.splice(updated.findIndex(f=>f.field_name===after)+1,0,field);created.push(field.field_name);return field.field_name;}
 const empty=Object.fromEntries(Object.keys(m[0]).map(k=>[k,'']));
 function text(name,form,label,type='text',branch='',section='',choices=''){return {...empty,field_name:name,form_name:form,field_label:label,field_type:type,branching_logic:branch,section_header:section,select_choices_or_calculations:choices};}
 let after=updated.filter(f=>f.form_name==='risk_assessment').at(-1).field_name;
 const map=Object.fromEntries(risk.map(n=>[n,n.replace('cne_','ra_')]));
 for(const n of risk){const source=find(n),name=map[n];let branch=source.branching_logic;for(const [a,b]of Object.entries(map))branch=branch.replaceAll(`[${a}`,`[${b}`);
 // Numeric follow-ups should be available for any positive injection count.
 if(['cne_share_needle_1w','cne_inject_24h','cne_share_needle_24h'].includes(n))branch=branch.replace("= '1'","> '0'");
 after=add({...source,field_name:name,form_name:'risk_assessment',section_header:n===risk[0]?'CURRENT SEXUAL HEALTH AND SUBSTANCE USE':'',branching_logic:branch,field_annotation:'',required_field:''},after);}
 const raType=find('ra_type');assert.ok(!raType.select_choices_or_calculations.split('|').some(v=>v.trim().startsWith('4,')));raType.select_choices_or_calculations+=' | 4, Initial assessment';
 add(text('cnv_initial_assessment','clinic_visit','Initial clinical assessment completed at this visit?','yesno'),'cnv_date');
 after='cnv_sti_syndrome';
 const stiMap={cne_sti_symp_6m:'cnv_sti_symptoms',cne_sti_diagnosed:'cnv_sti_diagnosed',cne_sti_diagnosed_other:'cnv_sti_diagnosed_other',cne_sti_treat_location:'cnv_sti_treat_location'};
 for(const [old,name]of Object.entries(stiMap)){const source=find(old);let branch=source.branching_logic.replaceAll('cne_sti_diagnosed','cnv_sti_diagnosed');after=add({...source,field_name:name,form_name:'clinic_visit',field_label:old==='cne_sti_symp_6m'?'Current STI symptoms':old==='cne_sti_treat_location'?'STI treatment location(s)':'STI diagnosed'+(old.endsWith('_other')?' — other, specify':''),field_note:'',section_header:'',branching_logic:branch,field_annotation:'',required_field:''},after);}
 // Existing CNV treated/screened/location text remain; no retrospective answer is relabelled as current.
 after='vd_client_hdr';
 let field=text('vd_entry_type','violence_disclosure','Entry type','radio','','SCREENING / DISCLOSURE','1, Screening | 2, Disclosure');field.required_field='y';after=add(field,after);
 after=add(text('vd_violence_3m','violence_disclosure','Experienced violence in the last three months?','radio','','','0, No | 1, Yes | 9, Prefer not to answer'),after);
 const disclosure="[vd_violence_3m] = '1' or [vd_entry_type] = '2'";
 find('vd_date').field_label='Screening / disclosure date';find('vd_consent').branching_logic=disclosure;find('vd_consent').required_field='y';find('vd_date').required_field='y';
 const safe=new Set(['vd_client_hdr','vd_entry_type','vd_violence_3m','vd_date','vd_consent']);
 for(const f of updated.filter(f=>f.form_name==='violence_disclosure'))if(!safe.has(f.field_name)&&f.field_type!=='descriptive'){
  const gate="[vd_consent] = '1' and ("+disclosure+")";
  f.branching_logic=f.branching_logic?`(${gate}) and (${f.branching_logic})`:gate;
 }
 after='vd_perpetrator_other';
 const helpMap={cne_violence_help:'vd_help_sought',cne_violence_help_source:'vd_help_source',cne_violence_help_source_other:'vd_help_source_other'};
 for(const [old,name]of Object.entries(helpMap)){const source=find(old);let branch="[vd_consent] = '1' and ("+disclosure+")";if(name!=='vd_help_sought')branch+=" and [vd_help_sought] = '1'";if(name.endsWith('_other'))branch+=" and [vd_help_source(99)] = '1'";after=add({...source,field_name:name,form_name:'violence_disclosure',field_label:name==='vd_help_sought'?'Sought help for the violence?':source.field_label,section_header:'',branching_logic:branch,field_annotation:'',required_field:''},after);}
 save('metadata-added',updated);save('plan',{retired,created,riskMap:map,stiMap,helpMap});console.log(`Backed up records; all 32 source fields empty. Staged ${created.length} destination fields; existing risk formulas untouched.`);
}else if(phase==='add'){
 assert.deepEqual(m,JSON.parse(fs.readFileSync(dir+'/metadata-before.json')));const target=JSON.parse(fs.readFileSync(dir+'/metadata-added.json'));await api({content:'metadata',data:JSON.stringify(target)});assert.deepEqual(await api({content:'metadata'}),target);console.log('Destination schema added and verified. No record imports.');
}else if(phase==='verify-hide'){
 const before=JSON.parse(fs.readFileSync(dir+'/records-before.json')),after=await readRows();const key=r=>[r[id],r.redcap_event_name??'',r.redcap_repeat_instrument??'',r.redcap_repeat_instance??''].join('|');const map=new Map(after.map(r=>[key(r),r]));assert.equal(after.length,before.length);for(const row of before){const now=map.get(key(row));assert.ok(now);for(const [name,value]of Object.entries(row))assert.equal(now[name],value,`Existing value changed: ${name}`);}
 const target=m.map(f=>retired.includes(f.field_name)?{...f,field_annotation:[f.field_annotation,'@HIDDEN'].filter(Boolean).join(' '),required_field:'',section_header:''}:f);await api({content:'metadata',data:JSON.stringify(target)});assert.deepEqual(await api({content:'metadata'}),target);save('metadata-final',target);save('verification',{rows:before.length,sourceFields:retired.length,existingValuesUnchanged:true,recordImports:0});console.log(`All ${before.length} existing rows unchanged; 32 original fields retained and hidden. No patient records imported.`);
}else throw Error('Use prepare/add/verify-hide');
