// Elisa Kevin Veragoo + ChatGPT
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
let rows = [], imports = [], failSave = false;
const loaded = { exports: {} };
const transpile = file => ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(transpile('../lib/queue-patient-code.ts'), { module: loaded, exports: loaded.exports, URLSearchParams, process: { env: { REDCAP_API_URL: 'https://test.invalid', REDCAP_API_TOKEN: 'test' } }, fetch: async (_url, options) => {
  const body = options.body;
  if (body.get('action') === 'import') {
    if (failSave) return Response.json({ error: 'Save failed' }, { status: 500 });
    const payload = JSON.parse(body.get('data')); imports.push(payload);
    for (const p of payload) rows.find(r => r.uic_ori === p.uic_ori).cne_patient_code = p.cne_patient_code;
    return Response.json({ count: 1 });
  }
  return Response.json(rows);
} });
const { saveQueuePatientCode } = loaded.exports;
rows = [{ uic_ori: 'TEST', cne_patient_code: '' }];
assert.equal(await saveQueuePatientCode('TEST', ' bc 123 '), 'BC 123');
assert.deepEqual(imports[0], [{ uic_ori: 'TEST', cne_patient_code: 'BC 123' }], 'Only the code and record ID may be imported');
assert.equal(await saveQueuePatientCode('TEST'), 'BC 123'); assert.equal(imports.length, 1);
await assert.rejects(saveQueuePatientCode('TEST', 'BC 999'), /already has a patient code/);
rows = [{ uic_ori: 'TEST', cne_patient_code: '' }, { uic_ori: 'OTHER', cne_patient_code: 'BC 123' }];
await assert.rejects(saveQueuePatientCode('TEST', 'bc123'), /another client/);
await assert.rejects(saveQueuePatientCode('TEST'), /before leaving/);
await assert.rejects(saveQueuePatientCode('MISSING', 'BC 444'), /no longer exists/);
let entry = { id: 'entry', currentStation: 'FILE_RETRIEVAL', recordId: 'TEST', patientCode: null }, moved = [];
let queueUser = { id: "staff", role: "FACILITY_STAFF" };
const route = { exports: {} };
vm.runInNewContext(transpile('../app/api/clinic-queue/[id]/route.ts'), { module: route, exports: route.exports, Request, Response,
  require: name => {
    if (name === 'next/server') return { NextResponse: Response };
    if (name === '@/lib/auth') return { getCurrentUser: async () => queueUser, hasAnyRole: (user, roles) => roles.includes(user.role) };
    if (name === '@/lib/db') return { db: { clinicQueueEntry: { findUnique: async () => entry } } };
    if (name === '@/lib/queue-patient-code') return loaded.exports;
    if (name === '@/lib/queue-no-show') return { setQueueNoShow: async () => { throw Error('Unexpected no-show action'); }, QueueNoShowError: class extends Error {} };
    if (name === '@/lib/clinic-queue') return { QUEUE_STATUSES: ['WAITING', 'EXPECTED'], QUEUE_STATIONS: ['FILE_RETRIEVAL', 'RECEPTION', 'DOCTOR', 'BLOOD_TEST', 'MEDICATION'], QUEUE_TASKS: ['DOCTOR'], updateQueueEntry: async (_id, patch) => { if (patch.patientCode !== undefined) assert.equal(rows[0].cne_patient_code, patch.patientCode); moved.push(patch); return patch; } };
    throw Error(name);
  },
});
const patch = data => route.exports.PATCH(new Request('https://test.invalid', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }), { params: Promise.resolve({ id: 'entry' }) });
rows = [{ uic_ori: 'TEST', cne_patient_code: '' }]; failSave = true;
assert.equal((await patch({ currentStation: 'DOCTOR', patientCode: 'BC 555' })).status, 502); assert.equal(moved.length, 0);
failSave = false;
assert.equal((await patch({ currentStation: 'DOCTOR' })).status, 400); assert.equal(moved.length, 0);
assert.equal((await patch({ currentStation: 'BLOOD_TEST', patientCode: 'BC 555' })).status, 200);
assert.equal(moved[0].currentStation, 'BLOOD_TEST'); assert.equal(moved[0].patientCode, 'BC 555');
assert.equal((await patch({ currentStation: 'MEDICATION' })).status, 200); assert.equal(imports.length, 2, 'A previously successful save is reused on retry');
rows = [{ uic_ori: 'TEST', cne_patient_code: '' }];
const importsBeforeReturn = imports.length;
assert.equal((await patch({ status: 'EXPECTED', currentStation: 'RECEPTION' })).status, 200);
assert.equal(moved.at(-1).status, 'EXPECTED');
assert.equal(moved.at(-1).currentStation, 'RECEPTION');
assert.equal(moved.at(-1).patientCode, undefined);
assert.equal(imports.length, importsBeforeReturn);
entry = null; assert.equal((await patch({ currentStation: 'DOCTOR' })).status, 404);
console.log('Patient-code checks passed: single-field writes, duplicate/conflict protection, verified save before moving, failures and safe retries. No network requests made.');

queueUser = null; assert.equal((await patch({})).status, 401);
queueUser = { id: 'staff', role: 'OUTREACH_WORKER' }; assert.equal((await patch({})).status, 403);
for (const role of ['FACILITY_STAFF', 'HEALTHCARE_ASSISTANT', 'ADMIN']) {
  queueUser = { id: 'staff', role }; assert.equal((await patch({})).status, 404, 'Authorized roles pass permissions and reach the missing-entry check');
}
