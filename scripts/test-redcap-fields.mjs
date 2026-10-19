import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Independent schema snapshot exported from the cleaned project on 2026-10-04.
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
        if (name !== 'uic_ori') {
          if (!row.redcap_repeat_instrument) assert.ok(['client_enrollment', 'clinic_enrollment'].includes(field.form), `${name} must belong to a nonrepeating enrollment form`);
          else assert.equal(field.form, form, `${name} must belong to ${form}`);
        }
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
      if (name === '@/lib/auth') return { isAuthenticatedRequest: async () => true, getCurrentUser: async () => ({ id: 'test-user', name: 'Test User', username: 'tester', role: 'ADMIN', roles: '["ADMIN"]' }), hasRole: () => true, hasAnyRole: () => true };
      if (name === '@/lib/redcap-activity') return { recordRedcapActivity: async () => true };
      if (name === '@/lib/clinic-queue') return { completeQueueEntry: async () => false };
      if (name.startsWith('@/')) return load(`${name.slice(2)}.ts`);
      if (name.endsWith('.json')) return JSON.parse(fs.readFileSync(path.resolve(path.dirname(filename), name), 'utf8'));
      if (name.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(filename), `${name}.ts`)));
      throw Error(`Unexpected dependency: ${name}`);
    },
  };
  vm.runInNewContext(code, context, { filename });
  cache.set(filename, loadedModule.exports);
  return loadedModule.exports;
}
const { validateFields, validDate, completedAge, parseDob } = load('lib/redcap-validation.ts');
const {prepStatusChoices,hivStatusChoices}=load('lib/treatment-status.ts');
const normalizeStatus=label=>label.replace('Active at PILS','Active').replace('NDCCI','NDDCI');
assert.deepEqual(prepStatusChoices.map(([,label])=>normalizeStatus(label)).sort(),hivStatusChoices.map(([,label])=>normalizeStatus(label)).sort());
for(const [field,choices] of [['ptp_status',prepStatusChoices],['pv_status_at_visit',prepStatusChoices],['htp_care_status',hivStatusChoices]]){
  assert.deepEqual(Array.from(choices,([code])=>code),schema[field].codes);
  for(const [code] of choices)assert.equal(validateFields({[field]:code}),null,`${field} accepts ${code}`);
}
assert.equal(Object.fromEntries(prepStatusChoices)['2'],'Lost to follow-up');
assert.equal(Object.fromEntries(hivStatusChoices)['2'],'Transferred to NDDCI');
assert.equal(Object.fromEntries(prepStatusChoices)['9'],'Transferred to another facility');
assert.equal(Object.fromEntries(hivStatusChoices)['9'],'Deported');

