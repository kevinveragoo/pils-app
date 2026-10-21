import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import ExcelJS from 'exceljs';
const require = createRequire(import.meta.url), root = path.resolve(import.meta.dirname, '..');
const cache=new Map();
let user={}, allowed=true, requests=[], exported=[], fail=false;
function load(relative) {
 const filename=path.resolve(root,relative);if(cache.has(filename))return cache.get(filename);
 const loadedModule={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,{module:loadedModule,exports:loadedModule.exports,Date,Intl,Buffer,Uint8Array,structuredClone,Response,URLSearchParams,AbortSignal,process:{env:{REDCAP_API_URL:'https://test.invalid',REDCAP_API_TOKEN:'test'}},fetch:async (_url,options)=>{requests.push(options);if(fail)return Response.json({error:'failure'},{status:500});return Response.json(exported);},require:name=>{
  if(name==='@/lib/auth')return {getCurrentUser:async()=>user,hasAnyRole:()=>allowed};
  if(name.startsWith('@/'))return load(`${name.slice(2)}.ts`);
  if(name.endsWith('.json'))return JSON.parse(fs.readFileSync(path.resolve(path.dirname(filename),name),'utf8'));
  if(name.startsWith('.'))return load(path.relative(root,path.resolve(path.dirname(filename),`${name}.ts`)));
  return require(name);
 }},{filename});cache.set(filename,loadedModule.exports);return loadedModule.exports;
}
const {buildIndexRows}=load('lib/export-index/model.ts');
const {createIndexWorkbook}=load('lib/export-index/workbook.ts');
const today='2026-10-11';
const main={uic_ori:'TEST001',cne_patient_code:'000123',ce_patient_code:'LEGACY',ce_first_name:'Sample',ce_middle_name_1:'Middle',ce_last_name:'Person',ce_tel_primary:'001234',ce_gender_identity:'1',ce_kp_type___2:'1',ce_kp_type___6:'1',ce_dob:'2000-11-11',ce_nationality:'Mauritian'};
const profile=(form,instance,values)=>({uic_ori:'TEST001',redcap_repeat_instrument:form,redcap_repeat_instance:String(instance),...values});
const data=[main,
 profile('prep_treatment_profile',9,{ptp_update_date:'2025-01-01',ptp_status:'2'}),
 profile('prep_treatment_profile',1,{ptp_update_date:'2026-01-01',ptp_status:'1',ptp_start_date:'2024-06-03',ptp_medication:'6',ptp_ltfu:'0'}),
 profile('prep_visit',1,{pv_visit_date:'2026-02-01',pv_prescription_months:'3',pv_syphilis_referral:'1',pv_hbv_vaccination_status:'4'}),
 profile('hiv_treatment_profile',1,{htp_effective_date:'2026-01-01',htp_care_status:'1',htp_art_regimen___6:'1',htp_art_start_date:'2020-01-01'}),
 profile('hiv_clinical_monitoring',1,{htm_date:'2024-01-01',htm_is_baseline:'1',htm_cd4_level:'0',htm_vl_level:'0',htm_cd4_date:'2024-01-01',htm_vl_date:'2024-01-01'}),
 profile('hiv_clinical_monitoring',2,{htm_date:'2026-01-01',htm_cd4_level:'400',htm_cd4_date:'2025-12-01',htm_vl_level:'20',htm_vl_date:'2025-12-01'}),
 {uic_ori:'NO_PROFILE',ce_last_name:'Excluded'},
 {uic_ori:'EMPTY_PROFILE',redcap_repeat_instrument:'prep_treatment_profile',redcap_repeat_instance:'1',prep_treatment_profile_complete:'0'},
 {uic_ori:'INCOMPLETE',redcap_repeat_instrument:'hiv_treatment_profile',redcap_repeat_instance:'1',htp_effective_date:'2026-01-01'},
];
const [prep,arv]=buildIndexRows(data,today);
assert.equal(prep.length,1);assert.equal(arv.length,2);assert.equal(prep[0].length,22);assert.equal(arv[0].length,43);
assert.equal(prep[0][0],'000123');assert.equal(prep[0][3],'001234');assert.equal(prep[0][11],'Descovy');assert.equal(prep[0][21],'Active');
const a=arv.find(row=>row[14]==='TEST001');assert.equal(a[15],25);assert.equal(a[22],0);assert.equal(a[23],0);assert.equal(a[28],400);assert.equal(a[30],20);assert.equal(a[24],'Descovy');
assert.equal(a[16],'');assert.equal(a[19],'');assert.equal(a[38],'');assert.equal(a[40],'');

