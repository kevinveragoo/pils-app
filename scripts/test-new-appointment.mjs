import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
const today='2026-10-21', cache=new Map();
let user={id:'staff',name:'Staff',role:'HEALTHCARE_ASSISTANT'}, failImport=false, failVerification=false, afterImport=false, imports=[];
const attended={uic_ori:'TEST',redcap_repeat_instrument:'clinic_visit',redcap_repeat_instance:4,cnv_date:'2026-10-01',cnv_worker_1:'Previous worker',cnv_visit_purpose___4:'1'};
let rows=[{uic_ori:'TEST',ce_first_name:'Sample'}, {...attended}, {uic_ori:'OTHER',redcap_repeat_instrument:'clinic_visit',redcap_repeat_instance:99,cnv_next_doctor_date:'2026-11-15'}];
function load(file){
 const filename=path.resolve(file);if(cache.has(filename))return cache.get(filename);
 const loadedModule={exports:{}};cache.set(filename,loadedModule.exports);
 const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,{module:loadedModule,exports:loadedModule.exports,URL,URLSearchParams,Response,AbortSignal,process:{env:{REDCAP_API_URL:'https://test.invalid',REDCAP_API_TOKEN:'test'}},
  require:name=>{
   if(name==='@/lib/auth')return {getCurrentUser:async()=>user,hasAnyRole:(u,roles)=>roles.includes(u.role)};
   if(name==='@/lib/db')return {db:{clinicQueueEntry:{aggregate:async()=>({_max:{noShowInstance:8}})}}};
   if(name==='@/lib/clinic-queue')return {mauritiusToday:()=>today};
   if(name==='@/lib/redcap-activity')return {recordRedcapActivity:async()=>true};
   if(name.startsWith('@/'))return load(name.slice(2)+'.ts');
   if(name.endsWith('.json'))return JSON.parse(fs.readFileSync(path.resolve(path.dirname(filename),name)));
   if(name.startsWith('.'))return load(path.resolve(path.dirname(filename),name+'.ts'));
   throw Error(name);
  },
  fetch:async (_url,options)=>{
   const body=options.body;
   if(body.get('action')==='import'){
    if(failImport)return Response.json({error:'Import failed'},{status:500});
    const records=JSON.parse(body.get('data'));imports.push(records);rows.push(...records.map(r=>({...r,redcap_repeat_instance:Number(r.redcap_repeat_instance)})));afterImport=true;
    return Response.json({count:records.length});
   }
   assert.equal(body.get('fields[0]'),'uic_ori');
   const hide=failVerification&&afterImport;afterImport=false;
   return Response.json(hide?rows.slice(0,3):rows);
  }
 });
 cache.set(filename,loadedModule.exports);return loadedModule.exports;
}
const {POST,GET}=load('app/api/redcap/appointments/route.ts');
const post=body=>POST(new Request('http://test.invalid',{method:'POST',body:JSON.stringify(body)}));
const base={recordId:'TEST',appointmentType:'DOCTOR',appointmentDate:'2026-11-15'};
for(const role of ['HEALTHCARE_ASSISTANT','ADMIN']){
 user={...user,role};const before=imports.length;assert.equal((await post(base)).status,200);if(before)assert.equal(imports.length,before,'The same appointment is not duplicated');
}
assert.deepEqual(imports[0],[{uic_ori:'TEST',redcap_repeat_instrument:'clinic_visit',redcap_repeat_instance:'9',cnv_date:today,cnv_next_doctor_date:'2026-11-15'}],'Only the booking date and matching appointment field are imported; reserved no-show instances are skipped');
for(const [type,field] of [['BLOOD_TEST','cnv_next_blood_date'],['MEDICATION','cnv_next_med_date'],['ADDICTOLOGY','cnv_next_addicto_date']]){
 assert.equal((await post({...base,appointmentType:type})).status,200);
 const record=imports.at(-1)[0];assert.equal(record[field],base.appointmentDate);assert.deepEqual(Object.keys(record).sort(),['uic_ori','redcap_repeat_instrument','redcap_repeat_instance','cnv_date',field].sort());
}
assert.deepEqual(rows.find(r=>r.redcap_repeat_instance===4),attended);
let before=imports.length;
await Promise.all([post({...base,appointmentDate:'2026-11-16'}),post({...base,appointmentDate:'2026-11-16'})]);
assert.equal(imports.length,before+1,'Simultaneous submissions create one appointment');
for(const body of [{...base,appointmentDate:'2026-10-20'},{...base,appointmentDate:'2026-02-30'},{...base,appointmentType:'UNKNOWN'},{}])assert.equal((await post(body)).status,400);
assert.equal((await post({...base,recordId:'MISSING'})).status,404,'An upstream filter failure must not allow writing another record');
failImport=true;before=imports.length;assert.equal((await post({...base,appointmentDate:'2026-11-17'})).status,502);assert.equal(imports.length,before);failImport=false;
failVerification=true;assert.equal((await post({...base,appointmentDate:'2026-11-18'})).status,502);failVerification=false;before=imports.length;
assert.equal((await post({...base,appointmentDate:'2026-11-18'})).status,200);assert.equal(imports.length,before,'A retry after an uncertain response finds the saved appointment');
const {countAppointments}=load('lib/clinic-appointments.ts');
assert.deepEqual(JSON.parse(JSON.stringify(countAppointments([
 {uic_ori:'A',redcap_repeat_instrument:'clinic_visit',cnv_next_doctor_date:'2026-11-15',cnv_next_blood_date:'2026-11-15'},
 {uic_ori:'A',redcap_repeat_instrument:'clinic_visit',cnv_next_doctor_date:'2026-11-15'},
 {uic_ori:'A',redcap_repeat_instrument:'prep_visit',pv_next_doctor_date:'2026-11-15',pv_next_med_date:'2026-11-15'},
 {uic_ori:'B',redcap_repeat_instrument:'prep_visit',pv_next_doctor_date:'2026-11-15'},
 {uic_ori:'MISSED',redcap_repeat_instrument:'clinic_visit',cnv_no_show:'1',cnv_next_blood_date:'2026-11-15'},
 {uic_ori:'D',redcap_repeat_instrument:'clinic_visit',cnv_next_addicto_date:'2026-11-15'},
 {uic_ori:'OTHER_DATE',redcap_repeat_instrument:'clinic_visit',cnv_next_med_date:'2026-11-16'},
 {uic_ori:'WRONG_FORM',redcap_repeat_instrument:'outreach',cnv_next_med_date:'2026-11-15'},
], '2026-11-15'))),{DOCTOR:2,BLOOD_TEST:1,MEDICATION:1,ADDICTOLOGY:1});
assert.deepEqual(JSON.parse(JSON.stringify(countAppointments([], '2026-11-15'))),{DOCTOR:0,BLOOD_TEST:0,MEDICATION:0,ADDICTOLOGY:0});
before=imports.length;
const countsResponse=await GET(new Request('http://test.invalid/api?date=2026-11-15'));
assert.equal(countsResponse.status,200);assert.equal(countsResponse.headers.get('Cache-Control'),'no-store');
const countResult=await countsResponse.json();assert.deepEqual(Object.keys(countResult).sort(),['counts','date']);
assert.equal(countResult.counts.DOCTOR,2);assert.equal(countResult.counts.BLOOD_TEST,1);
assert.equal(imports.length,before,'Loading counts is read-only');
assert.equal((await GET(new Request('http://test.invalid/api?date=2026-02-30'))).status,400);
user=null;assert.equal((await post(base)).status,401);assert.equal((await GET(new Request('http://test.invalid/api?date=2026-11-15'))).status,401);
for(const role of ['OUTREACH_WORKER','FACILITY_STAFF','HEALTHCARE_NAVIGATOR']) { user={role};assert.equal((await post(base)).status,403);assert.equal((await GET(new Request('http://test.invalid/api?date=2026-11-15'))).status,403); }
console.log('New appointment checks passed: minimal CNV writes, all four types, reserved instances, date validation, duplicate/retry protection, record isolation and role access. No network requests made.');
