import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
const root=path.resolve(import.meta.dirname,'..');
let user={}, requests=[], failed=false;
const field=(name,form,type,choices='',label=name)=>({field_name:name,form_name:form,field_type:type,field_label:label,select_choices_or_calculations:choices});
const metadata=[field('uic_ori','client','text'),field('name','client','text','','<b>Full name</b>'),field('flags','client','checkbox','1, First | 2, Second'),field('answer','client','yesno'),field('header','client','descriptive'),field('status','visit','dropdown','1, Active | 2, Abroad'),{...field('date','visit','text'),text_validation_type_or_show_slider_number:'date_dmy'},field('hidden_status','profile','dropdown','1, Active'),field('count','visit','text')];
const instruments=[{instrument_name:'client',instrument_label:'Client enrollment'},{instrument_name:'visit',instrument_label:'Clinic visit'},{instrument_name:'profile',instrument_label:'Treatment profile'}];
const repeating=[{form_name:'visit'},{form_name:'profile'}];
const rows=[{uic_ori:'TEST',name:'Sample',flags___1:'1',flags___2:'0',flags___99:'1',answer:'0',client_complete:'2',redcap_data_access_group:'group',client_timestamp:'2026-10-11 09:30'}, {uic_ori:'TEST',redcap_repeat_instrument:'visit',redcap_repeat_instance:10,status:'2',date:'2026-10-11',count:0}, {uic_ori:'TEST',redcap_repeat_instrument:'visit',redcap_repeat_instance:2,status:'1',date:'2026-10-01'}, {uic_ori:'TEST',redcap_repeat_instrument:'profile',redcap_repeat_instance:1,hidden_status:'1'}];
const cache=new Map();
function load(relative){const filename=path.join(root,relative);if(cache.has(filename))return cache.get(filename);const loadedModule={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{module:loadedModule,exports:loadedModule.exports,Request,Response,URL,URLSearchParams,AbortSignal,process:{env:{REDCAP_API_URL:'https://test.invalid',REDCAP_API_TOKEN:'test'}},require(name){if(name==='next/server')return {NextResponse:Response};if(name==='@/lib/auth')return {getCurrentUser:async()=>user,hasAnyRole:(user,allowed)=>[user.role,...JSON.parse(user.roles??"[]")].some(role=>allowed.includes(role))};if(name.startsWith('@/'))return load(name.slice(2)+'.ts');throw Error(name);},fetch:async(url,options)=>{requests.push(options);assert.equal(options.cache,'no-store');const body=options.body;assert.notEqual(body.get('action'),'import');assert.equal(url,'https://test.invalid');if(failed)return Response.json({error:'failure'},{status:500});const data={record:[...rows,{uic_ori:'OTHER',name:'Must never appear'}],metadata,instrument:instruments,repeatingFormsEvents:repeating};return Response.json(data[body.get('content')]);}},{filename});cache.set(filename,loadedModule.exports);return loadedModule.exports;}
const {buildLookupSections,displayValue,plainLabel}=load('lib/record-lookup.ts');
const sections=buildLookupSections(rows,metadata,instruments,repeating);
assert.equal(sections[0].repeating,false);assert.equal(sections.at(-1).repeating,true);
const base=sections.find(section=>section.name==='client');assert.equal(base.columns.find(field=>field.name==='name').label,'Full name');assert.equal(base.columns.some(field=>field.name==='header'),false);
assert.equal(displayValue(rows[0],metadata[2]),'First; 99');assert.equal(displayValue(rows[0],metadata[3]),'No');assert.equal(plainLabel('<script>text</script> &amp; more'),'text & more');
const visit=sections.find(section=>section.name==='visit');assert.equal(visit.rows[0].instance,'2');assert.equal(visit.rows[1].instance,'10');assert.equal(visit.rows[1].values[visit.columns.findIndex(field=>field.name==='count')],'0');assert.equal(visit.rows[1].values[visit.columns.findIndex(field=>field.name==='date')],'11/10/2026');
assert.equal(sections.find(section=>section.name==='profile').rows[0].values[0],'Active');assert.equal(base.rows[0].values[base.columns.findIndex(field=>field.name==='client_timestamp')],'2026-10-11 09:30');
assert.ok(sections.find(section=>section.name==='record_details').rows[0].values.includes('group'));
assert.equal(displayValue({status:'99'},metadata[5]),'99');assert.equal(buildLookupSections([rows[0]],metadata,instruments,repeating).find(section=>section.name==='visit').rows.length,0);
const {sortLookupRows}=load('lib/record-lookup.ts');
const sortable={columns:[{name:'date',sortType:'date'},{name:'amount',sortType:'number'},{name:'text'}],rows:[
 {instance:'10',event:'',values:['01/02/2026','10','Zulu']},
 {instance:'2',event:'',values:['31/01/2026','2','alpha']},
 {instance:'3',event:'',values:['','','']} ]};
