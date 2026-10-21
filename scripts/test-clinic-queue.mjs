import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
let saved, stored = null, updateCount = 0;
const workflowModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../lib/visit-workflow.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: workflowModule, exports: workflowModule.exports });
const loadedModule = { exports: {} };
const rows = [
  { uic_ori: 'TEST', redcap_repeat_instrument: 'clinic_visit', redcap_repeat_instance: 1, cnv_next_doctor_date: '2026-10-22', cnv_next_appointment_date: '2026-10-22' },
  { uic_ori: 'TEST', ce_first_name: 'Sample', ce_middle_name_1: 'Middle', ce_last_name: 'Surname', ce_alias: 'Alias', cne_patient_code: 'BC 999', ce_tel_primary: '123' },
  { uic_ori: 'TEST', redcap_repeat_instrument: 'clinic_visit', redcap_repeat_instance: 2, cnv_next_blood_date: '2026-10-22' },
  { uic_ori: 'TEST', redcap_repeat_instrument: 'prep_visit', redcap_repeat_instance: 1, pv_next_med_date: '2026-10-22' },
  { uic_ori: 'OTHER', cnv_next_doctor_date: '2026-10-23' },
];
const code = ts.transpileModule(fs.readFileSync(new URL('../lib/clinic-queue.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(code, { module: loadedModule, exports: loadedModule.exports, URLSearchParams, Intl, Date, console,
  process: { env: { REDCAP_API_URL: 'https://test.invalid', REDCAP_API_TOKEN: 'test' } },
  require: name => { if (name === '@/lib/visit-workflow') return workflowModule.exports; assert.equal(name, '@/lib/db'); return { db: { clinicQueueEntry: { findUnique: async () => stored }, $transaction: async callback => callback({ clinicQueueEntry: { findFirst: async () => stored, findUniqueOrThrow: async () => stored, aggregate: async () => ({ _max: { queueNumber: 6 } }), update: async ({ data }) => { updateCount++; stored = { ...stored, ...data }; return stored; }, create: async ({ data }) => { saved = data; if (data.source === "SCHEDULED") stored = { id: "scheduled-entry", ...data }; return stored ?? data; } } }) } }; },
  fetch: async (_url, options) => { assert.equal(options.body.get('action'), 'export'); return Response.json(rows); },
});
const result = JSON.parse(JSON.stringify(await loadedModule.exports.expectedAppointments('2026-10-22')));
assert.equal(result.length, 1);
assert.equal(result[0].displayName, 'Sample Middle Surname');
assert.equal(result[0].alias, 'Alias');
assert.equal(result[0].patientCode, 'BC 999');
assert.equal(result[0].phone, '123');
assert.deepEqual(result[0].tasks, ['DOCTOR', 'BLOOD_TEST', 'MEDICATION']);
assert.equal(result[0].recordId, 'TEST');
console.log('Clinic queue checks passed: repeat follow-ups use enrollment identities and merge services for the selected date.');
rows.push({uic_ori:'MISSED',redcap_repeat_instrument:'clinic_visit',redcap_repeat_instance:1,cnv_no_show:'1',cnv_next_doctor_date:'2026-10-22',cnv_next_appointment_date:'2026-10-22'});
assert.ok(!(await loadedModule.exports.expectedAppointments('2026-10-22')).some(row=>row.recordId==='MISSED'), 'Hidden dates on a no-show must not create future appointments');
rows.pop();
rows.push({uic_ori:'BOOKED',redcap_repeat_instrument:'clinic_visit',redcap_repeat_instance:1,cnv_date:'2026-10-21',cnv_next_blood_date:'2026-10-22'});
const booked=(await loadedModule.exports.expectedAppointments('2026-10-22')).find(row=>row.recordId==='BOOKED');
assert.deepEqual(Array.from(booked.tasks),['BLOOD_TEST'],'A newly booked blank CNV appears under Expected on its appointment date');
rows.pop();
rows.push({ uic_ori: 'LEGACY', redcap_repeat_instrument: 'clinic_visit', redcap_repeat_instance: 1, cnv_next_appointment_date: '2026-10-22' });
const historical = await loadedModule.exports.expectedAppointments('2026-10-22');
assert.deepEqual(Array.from(historical.find(row => row.recordId === 'LEGACY').tasks), ['OTHER']);
rows.pop();
rows.push({uic_ori:'ADDICTO',cnv_next_addicto_date:'2026-10-22',cnv_next_appointment_date:'2026-10-22'});
const addicto=(await loadedModule.exports.expectedAppointments('2026-10-22')).find(row=>row.recordId==='ADDICTO');
assert.deepEqual(Array.from(addicto.tasks),['DOCTOR']);
assert.deepEqual(Array.from(addicto.clinicPurposes),['15']);
assert.deepEqual(Array.from(addicto.appointmentSources),['Clinic addictologist review']);
rows.pop();

await loadedModule.exports.createQueueEntry({ queueDate: "2026-10-22", displayName: "Sample Surname", firstName: "Sample", lastName: "Surname", nationalId: "TEST-ID", phone: "123", isNewClient: true, tasks: ["DOCTOR"] }, { id: "actor", name: "Staff" });
assert.equal(saved.firstName, "Sample"); assert.equal(saved.lastName, "Surname"); assert.equal(saved.nationalId, "TEST-ID"); assert.equal(saved.phone, "123"); assert.equal(saved.isNewClient, true);

assert.equal(result[0].visitWorkflow, 'BOTH');
assert.deepEqual(result[0].clinicPurposes, ['11', '12']);
assert.deepEqual(result[0].prepPurposes, ['3']);
const { queueVisitDetails } = workflowModule.exports;
assert.equal(queueVisitDetails({ tasks: ['PREP', 'DOCTOR'], appointmentSources: [] }).visitWorkflow, 'PREP');
assert.equal(queueVisitDetails({ tasks: ['ARV'], appointmentSources: [] }).visitWorkflow, 'CLINIC');
let queueUser = { id: "staff", role: "FACILITY_STAFF" };
const routeModule = { exports: {} };
let created;
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../app/api/clinic-queue/route.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: routeModule, exports: routeModule.exports, Request, Response, URL,
  require: name => {
    if (name === 'next/server') return { NextResponse: Response };
    if (name === '@/lib/auth') return { getCurrentUser: async () => queueUser, hasAnyRole: (user, roles) => roles.includes(user.role) };
    if (name === '@/lib/db') return { db: { clinicQueueEntry: { deleteMany: async () => ({ count: 0 }) } } };
    if (name === '@/lib/visit-workflow') return workflowModule.exports;
    if (name === '@/lib/clinic-queue') return { queueForDate: async () => [], QUEUE_TASKS: ['DOCTOR', 'BLOOD_TEST', 'MEDICATION', 'PREP', 'ARV', 'OTHER'], QUEUE_STATIONS: ['DOCTOR', 'BLOOD_TEST', 'MEDICATION'], mauritiusToday: () => '2026-10-14', createQueueEntry: async data => { created = data; return data; } };
    throw Error(name);
  },
});
const post = data => routeModule.exports.POST(new Request('https://test.invalid', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recordId: 'TEST', displayName: 'Sample', queueDate: '2026-10-14', ...data }) }));
for (const invalid of [{ recordId: '' }, { recordId: '   ' }, { recordId: null }, { isNewClient: true, firstName: 'New', lastName: 'Client' }]) {
  assert.equal((await post({ visitWorkflow: 'CLINIC', clinicPurposes: ['12'], ...invalid })).status, 400);
}
assert.equal((await post({ visitWorkflow: 'BOTH', clinicPurposes: ['8'], prepPurposes: ['1'], currentStation: 'MEDICATION' })).status, 201);
assert.deepEqual(Array.from(created.tasks), ['DOCTOR', 'BLOOD_TEST']);
assert.equal(created.currentStation, 'MEDICATION', 'First waiting queue is independent of visit purposes');
assert.deepEqual(created.clinicPurposes, ['8']); assert.deepEqual(created.prepPurposes, ['1']);
assert.equal((await post({ visitWorkflow: 'BOTH', clinicPurposes: ['8'], prepPurposes: [] })).status, 400);
assert.equal((await post({ visitWorkflow: 'CLINIC', clinicPurposes: ['7'] })).status, 400);
assert.equal((await post({ visitWorkflow: 'PREP', clinicPurposes: ['8'], prepPurposes: ['1'] })).status, 400);
assert.equal((await post({ visitWorkflow: 'PREP', prepPurposes: ['2'], currentStation: 'DOCTOR' })).status, 201);
assert.equal((await post({ source: 'SCHEDULED', visitWorkflow: 'PREP', tasks: ['PREP'], prepPurposes: [] })).status, 201);
assert.deepEqual(created.tasks, ['PREP']);
console.log('Queue workflow checks passed: separate purposes, routing defaults, validation and independent first waiting queue.');

