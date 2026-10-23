// Elisa Kevin Veragoo + ChatGPT
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(file, additions={}) {
  const mod={exports:{}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module:mod,exports:mod.exports,Intl,Date,URLSearchParams,AbortSignal,...additions});
  return mod.exports;
}
const model=load('lib/hcs-upcoming.ts');
const today='2026-10-21';
const contact=(id,date,extra={})=>({uic_ori:'TEST',redcap_repeat_instrument:'hiv_care_support',redcap_repeat_instance:id,hcs_followup_date:date,hcs_date:'2026-10-10',hcs_notes:`Notes ${id}`,...extra});
const rows=[contact('2','2026-12-01'),{uic_ori:'TEST',ce_first_name:'Sample',ce_last_name:'Surname',ce_alias:'Alias'},contact('1','2026-10-22'),contact('3',today),contact('4','2026-10-20'),contact('5','2026-02-30'),contact('6',''),contact('7','2026-10-23',{hcs_status_only:'1'}),contact('8','2026-10-24',{redcap_repeat_instrument:'clinic_visit'}),contact('9','2026-10-23',{hcs_date:'2026-10-11',hcs_notes:'Separate contact'})];
const result=JSON.parse(JSON.stringify(model.upcomingHcs(rows,today)));
assert.deepEqual(result.map(r=>r.followupDate),['2026-10-22','2026-10-23','2026-12-01']);
assert.equal(new Set(result.map(r=>r.id)).size,3,'Preserve separate repeat contacts');
assert.equal(result[0].firstName,'Sample');assert.equal(result[0].surname,'Surname');assert.equal(result[0].alias,'Alias');
assert.equal(result[0].notes,'Notes 1');assert.equal(result[1].notes,'Separate contact');assert.equal(result[1].lastVisit,'2026-10-11');
assert.equal(model.mauritiusDate(new Date('2026-10-21T20:30:00Z')),'2026-10-22','Use Mauritius day boundary');
assert.equal(model.upcomingHcs([contact('1','2026-10-22')],today)[0].firstName,'','Missing identity remains blank');
let requests=0;
const data=load('lib/hcs-upcoming-data.ts',{
  require:name=>name==='server-only'?{}:{...model,mauritiusDate:()=>today},
  process:{env:{REDCAP_API_URL:'https://redcap.invalid',REDCAP_API_TOKEN:'test'}},
  fetch:async(url,options)=>{requests++;assert.equal(options.body.get('action'),'export');assert.equal(options.body.get('content'),'record');assert.equal(options.cache,'no-store');const fields=[...options.body].filter(([key])=>key.startsWith('fields[')).map(([,value])=>value);assert.equal(fields.includes('ce_nid'),false);assert.ok(fields.includes('hcs_notes'));assert.equal(options.body.has('data'),false);return {ok:true,json:async()=>rows};}
});
assert.equal((await data.loadUpcomingHcs()).length,3);assert.equal(requests,1);
let allowed=false,loads=0;const denial=new Error('redirect');
const page=load('app/hiv-care-support-upcoming/page.tsx',{
  require:name=>name==='react/jsx-runtime'?{jsx:()=>null,jsxs:()=>null}:name==='@/lib/auth'?{requireAnyRole:async roles=>{assert.deepEqual(Array.from(roles),['HEALTHCARE_NAVIGATOR','ADMIN']);if(!allowed)throw denial;}}:name==='@/lib/hcs-upcoming-data'?{loadUpcomingHcs:async()=>{loads++;return [];}}:{default:()=>null},
});
await assert.rejects(()=>page.default({searchParams:Promise.resolve({})}),error=>error===denial);assert.equal(loads,0,'Access checked before loading private data');
allowed=true;await page.default({searchParams:Promise.resolve({q:'Sample'})});assert.equal(loads,1);
console.log('HCS upcoming checks passed: future dates, all repeats, identity joins, row-specific notes/contact dates, Mauritius timezone, read-only requests and access before data loading.');