const order=(column,direction)=>Array.from(sortLookupRows(sortable,{column,direction}),row=>row.instance);
assert.deepEqual(order('date','ascending'),['2','10','3']);
assert.deepEqual(order('date','descending'),['10','2','3']);
assert.deepEqual(order('amount','ascending'),['2','10','3']);
assert.deepEqual(order('text','ascending'),['2','10','3']);
assert.deepEqual(order('instance','ascending'),['2','3','10']);
assert.deepEqual(order('instance','descending'),['10','3','2']);
assert.deepEqual(sortable.rows.map(row=>row.instance),['10','2','3'],'Sorting must not mutate fetched record rows');
const blankMetadata=[field('optional','empty','text'),field('checks','empty','checkbox','1, Option'),field('answered','answered','yesno')];
const blankSections=buildLookupSections([{uic_ori:'TEST',optional:'',checks___1:'0',empty_complete:'0',answered:'0'}],blankMetadata,[],[]);
assert.equal(blankSections.find(section=>section.name==='empty').hasData,false,'Default unchecked boxes and incomplete status do not make an empty instrument populated');
assert.equal(blankSections.find(section=>section.name==='answered').hasData,true,'A recorded No is data');
assert.equal(sections.find(section=>section.name==='visit').hasData,true);
assert.equal(buildLookupSections([rows[0]],metadata,instruments,repeating).find(section=>section.name==='visit').hasData,false);
const {GET}=load('app/api/redcap/lookup/route.ts');
user=null;assert.equal((await GET(new Request('https://app.invalid/api/redcap/lookup?uic=TEST'))).status,401);assert.equal(requests.length,0);
user={};assert.equal((await GET(new Request('https://app.invalid/api/redcap/lookup'))).status,400);assert.equal(requests.length,0);
const response=await GET(new Request('https://app.invalid/api/redcap/lookup?uic=TEST'));assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');const data=await response.json();assert.equal(data.uic,'TEST');assert.equal(JSON.stringify(data).includes('Must never appear'),false);assert.equal(requests.length,4);assert.equal(requests.find(options=>options.body.get('content')==='record').body.get('records[0]'),'TEST');
assert.equal((await GET(new Request('https://app.invalid/api/redcap/lookup?uic=MISSING'))).status,404);
failed=true;assert.equal((await GET(new Request('https://app.invalid/api/redcap/lookup?uic=TEST'))).status,502);
console.log('Lookup checks passed: authentication, selected-record filtering, read-only exports, instrument grouping, numeric repeats, choice labels, hidden values and extra fields.');
failed = false;
const protectedForms = [['clinic_enrollment', 'cne_private'], ['clinic_visit', 'cnv_private'], ['hiv_treatment_profile', 'htp_private'], ['hiv_clinical_monitoring', 'htm_private'], ['hiv_care_support', 'hcs_private'], ['prep_treatment_profile', 'ptp_private'], ['prep_visit', 'pv_private']];
for (const [form, name] of protectedForms) {
  metadata.push(field(name, form, 'text', '', `Protected ${form}`));
  instruments.push({ instrument_name: form, instrument_label: `Protected ${form}` });
  if (form === 'clinic_enrollment') Object.assign(rows[0], { [name]: 'CLINICAL_SECRET', [`${form}_complete`]: '2', [`${form}_timestamp`]: 'SECRET_TIMESTAMP' });
  else { repeating.push({ form_name: form }); rows.push({ uic_ori: 'TEST', redcap_repeat_instrument: form, redcap_repeat_instance: 1, [name]: 'CLINICAL_SECRET' }); }
}
metadata.push(field('cl_gbv_refer', 'clinic_visit', 'text'));
rows[0].cl_gbv_refer = 'NON_PREFIX_SECRET';
rows[0].cnv_unknown_legacy = 'LEGACY_SECRET';
rows[0].pv_unknown_legacy = 'PREP_VISIT_LEGACY_SECRET';
rows[0].ptp_unknown_legacy = 'PREP_PROFILE_LEGACY_SECRET';
rows[0].prep_visit_complete = 'PREP_COMPLETION_SECRET';
rows[0].prep_treatment_profile_timestamp = 'PREP_TIMESTAMP_SECRET';
for (const role of ['FACILITY_STAFF', 'OUTREACH_WORKER', 'UNKNOWN']) {
  user = { role };
  const response = await GET(new Request('https://app.invalid/api/redcap/lookup?uic=TEST'));
  assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const data = await response.json(), text = JSON.stringify(data);
  assert.equal(data.restrictedClinicalAccess, true);
  for (const forbidden of ['CLINICAL_SECRET', 'NON_PREFIX_SECRET', 'LEGACY_SECRET', 'SECRET_TIMESTAMP', 'PREP_VISIT_LEGACY_SECRET', 'PREP_PROFILE_LEGACY_SECRET', 'PREP_COMPLETION_SECRET', 'PREP_TIMESTAMP_SECRET']) assert.equal(text.includes(forbidden), false, `${role} must not receive ${forbidden}`);
  for (const [form] of protectedForms) assert.equal(data.sections.some(section => section.name === form), false);
  assert.equal(data.sections.some(section => section.name === 'client'), true);
}
for (const userWithAccess of [{ role: 'HEALTHCARE_ASSISTANT' }, { role: 'HEALTHCARE_NAVIGATOR' }, { role: 'ADMIN' }, { role: 'FACILITY_STAFF', roles: '["HEALTHCARE_NAVIGATOR"]' }]) {
  user = userWithAccess;
  const data = await (await GET(new Request('https://app.invalid/api/redcap/lookup?uic=TEST'))).json();
  assert.equal(data.restrictedClinicalAccess, false);
  for (const [form] of protectedForms) assert.equal(data.sections.some(section => section.name === form), true);
  assert.equal(JSON.stringify(data).includes('CLINICAL_SECRET'), true);
}
console.log('Lookup privacy checks passed: role and multi-role access, protected rows, fields, completion/timestamps, legacy fallback fields and protected PrEP profiles/visits.');