const persisted = queueVisitDetails({ visitWorkflow: 'BOTH', clinicPurposes: '["11","12"]', prepPurposes: '["3"]', tasks: ['BLOOD_TEST', 'DOCTOR', 'MEDICATION'], appointmentSources: [] });
assert.deepEqual(Array.from(persisted.clinicPurposes), ['11', '12']);
assert.deepEqual(Array.from(persisted.prepPurposes), ['3']);

assert.equal((await post({ source: 'SCHEDULED', recordId: 'TEST', visitWorkflow: 'CLINIC', clinicPurposes: ['11'], tasks: ['BLOOD_TEST'], status: 'WAITING', currentStation: 'FILE_RETRIEVAL' })).status, 201);
assert.equal(created.status, 'WAITING');
assert.equal(created.currentStation, 'FILE_RETRIEVAL');

const arrival = { queueDate: '2026-10-22', recordId: 'ARRIVAL', displayName: 'Arrival client', source: 'SCHEDULED', status: 'WAITING', currentStation: 'FILE_RETRIEVAL', tasks: ['BLOOD_TEST'] };
const firstArrival = await loadedModule.exports.createQueueEntry(arrival, { id: 'actor', name: 'Staff' });
assert.equal(firstArrival.status, 'WAITING'); assert.equal(firstArrival.queueNumber, 7);
const secondArrival = await loadedModule.exports.createQueueEntry(arrival, { id: 'actor', name: 'Staff' });
assert.equal(secondArrival.id, firstArrival.id); assert.equal(secondArrival.queueNumber, 7); assert.equal(updateCount, 0);
stored.status = 'EXPECTED'; stored.queueNumber = null;
await loadedModule.exports.createQueueEntry(arrival, { id: 'actor', name: 'Staff' });
assert.equal(stored.status, 'WAITING'); assert.equal(stored.queueNumber, 7); assert.equal(updateCount, 1);
assert.equal(await loadedModule.exports.completeQueueEntry('scheduled-entry', 'OTHER-CLIENT', { id: 'actor', name: 'Staff' }), false);
assert.equal(stored.status, 'WAITING');
assert.equal(await loadedModule.exports.completeQueueEntry('scheduled-entry', 'ARRIVAL', { id: 'actor', name: 'Staff' }), true);
assert.equal(stored.status, 'DONE');
console.log('Arrival retry and correct-client completion checks passed.');