// A missed appointment cannot replace an attended visit or supply clinical values.
const missed = profile('clinic_visit', 99, { cnv_no_show: '1', cnv_date: '2026-10-20', cnv_next_doctor_date: '2026-12-01', cnv_doctor_comments: 'Hidden stale text' });
assert.deepEqual(buildIndexRows([...data, missed], today), buildIndexRows(data, today));
// Scheduling-only CNVs update the next date while retaining the actual last visit.
const booking = profile('clinic_visit', 100, { cnv_date: '2026-10-21', cnv_next_doctor_date: '2026-11-15' });
const bookedArv = buildIndexRows([...data, booking], today)[1].find(row => row[14] === 'TEST001');
assert.deepEqual(bookedArv[31], a[31], 'Booking an appointment must not become the last attended visit');
assert.equal(bookedArv[33].toISOString().slice(0,10), '2026-11-15');
const { isAppointmentOnly } = load('lib/clinic-appointments.ts');
assert.equal(isAppointmentOnly(booking), true);
assert.equal(isAppointmentOnly({...booking,cnv_worker_1:'Attending worker'}), false);
assert.equal(isAppointmentOnly({...booking,cnv_visit_purpose___4:'1'}), false);
// New codes remain instrument-specific in exports; legacy meanings stay intact.
for(const [code,status] of [['8','Prison'],['2','No longer active'],['99','Other']]){
 const changed=data.map(row=>row.ptp_update_date==='2026-01-01'?{...row,ptp_status:code}:row);
 assert.equal(buildIndexRows(changed,today)[0][0][21],status);
}
for(const [code,status] of [['10','Not interested'],['11','On demand'],['12','HIV+']]){
 const changed=data.map(row=>row.htp_care_status?{...row,htp_care_status:code}:row);
 assert.equal(buildIndexRows(changed,today)[1].find(row=>row[14]==='TEST001')[42],status);
}

const historyData=[...data,
 profile('prep_visit',10,{ptp_status:'5',pv_status_date:'2026-10-01',pv_visit_date:'2026-10-01',pv_status_only:'1'}),
 profile('prep_visit',11,{ptp_status:'2',pv_status_date:'2026-09-01',pv_visit_date:'2026-09-01',pv_status_only:'1'}),
 profile('hiv_care_support',2,{hcs_care_status:'9',hcs_status_date:'2026-10-01'}),
 profile('hiv_care_support',3,{hcs_care_status:'1',hcs_status_date_unknown:'1',hcs_date:'2026-10-11'})];
