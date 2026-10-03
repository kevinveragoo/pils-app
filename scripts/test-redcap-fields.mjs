import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Independent schema snapshot exported from the cleaned project on 2026-09-27.
const schema = JSON.parse(fs.readFileSync(path.join(root, 'scripts/fixtures/redcap-schema.json'), 'utf8'));
const forms = new Set(Object.values(schema).map(field => field.form));
function checkField(name) {
  const [base, code] = name.split('___');
  assert.ok(schema[base], `Unknown REDCap field: ${name}`);
  if (code !== undefined) assert.ok(schema[base].codes?.includes(code), `Unknown checkbox choice: ${name}`);
  return schema[base];
}
function checkRequest(body) {
  for (const [key, value] of body.entries()) {
    if (/^fields\[\d+\]$/.test(key)) checkField(value);
    if (/^forms\[\d+\]$/.test(key)) assert.ok(forms.has(value), `Unknown form: ${value}`);
  }
  if (body.get('action') === 'import') {
    for (const row of JSON.parse(body.get('data'))) {
      const form = row.redcap_repeat_instrument || 'client_enrollment';
      assert.ok(forms.has(form));
      for (const name of Object.keys(row)) {
        if (name.startsWith('redcap_')) continue;
        const field = checkField(name);
        if (name !== 'uic_ori') assert.equal(field.form, form, `${name} must belong to ${form}`);
      }
    }
  }
}
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
      checkRequest(body);
      requests.push(body);
      return Response.json(body.get('action') === 'import' ? { count: 1 } : existing);
    },
    require: (name) => {
      if (name === 'next/server') return { NextResponse: Response };
      if (name === '@/lib/auth') return { isAuthenticatedRequest: async () => true };
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
for (const [key, value] of [['ce_sw_age_started', '121'], ['oc_male_condoms', '-1'], ['ce_pwid_shared_24h', '1.5'], ['htm_cd4_level', '10000'], ['htm_vl_level', '1000000000'], ['ce_num_children', '16'], ['ce_emergency_tel', 'abc'], ['oc_date', '31/02/2026'], ['hcs_care_type', '11'], ['itp_phone', 'abc']]) assert.ok(validateFields({ [key]: value }), `${key} rejects ${value}`);
assert.equal(validateFields({ hcs_care_type: '1,9', htm_cd4_level: '0', htm_vl_level: '999999999', itp_notif_date: 'Within seven days', itp_phone: '123-456-7890' }), null);
assert.ok(validateFields({ ce_active: '' }));
assert.equal(validateFields({ itch_name: '', itch_gender: '' }), null);
async function post(route, body) {
  requests = [];
  return load(`app/api/redcap/${route}/route.ts`).POST(new Request('http://localhost/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
}
function imported() { return JSON.parse(requests.find(body => body.get('action') === 'import').get('data')); }
(async () => {
  const enrollment = { ce_date: '2026-09-23', ce_district: '1', ce_hotspot: '1', ce_active: '1', ce_outreach_worker: 'Tester', ce_first_name: 'Test', ce_last_name: 'Example', ce_dob: '2000-01-01', ce_gender_identity: '1', ce_vision: '2', ce_kp_type: '3,8', ce_pwid_injections_24h: '4', ce_pwid_shared_24h: '2' };
  const outreach = { oc_worker_1: 'Tester', oc_date: '2026-09-23', oc_type: '13', oc_is_new_client: '1' };
  const submission = { mode: 'new', recordId: 'M01012000T_EE', enrollment, outreach, partners: [], children: [] };
  existing = [];
  assert.equal((await post('outreach', submission)).status, 200);
  const rows = imported();
  for (const key of ['ce_pwid_injections_24h', 'ce_pwid_shared_24h', 'ce_active']) assert.equal(rows[0][key], enrollment[key]);
  assert.equal(rows[1].oc_type, '13');
  assert.equal(rows[1].sortie_type, undefined);
  assert.equal((await post('outreach', { ...submission, enrollment: { ...enrollment, ce_district: '99' } })).status, 400);
  assert.equal(requests.length, 0);
  const twoMiddleNames = { ...enrollment, ce_middle_name_1: 'Alpha', ce_middle_name_2: 'Beta' };
  assert.equal((await post('outreach', { ...submission, recordId: 'M01012000TAB_EE', enrollment: twoMiddleNames })).status, 200);
  assert.equal(imported()[0].ce_middle_name_1, 'Alpha');
  assert.equal(imported()[0].ce_middle_name_2, 'Beta');
  assert.equal(imported()[0].ce_vision, '2');
  assert.equal(imported()[0].ce_kp_type___8, '1');
  assert.equal((await post('outreach', { ...submission, outreach: { ...outreach, oc_male_condoms: '100000' } })).status, 400);
  assert.equal(requests.length, 0);
  assert.equal((await post('outreach', { ...submission, outreach: { ...outreach, oc_hiv_rapid_result: '1' }, children: [{ itch_violence: '0', itch_threats: '0', itch_force_sex: '0', itch_notif_method: '1', itch_notif_date_limit: 'Within 30 days' }] })).status, 200);
  assert.equal((await post('outreach', { ...submission, enrollment: { ...enrollment, ce_kp_type: '1,3', ce_contact_method: '1,3' }, outreach: { ...outreach, oc_hiv_rapid_result: '1', oc_referrals: '1,12', oc_referral_other: 'Example' }, partners: [{ itp_name: 'Example Partner', itp_gender: '1', itp_violence: '0', itp_threats: '0', itp_forced_sex: '0', itp_notif_method: '1' }] })).status, 200);
  assert.equal(imported()[0].ce_kp_type___3, '1');
  assert.equal(imported()[0].ce_contact_method___3, '1');
  assert.equal(imported()[1].oc_referrals___12, '1');
  assert.equal(imported()[2].itp_name, 'Example Partner');
  existing = [{ uic_ori: 'TEST' }];
  const care = { hcs_navigator_1: 'Tester', hcs_date: '2026-09-23', hcs_currently_art: '0', hcs_art_status: '1', hcs_care_type: '9,10', hcs_followup_needed: '1', hcs_followup_date: '' };
  const healthcare = { mode: 'existing', recordId: 'TEST', care, monitoring: { htm_date: '2026-09-23', htm_viral_load_detectable: '2' }, newVl: true, newCd4: false, includeMonitoring: true };
  assert.equal((await post('healthcare-nav', healthcare)).status, 200);
  assert.equal(imported()[0].hcs_care_type___9, '1');
  assert.equal(imported()[0].hcs_care_type___10, '1');
  assert.equal(imported()[1].htm_viral_load_detectable, '2');
  assert.equal((await post('healthcare-nav', { ...healthcare, monitoring: { ...healthcare.monitoring, htm_cd4_level: '-1' } })).status, 400);
  assert.equal(requests.length, 0);
  assert.equal((await post('breakfast', { rows: [{ record_id: 'TEST', uic: 'TEST', breakfast_date: '2026-09-23', breakfast_present: '1', extra_servings: 0, breakfast_recorded_by: 'Tester', breakfast_notes: 'Example note' }] })).status, 200);
  assert.equal(imported()[0].breakfast_recorded_by, 'Tester');
  assert.equal(imported()[0].breakfast_notes, 'Example note');
  existing = [];
  assert.equal((await post('breakfast/skeletons', { clients: [{ alias: 'Breakfast client', uic: 'M01012000T_EE' }] })).status, 200);
  assert.equal(imported()[0].ce_alias, 'Breakfast client');
  assert.equal(imported()[0].ce_dob, '2000-01-01');
  assert.equal(imported()[0].ce_gender_identity, '1');
  assert.equal((await post('healthcare-nav', { ...healthcare, mode: 'new', recordId: submission.recordId, enrollment })).status, 200);
  assert.equal(imported()[0].ce_first_name, enrollment.ce_first_name);
  assert.equal(imported()[0].ce_active, '1');
  assert.equal(imported()[1].redcap_repeat_instrument, 'hiv_care_support');
  assert.equal((await post('healthcare-nav', { ...healthcare, mode: 'new', recordId: 'M01012000TAB_EE', enrollment: twoMiddleNames })).status, 200);
  assert.equal(imported()[0].ce_middle_name_2, 'Beta');
  existing = [{ uic_ori: 'TEST', ce_first_name: 'Test', ce_middle_name_1: 'Alpha', ce_middle_name_2: 'Beta', ce_last_name: 'Example', ce_kp_type___3: '1', ce_kp_type___8: '1' }];
  const patients = await (await load('app/api/redcap/patients/route.ts').GET()).json();
  assert.equal(patients[0].middle_name, 'Alpha Beta');
  assert.equal(patients[0].display_name, 'Test Alpha Beta Example');
  assert.deepEqual(patients[0].kp_types, ['3', '8']);
  existing.push({ uic_ori: 'TEST', redcap_repeat_instrument: 'outreach_contact', redcap_repeat_instance: '1', oc_date: '2026-09-23', oc_hiv_rapid_result: '2', oc_syringes: '7', oc_num_needles: '9', oc_male_condoms: '12' });
  const dashboard = await (await load('app/api/redcap/dashboard/route.ts').GET(new Request('http://localhost/api?period=all'))).json();
  assert.equal(dashboard.rapid.totals.hiv, 1);
  assert.equal(dashboard.rapid.byKp.hiv.PWID, 1);
  assert.equal(dashboard.commodities.totals.syringes, 7);
  assert.equal(dashboard.commodities.totals.needles, 9);
  for (const route of ['outreach', 'healthcare-nav']) {
    const lookup = await (await load(`app/api/redcap/${route}/route.ts`).GET(new Request('http://localhost/api?uic=TEST'))).json();
    assert.equal(lookup.exists, true);
  }
  console.log('REDCap field validation and mocked submission regression checks passed. No network requests made.');
})().catch(error => { console.error(error); process.exitCode = 1; });
