import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const transpile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
let entry = { id: 'queue', recordId: 'TEST', queueDate: '2026-10-21', status: 'EXPECTED', currentStation: 'RECEPTION', noShow: false, noShowInstance: null };
const older = {uic_ori:'TEST',redcap_repeat_instrument:'clinic_visit',redcap_repeat_instance:'7',cnv_date:'2026-10-01',cnv_worker_1:'Earlier worker',cnv_visit_purpose___9:'1'};
let records = [{uic_ori:'TEST'}, {...older}], imports = [], failImport = false, failVerification = false, failLocal = false, afterImport = false;
const table = {
  findUnique: async () => ({...entry}),
  findUniqueOrThrow: async () => ({...entry}),
  aggregate: async () => ({_max:{noShowInstance:entry.noShowInstance}}),
  update: async ({data}) => (entry = {...entry,...data}),
};
const db = {clinicQueueEntry:table,$transaction:async callback=>callback({clinicQueueEntry:table})};
const updateQueueEntry = async (_id, patch) => { if(failLocal)throw Error('Local write failed'); entry={...entry,...patch}; return {...entry}; };
const loaded = {exports:{}};
vm.runInNewContext(transpile('lib/queue-no-show.ts'), {
 module:loaded,exports:loaded.exports,URLSearchParams,AbortSignal,process:{env:{REDCAP_API_URL:'https://test.invalid',REDCAP_API_TOKEN:'test'}},
 require:name=>{
  if(name==='@/lib/db')return {db};
  if(name==='@/lib/clinic-queue')return {updateQueueEntry};
  if(name==='@/lib/redcap-activity')return {recordRedcapActivity:async()=>true};
  if(name==='@/lib/instrument-forms.json')return JSON.parse(fs.readFileSync('lib/instrument-forms.json'));
  throw Error(name);
 },
 fetch:async (_url, options)=>{
  const body=options.body;
  if(body.get('action')==='import'){
   if(failImport)return Response.json({error:'failed'},{status:500});
   const payload=JSON.parse(body.get('data'));imports.push(payload);afterImport=true;
   for(const row of payload){assert.equal(row.redcap_repeat_instrument,'clinic_visit');const current=records.find(r=>r.redcap_repeat_instance===row.redcap_repeat_instance);if(current)Object.assign(current,row);else records.push({...row});}
   return Response.json({count:payload.length});
  }
  assert.equal(body.get('fields[0]'),'uic_ori','Requesting the record ID is required for REDCap to export record and repeat identifiers');
  const hide=failVerification&&afterImport;afterImport=false;
  const exported=(hide?records.filter(r=>r.redcap_repeat_instance!=='8'):records).map(r=>({...r,...(r.redcap_repeat_instance?{redcap_repeat_instance:Number(r.redcap_repeat_instance)}:{})}));
  return Response.json(exported);
 }
});
const {setQueueNoShow}=loaded.exports;
const user={id:'staff',name:'Queue staff',role:'FACILITY_STAFF'};
let result=await setQueueNoShow('queue',true,user);
assert.equal(result.status,'DONE');assert.equal(result.noShow,true);assert.equal(result.noShowInstance,8);
assert.deepEqual(imports[0],[{uic_ori:'TEST',redcap_repeat_instrument:'clinic_visit',redcap_repeat_instance:'8',cnv_date:'2026-10-21',cnv_worker_1:'Queue staff',cnv_no_show:'1'}]);
await Promise.all([setQueueNoShow('queue',true,user),setQueueNoShow('queue',true,user)]);
assert.equal(records.filter(r=>r.cnv_no_show==='1').length,1,'Double clicks reuse the same CNV');
result=await setQueueNoShow('queue',false,user);
assert.equal(result.status,'EXPECTED');assert.equal(result.noShow,false);
assert.equal(records.find(r=>r.redcap_repeat_instance==='8').cnv_no_show,'');
assert.equal(records.find(r=>r.redcap_repeat_instance==='8').cnv_date,'','Undo must not leave an attended visit behind');
assert.deepEqual(records.find(r=>r.redcap_repeat_instance==='7'),older,'Prior attended visits remain intact');
failImport=true;
await assert.rejects(setQueueNoShow('queue',true,user),/queue has not been moved/);
assert.equal(entry.status,'EXPECTED');assert.equal(entry.noShowInstance,8);
failImport=false;
await setQueueNoShow('queue',true,user);assert.equal(entry.status,'DONE');
failLocal=true;
await assert.rejects(setQueueNoShow('queue',false,user),/Local write failed/);
assert.equal(entry.status,'DONE');
failLocal=false;
await setQueueNoShow('queue',false,user);assert.equal(entry.status,'EXPECTED','Undo retries reconcile a cleared remote row');
failVerification=true;
await assert.rejects(setQueueNoShow('queue',true,user),/could not be verified/);
assert.equal(entry.status,'EXPECTED');
failVerification=false;
await setQueueNoShow('queue',true,user);
records.find(r=>r.redcap_repeat_instance==='8').cnv_weight='65';
await assert.rejects(setQueueNoShow('queue',false,user),/other clinical data/);
assert.equal(entry.status,'DONE');assert.equal(records.find(r=>r.redcap_repeat_instance==='8').cnv_date,'2026-10-21');
delete records.find(r=>r.redcap_repeat_instance==='8').cnv_weight;
await setQueueNoShow('queue',false,user);
entry.status='WAITING';await assert.rejects(setQueueNoShow('queue',true,user),/Only expected/);
entry.status='EXPECTED';entry.recordId=null;await assert.rejects(setQueueNoShow('queue',true,user),/enrolled client/);entry.recordId='TEST';
// Route authorization and automatic removal on returning to Expected.
let currentUser=user;
const route={exports:{}};
vm.runInNewContext(transpile('app/api/clinic-queue/[id]/route.ts'),{module:route,exports:route.exports,Response,
 require:name=>{
  if(name==='@/lib/db')return {db};
  if(name==='@/lib/queue-no-show')return loaded.exports;
  if(name==='next/server')return {NextResponse:Response};
  if(name==='@/lib/auth')return {getCurrentUser:async()=>currentUser,hasAnyRole:(u,roles)=>roles.includes(u.role)};
  if(name==='@/lib/queue-patient-code')return {PatientCodeError:class extends Error{}};
  if(name==='@/lib/clinic-queue')return {QUEUE_STATUSES:['EXPECTED','WAITING','DONE'],QUEUE_STATIONS:['RECEPTION','FILE_RETRIEVAL'],QUEUE_TASKS:[],updateQueueEntry};
  throw Error(name);
 }});
const patch=body=>route.exports.PATCH(new Request('http://test.invalid',{method:'PATCH',body:JSON.stringify(body)}),{params:Promise.resolve({id:'queue'})});
assert.equal((await patch({noShow:true})).status,200);assert.equal(entry.status,'DONE');
assert.equal((await patch({status:'WAITING'})).status,409);
assert.equal((await patch({status:'EXPECTED',currentStation:'RECEPTION'})).status,200);assert.equal(entry.noShow,false);
currentUser=null;assert.equal((await patch({noShow:true})).status,401);
currentUser={...user,role:'OUTREACH_WORKER'};assert.equal((await patch({noShow:true})).status,403);
console.log('Queue no-show checks passed: mark/undo, exact CNV linkage, retries, double clicks, clinical-data protection and route authorization. No network requests made.');
