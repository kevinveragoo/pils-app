// Elisa Kevin Veragoo + ChatGPT
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
const root = path.resolve(import.meta.dirname, '..');
let user = null, existing = false, imports = [], logs = [], requests = 0;
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const loaded = { exports: {} };
  const filename = path.join(root, file);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, { module: loaded, exports: loaded.exports, Request, Response, URL, URLSearchParams, Date,
    process: { env: { REDCAP_API_URL: 'https://test.invalid', REDCAP_API_TOKEN: 'test' } },
    require: name => {
      if (name === 'next/server') return { NextResponse: Response };
      if (name === '@/lib/auth') return { getCurrentUser: async () => user, hasAnyRole: (u, roles) => roles.includes(u.role) };
      if (name === '@/lib/redcap-activity') return { recordRedcapActivity: async entry => { logs.push(entry); return true; } };
      if (name.startsWith('@/')) return load(name.slice(2) + '.ts');
      if (name.endsWith('.json')) return JSON.parse(fs.readFileSync(path.resolve(path.dirname(filename), name), 'utf8'));
      if (name.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(filename), name + '.ts')));
      throw Error(name);
    },
    fetch: async (_url, options) => {
      requests++; assert.equal(options.cache, 'no-store');
      const body = options.body;
      if (body.get('action') === 'export') return Response.json(existing ? [{ uic_ori: recordId }] : []);
      assert.equal(body.get('action'), 'import');
      imports.push(JSON.parse(body.get('data'))); return Response.json({ count: 1 });
    },
  }, { filename });
  cache.set(file, loaded.exports); return loaded.exports;
}
const { initialClientEnrollment } = load('lib/client-enrollment.ts');
const enrollment = { ...initialClientEnrollment('Facility Staff'), ce_date: '2026-10-18', ce_first_name: 'Sample', ce_last_name: 'Person', ce_dob: '1990-01-01', ce_gender_identity: '1', ce_district: '1', ce_kp_type: '7', ce_contact_method: '1,2' };
const recordId = load('lib/uic.ts').generateUic(enrollment);
const { GET, POST } = load('app/api/redcap/client-enrollment/route.ts');
const request = data => new Request('https://test.invalid', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
const payload = { recordId, enrollment };
assert.equal((await POST(request(payload))).status, 401);
assert.equal((await GET(new Request('https://test.invalid?uic=X'))).status, 401);
user = { id: 'worker', role: 'OUTREACH_WORKER' };
assert.equal((await POST(request(payload))).status, 403);
assert.equal((await GET(new Request('https://test.invalid?uic=X'))).status, 403);
assert.equal(requests, 0);
user = { id: 'facility', role: 'FACILITY_STAFF', name: 'Facility Staff' };
assert.equal((await GET(new Request(`https://test.invalid?uic=${recordId}`))).status, 200);
assert.equal((await POST(request({ ...payload, enrollment: { ...enrollment, ce_last_name: '' } }))).status, 400);
assert.equal((await POST(request({ ...payload, recordId: 'WRONG' }))).status, 400);
assert.equal((await POST(request({ ...payload, enrollment: { ...enrollment, ce_gender_identity: '99' } }))).status, 400);
assert.equal((await POST(request({ ...payload, outreach: { oc_date: '2026-10-18' }, enrollment: { ...enrollment, cnv_date: '2026-10-18' } }))).status, 200);
assert.equal(imports.length, 1); assert.equal(imports[0].length, 1);
assert.equal(imports[0][0].ce_kp_type___7, '1');
assert.equal(imports[0][0].ce_contact_method___1, '1');
assert.equal(imports[0][0].ce_contact_method___2, '1');
assert.equal(imports[0][0].uic_ori, recordId);
assert(Object.keys(imports[0][0]).every(key => key === 'uic_ori' || key.startsWith('ce_')));
assert.equal(logs[0].workflow, 'client-enrollment');
existing = true;
assert.equal((await POST(request(payload))).status, 409); assert.equal(imports.length, 1);
assert.equal((await (await GET(new Request(`https://test.invalid?uic=${recordId}`))).json()).exists, true);
user = { id: 'admin', role: 'ADMIN' }; existing = false;
assert.equal((await POST(request(payload))).status, 200);
console.log('Client enrollment checks passed: Facility Staff/Admin access, validation, duplicate protection, enrollment-only writes, checkboxes and activity logging. No network requests made.');