const historyTables=buildIndexRows(historyData,today);
assert.equal(historyTables[0][0][21],'Abroad');
assert.equal(historyTables[0][0][10].toISOString().slice(0,10),'2026-10-01','PV visits determine the latest visit date');
assert.equal(historyTables[1].find(row=>row[14]==='TEST001')[42],'Deported');
const {latestStatus,statusChangeError}=load('lib/status-history.ts');
assert.equal(latestStatus(historyData,'prep').status,'5','Effective date determines current status');
assert.match(statusChangeError(historyData,'prep','5','1'),/changed since/);
assert.match(statusChangeError([main],'prep','1'),/not enrolled/);
assert.equal(latestStatus([...historyData, {...profile('prep_visit',12,{ptp_status:'8',pv_visit_date:'2026-10-01'}),redcap_repeat_instance:12}],'prep').status,'8','Numeric repeat instances resolve ties');
const bytes=await createIndexWorkbook(data,today);
const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(Buffer.from(bytes));
assert.deepEqual(workbook.worksheets.map(sheet=>sheet.name),['Prep Index','Index Arv copy']);
const p=workbook.worksheets[0],h=workbook.worksheets[1];
assert.equal(p.getCell('A2').value,'000123');assert.equal(p.getCell('A2').numFmt,'@');assert.ok(p.getCell('H2').value instanceof Date);assert.equal(p.getCell('H2').numFmt,'dd.mm.yyyy');assert.equal(p.getCell('AB4').value,1);assert.equal(p.getCell('AB31').value,0,'Former PWID must not count as PWID');assert.equal(p.getCell('AB65').value,1);
assert.equal(h.getCell('AU4').value,2);assert.equal(h.getCell('AU22').value,0,'Missing CD4 must not count below 100');assert.equal(h.getCell('AU58').value,1);
const layout=JSON.parse(fs.readFileSync(path.join(root,'lib/export-index/layout.json'),'utf8'));
for(const [i,sheet] of workbook.worksheets.entries())for(const header of layout[i].headers)assert.equal(sheet.getCell(1,header.column).value,header.label);
const empty=new ExcelJS.Workbook();await empty.xlsx.load(Buffer.from(await createIndexWorkbook([],today)));assert.equal(empty.worksheets[0].getCell('AB4').value,0);
const {GET}=load('app/api/export-index/route.ts');
user=null;assert.equal((await GET()).status,401);assert.equal(requests.length,0);
user={};allowed=false;assert.equal((await GET()).status,403);assert.equal(requests.length,0);
allowed=true;exported=data;const response=await GET();assert.equal(response.status,200);assert.match(response.headers.get('Content-Type'),/spreadsheetml/);assert.match(response.headers.get('Cache-Control'),/no-store/);assert.match(response.headers.get('Content-Disposition'),/PILS-Index-.*\.xlsx/);
assert.equal(requests[0].body.get('action'),'export');assert.equal(requests[0].cache,'no-store');assert.equal(requests[0].body.get('forms[0]'),'client_enrollment');
fail=true;assert.equal((await GET()).status,502);
if(process.env.INDEX_SAMPLE_OUTPUT){fs.writeFileSync(process.env.INDEX_SAMPLE_OUTPUT,bytes);fs.writeFileSync(`${process.env.INDEX_SAMPLE_OUTPUT}.json`,JSON.stringify(workbook.worksheets.map(sheet=>({name:sheet.name,rows:sheet.getSheetValues(),formats:sheet.getSheetValues().map((row,i)=>row?.map((_,j)=>sheet.getCell(i,j).numFmt || 'General'))}))));}
console.log('Index export checks passed: cohorts, mapping, dates, zero/missing results, workbook layout, authentication and read-only API.');
if(process.env.INDEX_LIVE_CHECK==='1') {
 const body=new URLSearchParams({token:process.env.REDCAP_API_TOKEN,content:'record',action:'export',format:'json',type:'flat',rawOrLabel:'raw',returnFormat:'json'});
 load('lib/export-index/model.ts').exportForms.forEach((form,i)=>body.set(`forms[${i}]`,form));
 const response=await fetch(process.env.REDCAP_API_URL,{method:'POST',body,signal:AbortSignal.timeout(120000)});
 const rows=await response.json();assert.equal(response.ok,true);assert.ok(Array.isArray(rows));assert.ok(rows.every(row=>Object.values(row).every(value=>(typeof value==='string'||typeof value==='number'))));
 const tables=buildIndexRows(rows,today);const result=await createIndexWorkbook(rows,today);
 const live=new ExcelJS.Workbook();await live.xlsx.load(Buffer.from(result));
 assert.equal(live.worksheets[0].getCell('AB4').value,tables[0].length);assert.equal(live.worksheets[1].getCell('AU4').value,tables[1].length);
 console.log(`Live read-only export verified: ${tables[0].length} PrEP clients and ${tables[1].length} ARV clients. Workbook generated in memory; no patient data saved.`);
}