const { clinicFieldVisible, visibleClinicEnrollment, clinicEnrollmentDefaults } = load('lib/clinic-enrollment.ts');
assert.equal(clinicEnrollmentDefaults.cne_facility, 'Pils Banian');
assert.equal(clinicEnrollmentDefaults.cne_district, '1');
assert.equal(clinicFieldVisible('cne_inject_1w', { cne_inject_3m: '1' }, ''), true);
assert.equal(clinicFieldVisible('cne_inject_1w', { cne_inject_3m: '0' }, ''), false);
for (const value of ['', '0', '2']) {
  assert.equal(clinicFieldVisible('cne_inject_24h', { cne_inject_1w: value }, ''), false);
  assert.equal(clinicFieldVisible('cne_share_needle_1w', { cne_inject_1w: value }, ''), false);
  assert.equal(clinicFieldVisible('cne_share_needle_24h', { cne_inject_24h: value }, ''), false);
}
assert.equal(clinicFieldVisible('cne_inject_24h', { cne_inject_1w: '1' }, ''), true);
assert.equal(clinicFieldVisible('cne_share_needle_24h', { cne_inject_24h: '1' }, ''), true);
assert.equal(clinicFieldVisible('cne_antenatal', { cne_pregnant_now: '1' }, '1'), false);
const filteredInjection = visibleClinicEnrollment({ cne_inject_3m: '0', cne_inject_1w: '2', cne_share_needle_1w: '3', cne_sti_treated: '1' }, '', '');
assert.equal(filteredInjection.cne_inject_1w, undefined);
assert.equal(filteredInjection.cne_share_needle_1w, undefined);
assert.equal(filteredInjection.cne_sti_treated, '1');
const { clinicNextAppointment } = load('lib/clinic-followup.ts');
assert.equal(clinicNextAppointment({}), '');
assert.equal(clinicNextAppointment({ cnv_legacy_next_date: '2026-10-22' }), '2026-10-22');
assert.equal(clinicNextAppointment({ cnv_next_blood_date: '2026-12-01', cnv_next_doctor_date: '2026-11-01', cnv_next_med_date: '2026-11-20', cnv_legacy_next_date: '2026-01-01' }), '2026-11-01');
assert.equal(clinicNextAppointment({ cnv_next_blood_date: 'invalid', cnv_next_med_date: '2026-11-20' }), '2026-11-20');
assert.equal(clinicNextAppointment({ cnv_next_med_date: '2020-01-01', cnv_next_doctor_date: '2026-11-01' }), '2020-01-01');
const { prepNextAppointment } = load('lib/prep-followup.ts');
assert.equal(prepNextAppointment({ pv_visit_date: '2026-10-18' }), '');
assert.equal(prepNextAppointment({ pv_next_blood_date: '2026-12-01', pv_next_doctor_date: '2026-11-01', pv_next_med_date: '2026-11-20' }), '2026-11-01');
assert.equal(prepNextAppointment({ pv_next_blood_date: 'invalid', pv_next_med_date: '2026-11-20' }), '2026-11-20');
assert.equal(validateFields({ ce_district: '10' }), null);
assert.equal(validateFields({ hcs_care_type: '11,12,13' }), null);
assert.ok(validateFields({ htm_vl_level: '1.5' }));
assert.ok(validateFields({ ia_addiction: '30', age: '20' }));
assert.equal(validateFields({ ia_addiction: '10', age: '20' }), null);
assert.ok(validateFields({ pv_obsolete_field: 'unsaved value' }, ['pv_visit_date']));
assert.ok(validateFields({ cne_age_first_sex: '121' }));
assert.ok(validateFields({ cne_partners_1w: '1000' }));
assert.ok(validateFields({ cne_date: '2026-02-30' }));
assert.ok(validateFields({ htp_diagnosis_date: '2020-01' }));
assert.equal(validateFields({ htp_diagnosis_date: '2020-01-15' }), null);
assert.equal(validateFields({ cnv_hiv_lab_test_done: '0', cnv_hiv_lab_test_date: '' }), null);
assert.ok(validateFields({ cnv_hiv_lab_test_done: '1', cnv_hiv_lab_test_date: '' }));
assert.equal(validateFields({ hcs_status_only: '1', hcs_currently_art: '', hcs_art_status: '' }), null);
assert.ok(validateFields({ hcs_status_only: '0', hcs_currently_art: '', hcs_art_status: '' }));
assert.ok(validateFields({ cnv_next_appointment_date: '2026-10-18 25:00' }));
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
for (const [key, value] of [['ce_sw_age_started', '121'], ['oc_male_condoms', '-1'], ['ce_pwid_shared_24h', '1.5'], ['htm_cd4_level', '10000'], ['htm_vl_level', '1000000000'], ['ce_num_children', '16'], ['ce_emergency_tel', 'abc'], ['oc_date', '31/02/2026'], ['hcs_care_type', '14'], ['itp_phone', 'abc']]) assert.ok(validateFields({ [key]: value }), `${key} rejects ${value}`);
assert.equal(validateFields({ hcs_care_type: '1,9,11,12,13', htm_cd4_level: '0', htm_vl_level: '999999999', itp_notif_date: 'Within seven days', itp_phone: '123-456-7890' }), null);
assert.ok(validateFields({ ce_active: '' }));
assert.equal(validateFields({ itch_name: '', itch_gender: '' }), null);
async function post(route, body) {
  requests = [];
  return load(`app/api/redcap/${route}/route.ts`).POST(new Request('http://localhost/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
}
function imported() { return JSON.parse(requests.find(body => body.get('action') === 'import').get('data')); }
(async () => {
  const enrollment = { ce_date: '2026-09-23', ce_district: '1', ce_hotspot: '1', ce_active: '1', ce_outreach_worker: 'Tester', ce_first_name: 'Test', ce_last_name: 'Example', ce_dob: '2000-01-01', ce_gender_identity: '1', ce_vision: '2', ce_kp_type: '3,8', ce_pwid_injections_24h: '4', ce_pwid_shared_24h: '2' };
  const outreach = { oc_worker_1: 'Tester', oc_date: '2026-09-23', oc_type: '13', oc_district: '1', oc_prep_com: '1', oc_is_new_client: '1' };
  const submission = { mode: 'new', recordId: 'M01012000T_EE', enrollment, outreach, partners: [], children: [] };
  existing = [];
  assert.equal((await post('outreach', submission)).status, 200);
  const rows = imported();
  for (const key of ['ce_pwid_injections_24h', 'ce_pwid_shared_24h', 'ce_active']) assert.equal(rows[0][key], enrollment[key]);
  assert.equal(rows[1].oc_type, '13');
  assert.equal(rows[1].oc_district, '1');
  assert.equal(rows[1].oc_prep_com, '1');
  assert.equal(rows[1].sortie_type, undefined);
  for (const reason of ['', '   ']) {
    assert.equal((await post('outreach', { ...submission, outreach: { ...outreach, oc_prep_interested: '0', oc_prep_no_reason: reason } })).status, 400);
    assert.equal(requests.length, 0);
  }
  assert.equal((await post('outreach', { ...submission, outreach: { ...outreach, oc_prep_interested: '0', oc_prep_no_reason: 'Concerned about side effects' } })).status, 200);
  assert.equal(imported()[1].oc_prep_no_reason, 'Concerned about side effects');
  for (const interested of ['1', '']) {
    assert.equal((await post('outreach', { ...submission, outreach: { ...outreach, oc_prep_interested: interested, oc_prep_no_reason: 'Stale reason' } })).status, 200);
    assert.equal(imported()[1].oc_prep_no_reason, undefined);
  }
  assert.equal((await post('outreach', { ...submission, outreach: { ...outreach, oc_district: '' } })).status, 400);
  assert.equal(requests.length, 0);
  assert.equal((await post('outreach', { ...submission, outreach: { ...outreach, oc_prep_com: '' } })).status, 400);
  assert.equal(requests.length, 0);
  assert.equal((await post('outreach', { ...submission, enrollment: { ...enrollment, ce_district: '99' } })).status, 400);
  assert.equal(requests.length, 0);
  const twoMiddleNames = { ...enrollment, ce_middle_name_1: 'Alpha', ce_middle_name_2: 'Beta' };
  assert.equal((await post('outreach', { ...submission, recordId: 'M01012000TAB_EE', enrollment: twoMiddleNames })).status, 200);
  assert.equal(imported()[0].ce_middle_name_1, 'Alpha');
  assert.equal(imported()[0].ce_middle_name_2, 'Beta');
  assert.equal(imported()[0].ce_vision, '2');
  assert.equal(imported()[0].ce_kp_type___8, '1');
  const threeMiddleNames = { ...enrollment, ce_middle_name_1: 'Alpha', ce_middle_name_2: 'Beta', ce_middle_name_3: 'Charlie' };
  assert.equal((await post('outreach', { ...submission, recordId: 'M01012000TABC_EE', enrollment: threeMiddleNames })).status, 200);
  assert.equal(imported()[0].ce_middle_name_3, 'Charlie');
  assert.equal((await post('outreach', { ...submission, outreach: { ...outreach, oc_male_condoms: '100000' } })).status, 400);
  assert.equal(requests.length, 0);
  assert.equal((await post('outreach', { ...submission, outreach: { ...outreach, oc_hiv_rapid_result: '1' }, children: [{ itch_violence: '0', itch_threats: '0', itch_force_sex: '0', itch_notif_method: '1', itch_notif_date_limit: 'Within 30 days' }] })).status, 200);
  assert.equal((await post('outreach', { ...submission, enrollment: { ...enrollment, ce_kp_type: '1,3', ce_contact_method: '1,3' }, outreach: { ...outreach, oc_hiv_rapid_result: '1', oc_referrals: '1,12', oc_referral_other: 'Example' }, partners: [{ itp_name: 'Example Partner', itp_gender: '1', itp_violence: '0', itp_threats: '0', itp_forced_sex: '0', itp_notif_method: '1' }] })).status, 200);
  assert.equal(imported()[0].ce_kp_type___3, '1');
  assert.equal(imported()[0].ce_contact_method___3, '1');
  assert.equal(imported()[1].oc_referrals___12, '1');
  assert.equal(imported()[2].itp_name, 'Example Partner');
  existing = [{ uic_ori: 'TEST' }];
  const care = { hcs_navigator_1: 'Tester', hcs_date: '2026-09-23', hcs_currently_art: '0', hcs_art_status: '1', hcs_care_type: '9,10,11,12', hcs_followup_needed: '1', hcs_followup_date: '' };
  const healthcare = { mode: 'existing', recordId: 'TEST', care, monitoring: { htm_date: '2026-09-23', htm_viral_load_detectable: '2' }, newVl: true, newCd4: false, includeMonitoring: true };
  assert.equal((await post('healthcare-nav', healthcare)).status, 200);
  assert.equal(imported()[0].hcs_care_type___9, '1');
  assert.equal(imported()[0].hcs_care_type___10, '1');
  assert.equal(imported()[0].hcs_care_type___11, '1');
  assert.equal(imported()[0].hcs_care_type___12, '1');
  assert.equal(imported()[1].htm_viral_load_detectable, '2');
  const treatmentProfile = { htp_effective_date: '2026-09-23', htp_care_status: '1', htp_diagnosis_date: '2020-01-15', htp_prev_ltfu: '0', htp_art_reg_date: '2020-01-15', htp_art_reg_place: 'PILS', htp_started_abroad: '0', htp_art_start_date: '2020-01-15', htp_art_regimen: '1,12', htp_art_adherence: '1', htp_additional_medications: 'Bactrim', htp_change_reason: 'Healthcare navigation review', htp_notes: 'Profile updated' };
  assert.equal((await post('healthcare-nav', { ...healthcare, includeProfile: true, profile: treatmentProfile, monitoring: { ...healthcare.monitoring, htm_is_baseline: '1' } })).status, 200);
  assert.equal(imported()[1].redcap_repeat_instrument, 'hiv_treatment_profile');
  assert.equal(imported()[1].htp_art_regimen___1, '1');
  assert.equal(imported()[1].htp_art_regimen___12, '1');
  assert.equal(imported()[2].redcap_repeat_instrument, 'hiv_clinical_monitoring');
  assert.equal(imported()[2].htm_is_baseline, '1');
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
  existing = [];
  const prepProfile = { ptp_start_date: '2026-09-23', ptp_primary_reason: 'Prevention', ptp_previous_use: '0', ptp_previous_provider: '', ptp_status: '1', ptp_ltfu: '0', ptp_effective_date: '2026-09-23', ptp_recorded_by: 'Tester', ptp_change_reason: '' };
  const prepVisit = { pv_visit_date: '2026-09-23', pv_visit_purpose: '2,3', pv_worker_1: 'Tester', pv_worker_2: 'Second worker', pv_followup_stage: '0', pv_next_doctor_date: '2026-09-23', pv_doctor: 'Dr Test', pv_medication: '1', pv_medication_dispensed: '30', pv_prescription_months: '1', pv_status_at_visit: '1' };
  assert.equal((await post('prep', { mode: 'new', recordId: submission.recordId, enrollment, profile: prepProfile, includeProfile: true, visit: prepVisit })).status, 200);
  assert.equal(imported()[1].redcap_repeat_instrument, 'prep_treatment_profile');
  assert.equal(imported()[1].redcap_repeat_instance, '1');
  assert.equal(imported()[2].redcap_repeat_instrument, 'prep_visit');
  assert.equal(imported()[2].pv_medication_dispensed, '30');
  assert.equal(imported()[2].pv_visit_purpose___2, '1');
  assert.equal(imported()[2].pv_visit_purpose___3, '1');
  assert.equal(imported()[2].pv_profile_updated, '1');
  assert.equal(imported()[2].pv_worker_1, 'Tester');
  assert.equal(imported()[2].pv_worker_2, 'Second worker');
  existing = [{ uic_ori: 'TEST' }, { uic_ori: 'TEST', redcap_repeat_instrument: 'prep_treatment_profile', redcap_repeat_instance: '2', ...prepProfile }, { uic_ori: 'TEST', redcap_repeat_instrument: 'prep_visit', redcap_repeat_instance: '3', ...prepVisit }];
  assert.equal((await post('prep', { mode: 'existing', recordId: 'TEST', includeProfile: false, visit: { ...prepVisit, pv_visit_date: '2026-10-03' } })).status, 200);
  assert.equal(imported().length, 1);
  assert.equal(imported()[0].redcap_repeat_instance, '4');
  assert.equal((await post('prep', { mode: 'existing', recordId: 'TEST', includeProfile: false, visit: { ...prepVisit, pv_worker_1: '', pv_worker_2: '', pv_visit_date: '2026-10-03' } })).status, 200);
  assert.equal((await post('prep', { mode: 'existing', recordId: 'TEST', includeProfile: true, profile: { ...prepProfile, ptp_status: '2', ptp_effective_date: '2026-10-03', ptp_change_reason: 'Follow-up status changed' }, visit: { ...prepVisit, pv_visit_date: '2026-10-03' } })).status, 200);
  assert.equal(imported()[0].redcap_repeat_instrument, 'prep_treatment_profile');
  assert.equal(imported()[0].redcap_repeat_instance, '3');
  assert.equal(imported()[0].ptp_ltfu, undefined);
  assert.equal(imported()[0].ptp_status, undefined);
  existing = [{ uic_ori: 'TEST' }, { uic_ori: 'TEST', redcap_repeat_instrument: 'hiv_treatment_profile', redcap_repeat_instance: '1', htp_art_start_date: '2020-01-01', htp_art_regimen___1: '1' }];
  const arvVisit = { cnv_weight: '65.5', cnv_bp_systolic: '120', cnv_bp_diastolic: '80', cnv_doctor: 'Doctor Example', cnv_doctor_comments: 'Review completed', cnv_worker_1: 'Tester', cnv_worker_2: 'Second worker', cnv_worker_3: 'Third worker', cnv_worker_4: 'Fourth worker', cnv_date: '2026-10-04', cnv_visit_purpose: '4,9', cnv_medication_supplied: '1,2,10', cnv_art_prescription_months: '3', cnv_next_med_date: '2027-01-04', cnv_blood_collected: '1', cnv_syphilis_referral: '1', cnv_syphilis_refer_where: 'PILS clinic', cnv_hcv_reported: '1', cnv_hcv_treat: '1', cnv_hcv_vl_date: '2026-10-03', cnv_hcv_vl_result: 'Not detected', cnv_hbv_vaccination_status: '1', cnv_gbv_screen: '1', cl_gbv_refer: '1', cnv_gbv_refer_where: 'Partner organisation', cnv_alcohol_screen: '1', cnv_alcohol_refer: '1', cnv_alcohol_refer_where: 'Counselling service', cnv_ost_screen: '1', cnv_ost_refer: '1', cnv_ost_refer_where: 'Methadone centre', cnv_cervical_screen: '1', cnv_cervical_refer: '1', cnv_cervical_refer_where: 'Hospital', cnv_abscess_screen: '1', cnv_abscess_refer: '1', cnv_abscess_refer_where: 'Clinic', cnv_other_screen: '1', cnv_other_refer: '1', cnv_other_refer_where: 'Other facility' };
  Object.assign(arvVisit, { cnv_complaints: 'Routine review', cnv_referred_by: '2', cnv_exam_done: '1', cnv_exam_findings: 'Stable', cnv_hiv_reported: '1', cnv_hiv_lab_test_done: '1', cnv_hiv_lab_test_date: '2026-10-03', cnv_hiv_lab_result_received: '1', cnv_hiv_lab_result: '2', cnv_hbv_reported: '2', cnv_hbv_lab_test_done: '1', cnv_hbv_lab_test_date: '2026-10-03', cnv_hbv_lab_result_received: '1', cnv_hbv_lab_result: '2', cnv_hbv_treat: '0', cnv_syp_reported: '2', cnv_syp_lab_test_done: '1', cnv_syp_lab_test_date: '2026-10-03', cnv_syp_lab_result_received: '1', cnv_syp_lab_result: '2', cnv_sti_syndrome: '1,8', cnv_sti_screened: '1', cnv_sti_treatment: 'Counselling', cnv_sti_treated: '1', cnv_fp_counselling: '1', cnv_post_abortion: '0', cnv_risk_reduction: '1', cnv_condom_demo: '1', cnv_num_male_condoms: '12', cnv_num_female_condoms: '4', cnv_num_lube: '12', cnv_num_hiv_selftest_kits: '2', cnv_num_needles: '5', cnv_lab_ref: '1', cnv_lab_tests: '2,3,4', cnv_lab_location: 'Central laboratory', cnv_other_fac_ref: '1', cnv_other_facility: 'Regional hospital', cnv_next_appointment_date: '2026-11-04', cnv_next_reason: 'Review' });
  const arvMonitoring = { htm_date: '2026-10-04', htm_is_baseline: '0', htm_art_status: '1', htm_cd4_date: '2026-10-03', htm_cd4_level: '450' };
  assert.equal((await post('clinic', { mode: 'existing', recordId: 'TEST', includeProfile: false, visit: arvVisit, includeMonitoring: true, monitoring: arvMonitoring })).status, 200);
  assert.equal(imported()[0].redcap_repeat_instrument, 'clinic_visit');
  assert.equal(imported()[0].cnv_visit_purpose___9, '1');
  assert.equal(imported()[0].cnv_medication_supplied___2, '1');
  assert.equal(imported()[0].cnv_medication_supplied___10, '1');
  assert.equal(imported()[0].cnv_hcv_vl_result, 'Not detected');
  assert.equal(imported()[0].cnv_blood_collected, '1');
  assert.equal(imported()[0].cnv_syphilis_refer_where, 'PILS clinic');
  assert.equal(imported()[0].cnv_gbv_refer_where, 'Partner organisation');
  assert.equal(imported()[0].cnv_other_refer_where, 'Other facility');
  assert.equal(imported()[0].cnv_is_new_client, '0');
  assert.equal(imported()[0].cnv_hiv_lab_result, '2');
  assert.equal(imported()[0].cnv_sti_syndrome___8, '1');
  assert.equal(imported()[0].cnv_lab_tests___4, '1');
  assert.equal(imported()[0].cnv_other_facility, 'Regional hospital');
  assert.equal(imported()[1].redcap_repeat_instrument, 'hiv_clinical_monitoring');
  assert.equal(imported()[1].htm_is_baseline, '0');
  const clinicAnswers = { cne_date: '2026-10-11', cne_pregnancies: '2', cne_pregnant_now: '1', cne_antenatal: '1', cne_num_children: '1', cne_contraception_type: '5', cne_violence_3m: '1', cne_violence_help: '1', cne_violence_perpetrator: '2,99', cne_violence_perpetrator_other: 'Other perpetrator', cne_violence_help_source: '1,8,99', cne_violence_help_source_other: 'Other source', cne_hiv_prev_test: '1', cne_hiv_prev_result: '1', cne_hiv_prev_result_disclosed: '1', cne_hiv_disclosure_recipient: '1,3,99', cne_hiv_disclosure_recipient_other: 'Other recipient' };
  for (const sex of ['1', '2', '3', '9', '']) {
    existing = [{ uic_ori: 'TEST', ce_sex_assigned_birth: sex }];
    assert.equal((await post('clinic', { mode: 'existing', recordId: 'TEST', includeClinicEnrollment: true, clinicEnrollment: clinicAnswers, visit: arvVisit })).status, 200);
    const base = imported()[0];
    assert.equal(base.cne_pregnancies, sex === '2' ? '2' : undefined);
    assert.equal(base.cne_antenatal, sex === '2' ? '1' : undefined);
    assert.equal(base.cne_contraception_type___5, sex === '2' ? '1' : undefined);
    assert.equal(base.cne_violence_perpetrator___2, '1');
    assert.equal(base.cne_violence_perpetrator___99, '1');
    assert.equal(base.cne_violence_help_source___8, '1');
    assert.equal(base.cne_hiv_disclosure_recipient___3, '1');
    assert.equal(base.cne_hiv_disclosure_recipient_other, 'Other recipient');
  }
  existing = [{ uic_ori: 'TEST', ce_sex_assigned_birth: '1' }];
  assert.equal((await post('clinic', { mode: 'existing', recordId: 'TEST', enrollment: { ce_sex_assigned_birth: '2' }, includeClinicEnrollment: true, clinicEnrollment: { ...clinicAnswers, cne_violence_3m: '0', cne_hiv_prev_result_disclosed: '0' }, visit: arvVisit })).status, 200);
  assert.equal(imported()[0].ce_sex_assigned_birth, undefined);
  assert.equal(imported()[0].cne_pregnancies, undefined);
  assert.equal(imported()[0].cne_violence_perpetrator___2, undefined);
  assert.equal(imported()[0].cne_violence_help_source___1, undefined);
  assert.equal(imported()[0].cne_hiv_disclosure_recipient___1, undefined);
  existing = [{ uic_ori: 'TEST' }];
  assert.equal((await post('clinic', { mode: 'existing', recordId: 'TEST', enrollment: { ce_sex_assigned_birth: '2' }, includeClinicEnrollment: true, clinicEnrollment: { ...clinicAnswers, cne_pregnant_now: '0', cne_violence_help: '0', cne_hiv_prev_test: '0' }, visit: arvVisit })).status, 200);
  assert.equal(imported()[0].ce_sex_assigned_birth, undefined);
  assert.equal(imported()[0].cne_pregnancies, undefined);
  assert.equal(imported()[0].cne_antenatal, undefined);
  assert.equal(imported()[0].cne_violence_help_source___1, undefined);
  assert.equal(imported()[0].cne_hiv_disclosure_recipient___1, undefined);
  assert.equal((await post('clinic', { mode: 'existing', recordId: 'TEST', includeClinicEnrollment: true, clinicEnrollment: { ...clinicAnswers, cne_violence_perpetrator: '100' }, visit: arvVisit })).status, 400);
  existing = [{ uic_ori: 'TEST', ce_sex_assigned_birth: '2', ce_dob: '2000-01-01' }];
  const identityLookup = await (await load('app/api/redcap/clinic/route.ts').GET(new Request('http://localhost/api?uic=TEST'))).json();
  assert.equal(identityLookup.clientIdentity.ce_sex_assigned_birth, '2');
  assert.equal(identityLookup.clientIdentity.ce_dob, '2000-01-01');
  assert.ok(requests.some(body => body.get('forms[5]') === 'clinic_enrollment'));
  existing = [{ uic_ori: 'TEST', cne_date: '2026-10-01' }];
  assert.equal((await post('clinic', { mode: 'existing', recordId: 'TEST', includeClinicEnrollment: true, clinicEnrollment: clinicAnswers, visit: arvVisit })).status, 409);
  assert.ok(requests.every(body => body.get('action') !== 'import'));

  existing = [{ uic_ori: 'TEST' }, { uic_ori: 'TEST', redcap_repeat_instrument: 'hiv_treatment_profile', redcap_repeat_instance: '1', htp_art_start_date: '2020-01-01', htp_art_regimen___1: '1' }];
  existing = [{ uic_ori: 'TEST' }];
  const stiSubmission = { mode: 'existing', recordId: 'TEST', includeClinicEnrollment: true, clinicEnrollment: { cne_date: '2026-10-11', cne_sti_diagnosed: '1,3,99', cne_sti_diagnosed_other: 'Other diagnosed infection' }, visit: arvVisit };
  assert.equal((await post('clinic', stiSubmission)).status, 200);
  assert.equal(imported()[0].cne_sti_diagnosed___1, '1');
  assert.equal(imported()[0].cne_sti_diagnosed___3, '1');
  assert.equal(imported()[0].cne_sti_diagnosed___99, '1');
  assert.equal(imported()[0].cne_sti_diagnosed_other, 'Other diagnosed infection');
  for (const selection of ['0', '98', '2,12,17']) {
    assert.equal((await post('clinic', { ...stiSubmission, clinicEnrollment: { ...stiSubmission.clinicEnrollment, cne_sti_diagnosed: selection } })).status, 200);
    assert.equal(imported()[0].cne_sti_diagnosed_other, undefined);
  }
  for (const selection of ['0,1', '98,3', '0,98', '100']) {
    assert.equal((await post('clinic', { ...stiSubmission, clinicEnrollment: { ...stiSubmission.clinicEnrollment, cne_sti_diagnosed: selection } })).status, 400);
    assert.equal(requests.length, 0);
  }
  for (const kpTypes of [[], ['1'], ['2'], ['1', '2'], ['5'], ['3', '8']]) {
    existing = [{ uic_ori: 'TEST', ...Object.fromEntries(kpTypes.map(code => [`ce_kp_type___${code}`, '1'])) }];
    const lookup = await (await load('app/api/redcap/clinic/route.ts').GET(new Request('http://localhost/api?uic=TEST'))).json();
    assert.equal(lookup.clientIdentity.ce_kp_type, kpTypes.join(','));
    assert.equal((await post('clinic', { mode: 'existing', recordId: 'TEST', enrollment: { ce_kp_type: '2' }, includeClinicEnrollment: true, clinicEnrollment: { cne_date: '2026-10-11', cne_msm_sex_type: '1,3' }, visit: arvVisit })).status, 200);
    assert.equal(imported()[0].cne_msm_sex_type___1, kpTypes.includes('2') ? '1' : undefined);
    assert.equal(imported()[0].cne_msm_sex_type___3, kpTypes.includes('2') ? '1' : undefined);
  }
  existing = [{ uic_ori: 'TEST' }, { uic_ori: 'TEST', redcap_repeat_instrument: 'hiv_treatment_profile', redcap_repeat_instance: '1', htp_art_start_date: '2020-01-01', htp_art_regimen___1: '1' }];
  const changedCareProfile = { htp_effective_date: '2026-10-04', htp_care_status: '2', htp_care_facility: 'NDDCI', htp_change_reason: 'Transferred for continued care', htp_started_abroad: '0', htp_art_start_date: '2020-01-01', htp_art_regimen: '1,12', htp_additional_medications: 'Bactrim' };
  assert.equal((await post('clinic', { mode: 'existing', recordId: 'TEST', includeProfile: true, profile: changedCareProfile, visit: arvVisit, includeMonitoring: false })).status, 200);
  assert.equal(imported()[0].redcap_repeat_instrument, 'hiv_treatment_profile');
  assert.equal(imported()[0].redcap_repeat_instance, '2');
  assert.equal(imported()[0].htp_care_status, undefined);
  assert.equal(imported()[0].htp_care_facility, undefined);
  assert.equal(imported()[0].htp_art_regimen___12, '1');
  assert.equal((await post('clinic', { mode: 'existing', recordId: 'TEST', visit: arvVisit, statusChanges: { hiv: '8', hivOriginal: '', reason: 'Moved abroad' } })).status, 200);
  assert.equal(imported()[0].redcap_repeat_instrument, 'hiv_care_support');
  assert.equal(imported()[0].hcs_care_status, '8');
  assert.equal(imported()[0].hcs_status_only, '1');
  assert.equal(imported()[0].hcs_status_date, arvVisit.cnv_date);
  assert.equal(imported().some(row => row.redcap_repeat_instrument === 'hiv_treatment_profile'), false);
  assert.equal((await post('clinic', { mode: 'existing', recordId: 'TEST', visit: arvVisit, statusChanges: { hiv: '8', hivOriginal: '1' } })).status, 409);
  assert.equal((await post('clinic', { mode: 'existing', recordId: 'TEST', visit: arvVisit, statusChanges: { prep: '5' } })).status, 409);
  existing.push({ uic_ori: 'TEST', redcap_repeat_instrument: 'hiv_care_support', redcap_repeat_instance: 5, hcs_care_status: '8', hcs_status_date: arvVisit.cnv_date });
  assert.equal((await post('clinic', { mode: 'existing', recordId: 'TEST', visit: arvVisit, statusChanges: { hiv: '8', hivOriginal: '8' } })).status, 200);
  assert.equal(imported().length, 1);
  assert.equal(imported()[0].redcap_repeat_instrument, 'clinic_visit');

  assert.equal((await post('clinic', { mode: 'existing', recordId: 'TEST', includeClientStatus: true, clientStatus: { ce_active: '0', ce_vital_status: '2', ce_exit_date: '2026-10-04', ce_exit_reason: 'Confirmed deceased' }, includeProfile: false, visit: arvVisit, includeMonitoring: false })).status, 200);
  assert.equal(imported()[0].ce_vital_status, '2');
  assert.equal(imported()[0].ce_active, '0');
  assert.equal(imported()[0].ce_exit_date, '2026-10-04');
  existing = [{ uic_ori: 'TEST' }];
  const labResults = { pv_hbv_result: '1', pv_hb_result: '13.5 g/dL', pv_cholesterol_result: '4.8 mmol/L', pv_triglycerides_result: '1.1 mmol/L', pv_tpha_result: 'Reactive', pv_vdrl_result: '1:8', pv_other_test_result: 'Other assay: not detected' };
  const nextPrepVisit = { ...labResults, pv_worker_2: 'Second worker', pv_visit_date: '2026-10-18', pv_worker_1: 'Tester', pv_visit_purpose: '2', pv_doctor: 'Doctor Name', pv_doctor_comments: 'Visit notes', pv_next_blood_date: '2026-12-01', pv_next_doctor_date: '2026-11-01', pv_next_med_date: '2026-11-20', pv_next_appointment_date: '2026-10-18' };
  assert.equal((await post('clinic', { mode: 'existing', recordId: 'TEST', visitWorkflow: 'PREP', prepVisit: nextPrepVisit })).status, 200);
  assert.equal(imported().length, 1);
  assert.equal(imported()[0].pv_next_appointment_date, '2026-11-01');
  assert.equal(imported()[0].pv_next_doctor_date, '2026-11-01');
  assert.equal(imported()[0].pv_doctor, 'Doctor Name');
  assert.equal(imported()[0].pv_doctor_comments, 'Visit notes');
  assert.equal(imported()[0].pv_worker_2, 'Second worker');
  for (const [field, value] of Object.entries(labResults)) assert.equal(imported()[0][field], value);
  assert.equal((await post('clinic', { mode: 'existing', recordId: 'TEST', visitWorkflow: 'BOTH', visit: arvVisit, prepVisit: { ...nextPrepVisit, pv_next_blood_date: '', pv_next_doctor_date: '', pv_next_med_date: '' } })).status, 200);
  assert.equal(imported().find(row => row.redcap_repeat_instrument === 'prep_visit').pv_next_appointment_date, undefined, 'No next date is invented from the current visit');
  existing = [{ uic_ori: 'TEST' }, { uic_ori: 'TEST', redcap_repeat_instrument: 'clinic_visit', redcap_repeat_instance: '8' }, { uic_ori: 'TEST', redcap_repeat_instrument: 'prep_visit', redcap_repeat_instance: '3' }];
  const isolatedPrep = { pv_visit_date: '2026-10-14', pv_worker_1: 'Tester', pv_visit_purpose: '4' };
  assert.equal((await post('clinic', { mode: 'existing', recordId: 'TEST', visitWorkflow: 'PREP', prepVisit: isolatedPrep })).status, 200);
  assert.equal(imported().length, 1);
  assert.equal(imported()[0].redcap_repeat_instrument, 'prep_visit');
  assert.equal(imported()[0].redcap_repeat_instance, '4');
  assert.equal(imported()[0].pv_visit_purpose___4, '1');
  assert.equal((await post('clinic', { mode: 'existing', recordId: 'TEST', visitWorkflow: 'BOTH', visit: arvVisit, prepVisit: isolatedPrep })).status, 200);
  assert.deepEqual(imported().map(row => row.redcap_repeat_instrument), ['clinic_visit', 'prep_visit']);
  assert.equal(imported()[0].redcap_repeat_instance, '9');
  assert.equal(imported()[1].pv_visit_purpose___4, '1');
  assert.equal(imported()[0].cnv_visit_purpose___9, '1');
  assert.equal(Object.keys(imported()[0]).some(field => field.startsWith('pv_')), false);
  assert.equal(Object.keys(imported()[1]).some(field => field.startsWith('cnv_')), false);
  assert.equal((await post('clinic', { mode: 'existing', recordId: 'TEST', visitWorkflow: 'CLINIC', visit: arvVisit, prepVisit: isolatedPrep })).status, 200);
  assert.deepEqual(imported().map(row => row.redcap_repeat_instrument), ['clinic_visit']);
  assert.equal((await post('clinic', { mode: 'existing', recordId: 'TEST', visitWorkflow: 'BOTH', prepVisit: isolatedPrep })).status, 400);
  assert.equal((await post('clinic', { mode: 'existing', recordId: 'TEST', visitWorkflow: 'PREP', prepVisit: { ...isolatedPrep, pv_visit_purpose: '1' } })).status, 400);
  assert.equal((await post('clinic', { mode: 'existing', recordId: 'TEST', visitWorkflow: 'CLINIC', visit: { ...arvVisit, cnv_visit_purpose: '6' } })).status, 400);
  assert.equal((await post('clinic', { mode: 'existing', recordId: 'TEST', visitWorkflow: 'CLINIC', visit: { ...arvVisit, cnv_visit_purpose: '12,13' } })).status, 200);
  existing = [{ uic_ori: 'TEST', ce_first_name: 'Test', ce_middle_name_1: 'Alpha', ce_middle_name_2: 'Beta', ce_middle_name_3: 'Charlie', ce_last_name: 'Example', ce_tel_primary: '123-456-7890', ce_gender_identity: '1', ce_kp_type___3: '1', ce_kp_type___8: '1' }];
  const patients = await (await load('app/api/redcap/patients/route.ts').GET()).json();
  assert.equal(patients[0].middle_name, 'Alpha Beta Charlie');
  assert.equal(patients[0].display_name, 'Test Alpha Beta Charlie Example');
  assert.equal(patients[0].phone, '123-456-7890');
  assert.deepEqual(patients[0].kp_types, ['3', '8']);
  existing.push({ uic_ori: 'TEST', redcap_repeat_instrument: 'outreach_contact', redcap_repeat_instance: '1', oc_date: '2026-09-23', oc_hiv_status_prev: '3', oc_hiv_rapid_result: '2', oc_syp_status_prev: '3', oc_syringes: '7', oc_num_needles: '9', oc_male_condoms: '12' });
  existing.push({ uic_ori: 'TEST', redcap_repeat_instrument: 'clinic_visit', redcap_repeat_instance: '1', cnv_hiv_lab_test_date: '2026-09-24', cnv_hiv_lab_result: '1' });
  const dashboard = await (await load('app/api/redcap/dashboard/route.ts').GET(new Request('http://localhost/api?period=all'))).json();
  assert.equal(dashboard.rapid.totals.hiv, 1);
  assert.equal(dashboard.rapid.outcomes.hiv.negative, 1);
  assert.equal(dashboard.rapid.firstTime.hiv, 1);
  assert.equal(dashboard.rapid.firstTime.syphilis, 0);
  assert.equal(dashboard.lab.outcomes.hiv.positive, 1);
  assert.equal(dashboard.commodities.totals.syringes, 7);
  assert.equal(dashboard.commodities.totals.needles, 9);
  assert.equal(dashboard.summary.clients, 1);
  assert.deepEqual(dashboard.trend.labels, ['2026-09']);
  const filteredDashboard = await (await load('app/api/redcap/dashboard/route.ts').GET(new Request('http://localhost/api?period=all&gender=1&kp=3'))).json();
  assert.equal(filteredDashboard.rapid.totals.hiv, 1);
  const multiFilteredDashboard = await (await load('app/api/redcap/dashboard/route.ts').GET(new Request('http://localhost/api?period=all&gender=1,2&kp=1,3'))).json();
  assert.equal(multiFilteredDashboard.rapid.totals.hiv, 1);
  assert.deepEqual(multiFilteredDashboard.filters.genders, ['1', '2']);
  assert.deepEqual(multiFilteredDashboard.filters.kps, ['1', '3']);
  const excludedDashboard = await (await load('app/api/redcap/dashboard/route.ts').GET(new Request('http://localhost/api?period=all&gender=2&kp=3'))).json();
  assert.equal(excludedDashboard.rapid.totals.hiv, 0);
  assert.equal((await load('app/api/redcap/dashboard/route.ts').GET(new Request('http://localhost/api?gender=invalid'))).status, 400);
  for (const route of ['outreach', 'healthcare-nav']) {
    const lookup = await (await load(`app/api/redcap/${route}/route.ts`).GET(new Request('http://localhost/api?uic=TEST'))).json();
    assert.equal(lookup.exists, true);
  }
  console.log('REDCap field validation and mocked submission regression checks passed. No network requests made.');
})().catch(error => { console.error(error); process.exitCode = 1; });
