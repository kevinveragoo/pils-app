import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cache = new Map();
let requests = [];
let existing = [];
function load(relative) {
  const filename = path.resolve(root, relative);
  if (cache.has(filename)) return cache.get(filename);
  const loadedModule = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const context = {
    module: loadedModule, exports: loadedModule.exports, Request, Response, URL, URLSearchParams, FormData, File, console,
    process: { env: { REDCAP_API_URL: 'https://redcap.invalid/api/', REDCAP_API_TOKEN: 'test-only' } },
    fetch: async (_url, options) => {
      const body = options.body;
      requests.push(body);
      return Response.json(body.get('action') === 'import' ? { count: 1 } : existing);
    },
    require: (name) => {
      if (name === 'next/server') return { NextResponse: Response };
      if (name.startsWith('@/')) return load(`${name.slice(2)}.ts`);
      if (name.endsWith('.json')) return JSON.parse(fs.readFileSync(path.resolve(path.dirname(filename), name), 'utf8'));
      throw Error(`Unexpected dependency: ${name}`);
    },
  };
  vm.runInNewContext(code, context, { filename });
  cache.set(filename, loadedModule.exports);
  return loadedModule.exports;
}
const { validateFields, validDate, completedAge, parseDob } = load('lib/redcap-validation.ts');
const dobNow = new Date('2026-09-23');
for (const input of ['01/09/1979', '01091979', '01.09.1979', '01/09/79', '1979-09-01', ' 01/09/1979 ']) assert.equal(parseDob(input, true, dobNow), '1979-09-01');
assert.equal(parseDob('01/09/19', false, dobNow), '');
assert.equal(parseDob('01/09/19', true, dobNow), '2019-09-01');
assert.equal(parseDob('01/09/27', true, dobNow), '1927-09-01');
assert.equal(parseDob('29.02.2024'), '2024-02-29');
for (const input of ['31/02/1979', '29/02/79', '01/13/1979', '01/09/197', '01/09.1979', 'abc']) assert.equal(parseDob(input), '');
assert.equal(validDate('2024-02-29'), true);
assert.equal(validDate('2025-02-29'), false);
assert.equal(validDate('2026-04-31'), false);
assert.equal(completedAge('2000-10-01', new Date('2026-09-23')), 25);
assert.equal(completedAge('2000-09-23', new Date('2026-09-23')), 26);
for (const [key, value] of [['sw_age_started', '121'], ['outreach_male_condoms', '-1'], ['pwid_shared_24h', '1.5'], ['cd4_level', '10000'], ['vl_level', '1000000000'], ['num_of_children', '16'], ['emergency_contact_number', 'abc'], ['outreach_date', '31/02/2026'], ['hiv_care_type', '10'], ['partner_phone', 'abc']]) assert.ok(validateFields({ [key]: value }), `${key} rejects ${value}`);
assert.equal(validateFields({ hiv_care_type: '1,9', cd4_level: '0', vl_level: '999999999', part_not_date: 'Within seven days', partner_phone: '123-456-7890' }), null);
assert.ok(validateFields({ client_active: '' }));
assert.equal(validateFields({ child_nameprc: '', child_genderprc: '' }), null);
async function post(route, body) {
  requests = [];
  return load(`app/api/redcap/${route}/route.ts`).POST(new Request('http://localhost/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
}
function imported() { return JSON.parse(requests.find(body => body.get('action') === 'import').get('data')); }
(async () => {
  const enrollment = { enrollment_date_11a07b: '2026-09-23', district_979c1b: '99', district_other_f71f90: 'Other district', hotspot: '1', client_active: '1', client_outreach_worker: 'Tester', client_first_name: 'Test', client_last_name: 'Example', client_dob: '2000-01-01', client_gender_identity: '1', client_kp_type: '3', pwid_injections_24h_b12f8a: '4', pwid_shared_24h: '2' };
  const outreach = { outreach_worker_1: 'Tester', outreach_date: '2026-09-23', outreact_contact_type: '13', new_client: '1' };
  const submission = { mode: 'new', recordId: 'M01012000T_EE', enrollment, outreach, partners: [], children: [] };
  existing = [];
  assert.equal((await post('outreach', submission)).status, 200);
  const rows = imported();
  for (const key of ['pwid_injections_24h_b12f8a', 'pwid_shared_24h', 'client_active', 'district_other_f71f90']) assert.equal(rows[0][key], enrollment[key]);
  assert.equal(rows[1].outreact_contact_type, '13');
  assert.equal(rows[1].sortie_type, undefined);
  assert.equal((await post('outreach', { ...submission, outreach: { ...outreach, outreach_male_condoms: '100000' } })).status, 400);
  assert.equal(requests.length, 0);
  assert.equal((await post('outreach', { ...submission, outreach: { ...outreach, outreach_hiv_rapid_result: '1' }, children: [{ partner_violenceprc: '0', partner_threatsprc: '0', partner_forced_sexprc: '0', part_not_methodprc: '1', part_not_dateprc: 'Within 30 days' }] })).status, 200);
  existing = [{ uic_ori: 'TEST' }];
  const care = { hiv_care_navigator: 'Tester', hiv_care_date: '2026-09-23', hiv_currently_art: '0', hiv_art_status_code: '1', hiv_care_type: '9', hc_followup_needed: '1', hc_followup_date: '' };
  const healthcare = { mode: 'existing', recordId: 'TEST', care, monitoring: { hiv_monitor_date: '2026-09-23', viral_load_detectable: '2' }, newVl: true, newCd4: false, includeMonitoring: true };
  assert.equal((await post('healthcare-nav', healthcare)).status, 200);
  assert.equal(imported()[0].hiv_care_type___9, '1');
  assert.equal(imported()[1].viral_load_detectable, '2');
  assert.equal((await post('healthcare-nav', { ...healthcare, monitoring: { ...healthcare.monitoring, cd4_level: '-1' } })).status, 400);
  assert.equal(requests.length, 0);
  assert.equal((await post('breakfast', { rows: [{ record_id: 'TEST', uic: 'TEST', breakfast_date: '2026-09-23', breakfast_present: '1', extra_servings: 0, breakfast_recorded_by: 'Tester', breakfast_notes: 'Example note' }] })).status, 200);
  assert.equal(imported()[0].breakfast_recorded_by, 'Tester');
  assert.equal(imported()[0].breakfast_notes, 'Example note');
  existing = [];
  assert.equal((await post('healthcare-nav', { ...healthcare, mode: 'new', recordId: submission.recordId, enrollment })).status, 200);
  assert.equal(imported()[0].client_first_name, enrollment.client_first_name);
  assert.equal(imported()[0].client_active, '1');
  assert.equal(imported()[1].redcap_repeat_instrument, 'hiv_care_support');
  console.log('REDCap field validation and mocked submission regression checks passed. No network requests made.');
})().catch(error => { console.error(error); process.exitCode = 1; });