for (const role of ['FACILITY_STAFF', 'HEALTHCARE_ASSISTANT', 'ADMIN']) {
  queueUser = { id: 'staff', role };
  assert.equal((await routeModule.exports.GET(new Request('https://test.invalid?date=2026-10-22'))).status, 200);
  assert.equal((await post({ visitWorkflow: 'CLINIC', clinicPurposes: ['12'], currentStation: 'DOCTOR' })).status, 201);
  assert.equal((await routeModule.exports.DELETE(new Request('https://test.invalid?date=2026-10-22', { method: 'DELETE' }))).status, 200);
}
for (const [user, status] of [[null, 401], [{ id: 'other', role: 'OUTREACH_WORKER' }, 403]]) {
  queueUser = user;
  assert.equal((await routeModule.exports.GET(new Request('https://test.invalid'))).status, status);
  assert.equal((await post({})).status, status);
  assert.equal((await routeModule.exports.DELETE(new Request('https://test.invalid', { method: 'DELETE' }))).status, status);
}
console.log('Queue permissions passed for Facility Staff, Healthcare Assistant and Admin; unauthenticated and unrelated roles denied.');

rows.push({ uic_ori: 'PREP-FOLLOWUP', redcap_repeat_instrument: 'prep_visit', redcap_repeat_instance: 1, pv_next_blood_date: '2026-10-22', pv_next_doctor_date: '2026-10-22', pv_next_med_date: '2026-10-23' });
const prepDay = JSON.parse(JSON.stringify(await loadedModule.exports.expectedAppointments('2026-10-22'))).find(row => row.recordId === 'PREP-FOLLOWUP');
assert.equal(prepDay.visitWorkflow, 'PREP'); assert.deepEqual(prepDay.prepPurposes, ['1', '2']); assert.deepEqual(prepDay.tasks, ['BLOOD_TEST', 'DOCTOR']);
