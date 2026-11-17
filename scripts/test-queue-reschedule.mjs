import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const transpile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
const workflow = { exports: {} }; vm.runInNewContext(transpile('lib/visit-workflow.ts'), { module: workflow, exports: workflow.exports });
class QueueNoShowError extends Error { constructor(message, status = 409) { super(message); this.status = status; } }
const initial = { id: 'q', recordId: 'TEST', queueDate: '2026-11-19', status: 'EXPECTED', noShow: false, displayName: 'Test', tasks: '["DOCTOR","BLOOD_TEST"]', appointmentSources: '["Clinic laboratory results review"]', visitWorkflow: 'BOTH', clinicPurposes: '["3"]', prepPurposes: '["1"]', notes: 'Preserve notes' };
let entry, events, rows, copy, imports, failResponse, failCopy, noShows;
function reset() { entry = { ...initial }; events = []; rows = [{ uic_ori: 'TEST' }]; copy = null; imports = 0; failResponse = false; failCopy = false; noShows = 0; }
reset();
const mod = { exports: {} };
vm.runInNewContext(transpile('lib/queue-reschedule.ts'), { module: mod, exports: mod.exports, URLSearchParams, AbortSignal, process: { env: { REDCAP_API_URL: 'https://test.invalid', REDCAP_API_TOKEN: 'mock' } },
 require: name => {
  if (name === '@/lib/db') { const db = { clinicQueueEntry: { findUniqueOrThrow: async () => ({ ...entry }), findUnique: async () => copy, aggregate: async () => ({ _max: { noShowInstance: 8 } }) }, clinicQueueEvent: { findMany: async () => events, create: async ({ data }) => { events.push(data); return data; } } }; db.$transaction = async callback => callback(db); return { db }; }
  if (name === '@/lib/clinic-queue') return { mauritiusToday: () => '2026-11-12', parseStringArray: value => JSON.parse(value), createQueueEntry: async data => { if (failCopy) throw Error('Local failure'); copy ??= { ...data, id: 'future' }; return copy; } };
  if (name === '@/lib/visit-workflow') return workflow.exports;
  if (name === '@/lib/redcap-validation') return { validDate: value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value };
  if (name === '@/lib/queue-no-show') return { QueueNoShowError, setQueueNoShow: async () => { noShows++; entry = { ...entry, noShow: true, status: 'DONE' }; if (!rows.some(r => r.cnv_no_show)) rows.push({ uic_ori: 'TEST', redcap_repeat_instrument: 'clinic_visit', redcap_repeat_instance: 8, cnv_no_show: '1' }); return { ...entry }; } };
  if (name === '@/lib/redcap-activity') return { recordRedcapActivity: async () => true };
  throw Error(name);
 },
 fetch: async (_url, { body }) => {
  assert.equal(body.get('records[0]') || 'TEST', 'TEST');
  if (body.get('action') === 'import') {
   imports++;
   for (const record of JSON.parse(body.get('data'))) { const current = rows.find(r => r.redcap_repeat_instrument === record.redcap_repeat_instrument && String(r.redcap_repeat_instance) === record.redcap_repeat_instance); if (current) Object.assign(current, record); else rows.push({ ...record, redcap_repeat_instance: Number(record.redcap_repeat_instance) }); }
   if (failResponse) { failResponse = false; throw Error('Lost import response'); }
   return Response.json({ count: 1 });
  }
  return Response.json(rows);
 }
});
assert.ok(imports >= 0);
const user = { id: 'staff', name: 'Staff' };
const run = date => mod.exports.rescheduleQueueEntry('q', date, user);
for (const date of ['2026-11-19', '2026-11-18', 'invalid', '2026-02-30']) await assert.rejects(() => run(date));
assert.equal(noShows, 0, 'Validate date before any mutations');
entry.visitWorkflow = 'SCREENING'; await assert.rejects(() => run('2026-11-26')); assert.equal(noShows, 0); reset();
copy = { id: 'other' }; await assert.rejects(() => run('2026-11-26')); assert.equal(noShows, 0); reset();
await Promise.all([run('2026-11-26'), run('2026-11-26')]);
assert.equal(events.length, 1, 'Duplicate requests share a durable plan');
assert.equal(rows.filter(r => r.redcap_repeat_instrument === 'clinic_visit').length, 2, 'One no-show and one new clinic schedule');
assert.equal(rows.filter(r => r.redcap_repeat_instrument === 'prep_visit').length, 1);
assert.equal(rows.find(r => r.cnv_next_lab_review_date)?.cnv_next_lab_review_date, '2026-11-26');
assert.equal(rows.find(r => r.pv_next_blood_date)?.pv_next_blood_date, '2026-11-26');
assert.equal(copy.status, 'EXPECTED'); assert.equal(copy.queueDate, '2026-11-26'); assert.equal(copy.notes, initial.notes); assert.equal(copy.visitWorkflow, 'BOTH');
assert.deepEqual(Array.from(copy.clinicPurposes), ['3']); assert.deepEqual(Array.from(copy.prepPurposes), ['1']);
await assert.rejects(() => run('2026-11-27'), /original new date/);
reset(); failResponse = true; await assert.rejects(() => run('2026-11-26'), /Lost import response/); assert.equal(copy, null); await run('2026-11-26'); assert.equal(events.length, 1); assert.equal(rows.length, 4, 'Retry after a lost response reuses existing repeats');
reset(); failCopy = true; await assert.rejects(() => run('2026-11-26')); failCopy = false; await run('2026-11-26'); assert.equal(rows.length, 4, 'Retry after local failure reuses remote appointments');
console.log('Rescheduling passed: date validation, workflow mapping, no-show, future copy, duplicate clicks and recovery after remote/local failures. No network requests made.');
const route = { exports: {} }; let authorized = false, calls = 0;
vm.runInNewContext(transpile('app/api/clinic-queue/[id]/route.ts'), { module: route, exports: route.exports,
 require: name => {
  if (name === '@/lib/queue-reschedule') return { rescheduleQueueEntry: async (id, date) => { calls++; assert.equal(id, 'q'); assert.equal(date, '2026-11-26'); return { id, status: 'DONE', noShow: true }; } };
  if (name === '@/lib/queue-no-show') return { QueueNoShowError };
  if (name === '@/lib/queue-patient-code') return { PatientCodeError: class extends Error {} };
  if (name === '@/lib/db') return { db: { clinicQueueEntry: { findUnique: async () => initial } } };
  if (name === 'next/server') return { NextResponse: Response };
  if (name === '@/lib/auth') return { getCurrentUser: async () => user, hasAnyRole: () => authorized };
  if (name === '@/lib/clinic-queue') return { QUEUE_STATUSES: [], QUEUE_STATIONS: [], QUEUE_TASKS: [] };
  throw Error(name);
 }
});
const patch = data => route.exports.PATCH(new Request('https://test.invalid', { method: 'PATCH', body: JSON.stringify(data) }), { params: Promise.resolve({ id: 'q' }) });
assert.equal((await patch({ rescheduleDate: '2026-11-26' })).status, 403); assert.equal(calls, 0);
authorized = true; assert.equal((await patch({ rescheduleDate: null })).status, 400); assert.equal(calls, 0);
assert.equal((await patch({ rescheduleDate: '2026-11-26' })).status, 200); assert.equal(calls, 1);
console.log('Reschedule API passed: denied roles cannot mutate, invalid payloads rejected, authorized requests dispatched.');