for (const [form,prefix] of [['risk_assessment','ra'],['violence_disclosure','vd']]) {
 metadata.push(field(`${prefix}_sensitive`,form,'text'));
 metadata.push(field(`${prefix}_flags`,form,'checkbox','1, Example'));
 instruments.push({instrument_name:form,instrument_label:form});repeating.push({form_name:form});
 rows.push({uic_ori:'TEST',redcap_repeat_instrument:form,redcap_repeat_instance:1,[`${prefix}_sensitive`]:`${prefix}_SECRET`,[`${prefix}_flags___1`]:'1'});
 rows[0][`${prefix}_unknown_legacy`]=`${prefix}_LEGACY_SECRET`;
 rows[0][`${form}_timestamp`]=`${prefix}_TIMESTAMP_SECRET`;
}
for (const [currentUser,allowed,clinical] of [
 [{role:'OUTREACH_WORKER'},true,false], [{role:'HEALTHCARE_ASSISTANT'},true,true], [{role:'ADMIN'},true,true],
 [{role:'HEALTHCARE_NAVIGATOR'},false,true], [{role:'FACILITY_STAFF'},false,false], [{role:'UNKNOWN'},false,false],
 [{role:'HEALTHCARE_NAVIGATOR',roles:'["OUTREACH_WORKER"]'},true,true],
 [{role:'FACILITY_STAFF',roles:'["HEALTHCARE_NAVIGATOR"]'},false,true]
]) {
 user=currentUser;const response=await GET(new Request('https://app.invalid/api/redcap/lookup?uic=TEST'));const data=await response.json(),text=JSON.stringify(data);
 assert.equal(data.restrictedRiskViolenceAccess,!allowed);assert.equal(data.restrictedClinicalAccess,!clinical);
 for(const prefix of ['ra','vd'])for(const secret of [`${prefix}_SECRET`,`${prefix}_LEGACY_SECRET`,`${prefix}_TIMESTAMP_SECRET`])if(!allowed||!secret.includes("TIMESTAMP"))assert.equal(text.includes(secret),allowed,`${currentUser.role}: ${secret}`);
 for(const form of ['risk_assessment','violence_disclosure'])assert.equal(data.sections.some(section=>section.name===form),allowed);
}
console.log('RA/VD privacy passed: Outreach, Healthcare Assistant and Admin allowed; Navigator/Facility denied; multi-role unions and legacy fields covered.');

for (const role of ['HEALTHCARE_ASSISTANT','FACILITY_STAFF']) {
 user={role};
 const data=await (await GET(new Request('https://app.invalid/api/redcap/lookup?uic=TEST&scope=appointment'))).json();
 assert.ok(data.sections.every(section=>['client_enrollment','clinic_enrollment','clinic_visit','prep_visit'].includes(section.name)));
 assert.equal(data.sections.some(section=>section.name==='clinic_visit'),role==='HEALTHCARE_ASSISTANT');
 assert.equal(data.sections.some(section=>section.name==='prep_visit'),role==='HEALTHCARE_ASSISTANT');
 assert.equal(JSON.stringify(data).includes('ra_SECRET'),false);
}
console.log('Appointment lookup scope passed: CE/CNE/CNV/PV only, with existing clinical restrictions preserved.');
