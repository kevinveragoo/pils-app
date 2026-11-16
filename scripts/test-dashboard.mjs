import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const loaded = { exports: {} };
const source = ts.transpileModule(fs.readFileSync('lib/dashboard.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(source, { module: loaded, exports: loaded.exports, Intl, Date });
const { buildDashboard, rangeFor, dashboardFields } = loaded.exports;
const schema = JSON.parse(fs.readFileSync('scripts/fixtures/redcap-schema.json', 'utf8'));
for (const field of dashboardFields) assert.ok(schema[field], `Unknown dashboard export field: ${field}`);
const filters = { period: 'day', genders: [], kps: [] };
const now = new Date('2026-10-23T20:30:00Z'); // 24 October, 00:30 in Mauritius.
const build = (rows, options = {}, clock = now) => JSON.parse(JSON.stringify(buildDashboard(rows, { ...filters, ...options }, clock)));
assert.equal(rangeFor('day', now).end, '2026-10-24');
assert.equal(rangeFor('day', new Date('2026-10-23T19:59:59Z')).end, '2026-10-23');
assert.equal(rangeFor('week', now).start, '2026-10-18');
assert.equal(rangeFor('month', new Date('2026-03-31T10:00:00Z')).start, '2026-02-28');
assert.equal(rangeFor('quarter', new Date('2026-05-31T10:00:00Z')).start, '2026-02-28');
assert.equal(rangeFor('year', new Date('2024-02-29T10:00:00Z')).start, '2023-02-28');
const identity = { uic_ori: 'CLIENT', ce_gender_identity: '1', ce_kp_type___1: '1', ce_kp_type___3: '1' };
const clinic = { uic_ori: 'CLIENT', redcap_repeat_instrument: 'clinic_visit', cnv_date: '2026-10-24', cnv_visit_purpose___3: '1', cnv_visit_purpose___16: '1', cnv_hiv_lab_test_done: '1', cnv_hiv_lab_test_date: '2026-10-24', cnv_hiv_lab_result: '1', cnv_num_male_condoms: '25' };
const prep = { uic_ori: 'CLIENT', redcap_repeat_instrument: 'prep_visit', pv_visit_date: '2026-10-24', pv_blood_collected_date: '2026-10-24', pv_hiv_result: '2', pv_hcv_result: '1', pv_hbv_result: '3', pv_syphilis_result: 'non-reactive' };
let data = build([identity, clinic, prep]);
assert.equal(data.lab.totals.hiv, 1);
assert.equal(data.lab.outcomes.hiv.positive, 0);
assert.equal(data.lab.outcomes.hiv.negative, 0);
assert.equal(data.lab.outcomes.hiv.conflicting, 1);
assert.equal(data.lab.outcomes.hcv.positive, 1);
assert.equal(data.lab.outcomes.hbv.indeterminate, 1);
assert.equal(data.lab.outcomes.syphilis.negative, 1);
assert.equal(data.summary.labEncounters, 1);
assert.equal(data.summary.clients, 1, 'Same person across instruments counts once');
assert.equal(data.commodities.totals.maleCondoms, 25);
assert.equal(data.trend.laboratory.reduce((sum, value) => sum + value, 0), 4);
for (const field of ['pv_hiv_result','pv_hcv_result','pv_hbv_result']) {
  for (const code of ['5','99']) {
    const result = build([{ ...prep, pv_hiv_result: '', pv_hcv_result: '', pv_hbv_result: '', pv_syphilis_result: '', [field]: code }]);
    assert.equal(result.summary.labEncounters, 0, 'Unavailable/not requested/unknown code is not a result');
  }
}
for (const [field,infection] of [['pv_hiv_result','hiv'],['pv_hbv_result','hbv'],['pv_hcv_result','hcv']]) for(const [code,outcome] of [['1','positive'],['2','negative'],['3','indeterminate'],['4','invalid']]) assert.equal(build([{...prep,[field]:code}]).lab.outcomes[infection][outcome],1);
assert.equal(build([{...prep,pv_hiv_lab_test_date:'2026-10-23'}]).lab.totals.hiv,0,'Per-test date takes precedence');
assert.equal(build([{...prep,pv_blood_collected_date:'2026-10-23',pv_hiv_lab_test_date:'2026-10-24'}]).lab.totals.hiv,1);
assert.equal(build([{...prep,pv_hiv_lab_test_date:'invalid'}]).lab.totals.hiv,0,'Invalid preferred date does not fall back');
assert.equal(build([{...prep,pv_hiv_lab_test_done:'0'}]).lab.totals.hiv,0);
assert.equal(build([{...prep,pv_visit_purpose___1:'1',pv_visit_purpose___4:'0'}]).summary.labEncounters,0);
assert.equal(build([{...prep,pv_visit_purpose___4:'1'}]).summary.labEncounters,1);
for (const text of ['1:8', 'TPHA reactive, RPR negative']) {
  data = build([{ ...prep, pv_syphilis_result: text }]);
  assert.equal(data.lab.outcomes.syphilis.unclassified, 1, 'Free-text titres/numeric values are never guessed positive');
}
for (const [code, outcome] of [['1','positive'],['2','negative'],['3','indeterminate'],['4','invalid']]) assert.equal(build([{ ...prep, pv_syphilis_result: code }]).lab.outcomes.syphilis[outcome], 1, 'PrEP syphilis uses CNV codes');
for (const text of ['pending', 'Not requested', 'Result unavailable', '']) assert.equal(build([{ ...prep, pv_syphilis_result: text }]).lab.totals.syphilis, 0);
assert.equal(build([{ ...prep, pv_blood_collected_date: '' }]).lab.totals.hiv, 1, 'Missing collection date falls back to visit');
assert.equal(build([{ ...prep, pv_blood_collected_date: '2026-10-23' }]).lab.totals.hiv, 0, 'Collection date takes precedence');
assert.equal(build([{ ...prep, pv_blood_collected_date: 'invalid' }]).lab.totals.hiv, 0, 'Invalid collection date must not fall back');
assert.equal(build([{ ...clinic, cnv_no_show: '1' }]).summary.clients, 0, 'No-shows contribute neither tests nor commodities');
assert.equal(build([{ ...clinic, cnv_hiv_lab_test_done: '0' }]).lab.totals.hiv, 0);
assert.equal(build([{ ...clinic, cnv_visit_purpose___3: '0', cnv_visit_purpose___16: '1' }]).lab.totals.hiv, 0);
assert.equal(build([{ ...clinic, cnv_visit_purpose___3: '1', cnv_visit_purpose___16: '0' }]).commodities.totals.maleCondoms, 0);
assert.equal(build([{ uic_ori: 'CLIENT', redcap_repeat_instrument: 'hiv_care_support', hcs_date: '2026-10-24', hcs_status_only: '1', hcs_num_male_condoms: '40' }]).summary.commodityUnits, 0);
assert.equal(build([{ ...clinic, redcap_repeat_instrument: 'outreach_contact' }]).summary.clients, 0, 'Do not read fields from the wrong repeat instrument');
assert.equal(build([{ uic_ori: 'CLIENT', cnv_hiv_lab_test_date: '2026-10-24', cnv_hiv_lab_result: '2' }]).lab.totals.hiv, 1, 'Legacy rows without purpose/flags are retained');
for (const date of ['', 'invalid', '2026-02-30', '2099-01-01', '2026-10-25']) {
  data = build([{ ...clinic, cnv_hiv_lab_test_date: date, cnv_date: date }], { period: 'all' });
  assert.equal(data.summary.clients, 0, `Invalid/future dates excluded even in All time: ${date}`);
}
const outreach = { uic_ori: 'CLIENT', redcap_repeat_instrument: 'outreach_contact', oc_date: '2026-10-24', oc_hiv_status_prev: '3', oc_hiv_rapid_result: '2' };
data = build([identity, outreach, { ...outreach, oc_date: '2026-10-22' }], { period: 'week' });
assert.deepEqual(data.trend.labels, ['2026-10-18','2026-10-19','2026-10-20','2026-10-21','2026-10-22','2026-10-23','2026-10-24']);
assert.deepEqual(data.trend.rapid, [0,0,0,0,1,0,1]);
assert.equal(data.rapid.firstTime.hiv, 2);
assert.equal(build([identity, outreach], { genders: ['2'] }).summary.clients, 0);
assert.equal(build([identity, outreach], { kps: ['2','3'] }).summary.clients, 1, 'KP selections use membership union');
assert.equal(build([identity, outreach], { genders: ['1'], kps: ['2'] }).summary.clients, 0, 'Different filter dimensions intersect');
assert.equal(build([{ ...outreach, oc_hiv_rapid_result: '99' }]).rapid.totals.hiv, 0);
assert.deepEqual(build([{ ...outreach, oc_date: '2026-08-12' }, outreach], { period: 'all' }).trend.labels, ['2026-08','2026-09','2026-10']);
assert.equal(build([{ ...clinic, cnv_num_male_condoms: '2.5' }]).commodities.totals.maleCondoms, 0);
// Distinctness is patient + infection + method + day, before all aggregation.
const justPrepHiv={...prep,pv_hcv_result:'',pv_hbv_result:'',pv_syphilis_result:'',pv_hiv_result:'1',pv_hiv_lab_test_date:'2026-10-24'};
const copies=[clinic,{...clinic,redcap_repeat_instance:'7'},justPrepHiv,{...justPrepHiv,redcap_repeat_instance:'8'}];
data=build(copies);
assert.equal(data.lab.totals.hiv,1);assert.equal(data.lab.outcomes.hiv.positive,1);assert.equal(data.lab.outcomes.hiv.conflicting,0);assert.equal(data.summary.labEncounters,1);assert.equal(data.trend.laboratory.reduce((a,b)=>a+b,0),1);
assert.deepEqual(build([...copies].reverse()).lab,data.lab,'Source order never changes aggregation');
for(const outcome of ['2','3','4']) {
 const rows=[...copies,{...justPrepHiv,pv_hiv_result:outcome}];
 const report=build(rows);
 assert.equal(report.lab.totals.hiv,1);assert.equal(report.lab.outcomes.hiv.conflicting,1);assert.equal(report.lab.outcomes.hiv.positive,0);
 assert.equal(Object.values(report.lab.outcomes.hiv).reduce((a,b)=>a+b,0),report.lab.totals.hiv);
 assert.deepEqual(build(rows.reverse()).lab,report.lab);
}
assert.equal(build([...copies,{...justPrepHiv,pv_hiv_lab_test_done:'0',pv_hiv_result:'2'}]).lab.outcomes.hiv.conflicting,0,'Excluded copies cannot create conflicts');
assert.equal(build([...copies,{...justPrepHiv,pv_visit_purpose___1:'1',pv_hiv_result:'2'}]).lab.outcomes.hiv.conflicting,0);
assert.equal(build([...copies,{...justPrepHiv,uic_ori:'OTHER'}]).lab.totals.hiv,2,'Different people remain distinct');
assert.equal(build([...copies,{...justPrepHiv,pv_hiv_lab_test_date:'2026-10-23'}],{period:'week'}).lab.totals.hiv,2,'Different days remain distinct');
assert.equal(build([...copies,{...justPrepHiv,pv_hiv_lab_test_date:'2026-10-23'}],{period:'week'}).summary.labEncounters,2);
const labDates=build([{...justPrepHiv,pv_hcv_result:'2',pv_hcv_lab_test_date:'2026-10-23'}],{period:'week'});
assert.equal(labDates.summary.labEncounters,2,'One repeat row can contain tests on two dates');
const rapidCopies=build([outreach,{...outreach,redcap_repeat_instance:'2'},...copies]);
assert.equal(rapidCopies.rapid.totals.hiv,1);assert.equal(rapidCopies.rapid.firstTime.hiv,1);assert.equal(rapidCopies.lab.totals.hiv,1,'Rapid and lab tests remain separate methods');
assert.equal(rapidCopies.summary.rapidEncounters,1);assert.equal(rapidCopies.summary.labEncounters,1);
assert.equal(build([identity,...copies,{uic_ori:'OTHER',ce_gender_identity:'2'},{...justPrepHiv,uic_ori:'OTHER'}],{genders:['1']}).lab.totals.hiv,1,'Demographics filter before deduplication');
assert.equal(build([{...justPrepHiv,pv_hiv_lab_test_date:'',pv_blood_collected_date:'2026-10-24'},clinic]).lab.totals.hiv,1,'Resolved legacy dates participate in deduplication');
assert.equal(build([{...justPrepHiv,pv_syphilis_result:'2'}]).lab.totals.syphilis,1,'Infections remain independent');
// Transport contract: all eligibility fields must actually be requested from REDCap.
let actor = { role: 'ADMIN', organization: 'PILS' }, requested = [], exportsCount = 0;
const route = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/redcap/dashboard/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
  module: route, exports: route.exports, URL, URLSearchParams, console, process: { env: { REDCAP_API_URL: 'https://mock.invalid', REDCAP_API_TOKEN: 'mock' } },
  require: name => name === 'next/server' ? { NextResponse: Response } : name === '@/lib/dashboard' ? loaded.exports : name === '@/lib/organization-access' ? { isPilsUser: user => user?.organization === 'PILS' } : { getCurrentUser: async () => actor, hasRole: (_user, role) => actor?.role === 'ADMIN' || actor?.role === role },
  fetch: async (_url, options) => { exportsCount++; assert.equal(options.body.get('action'), 'export'); requested = [...options.body].filter(([key]) => key.startsWith('fields[')).map(([, value]) => value); return Response.json([]); },
});
const request = params => route.exports.GET(new Request(`https://app.test/api/redcap/dashboard?${params}`));
const adminResponse = await request('period=week');
assert.equal(adminResponse.status, 200);
assert.ok('indicators' in await adminResponse.json(), 'Admins receive executive aggregates');
assert.ok(requested.includes('htm_vl_level'));
assert.ok(['cnv_no_show','cnv_visit_purpose','cnv_hiv_lab_test_done','hcs_status_only','pv_visit_date','pv_blood_collected_date','pv_syphilis_result','pv_hiv_lab_test_date','pv_hcv_lab_test_done','pv_visit_purpose'].every(field => requested.includes(field)));
assert.equal((await request('period=invalid')).status, 400);
assert.equal((await request('gender=99')).status, 400);
for (const role of ['OUTREACH_WORKER', 'HEALTHCARE_ASSISTANT', 'HEALTHCARE_NAVIGATOR', 'FACILITY_STAFF']) {
  actor = { role, organization: 'PILS' };
  const response = await request('executive=true&uics=true&period=month');
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.ok(!('indicators' in result), 'Non-admin API responses must not contain executive aggregates');
  assert.equal('barContributors' in result, role === 'HEALTHCARE_ASSISTANT', 'Only authorized clinical roles receive UICs');
  assert.ok(result.rapid && result.lab && result.commodities, 'Original aggregates remain available');
  assert.ok(!requested.includes('htm_vl_level') && !requested.includes('htp_diagnosis_date'), 'Non-admin exports must not request executive-only fields');
}
const before = exportsCount;
actor = { role: 'ADMIN', organization: 'CUT' }; assert.equal((await request('')).status, 403);
actor = null; assert.equal((await request('')).status, 401);
assert.equal(exportsCount, before, 'Denied requests must not reach REDCap');
console.log('Dashboard checks passed: Mauritius/midnight, clamped ranges, date validity, zero-filled trends, Clinic/PrEP code mapping, free-text outcomes, eligibility, legacy rows, filters and API authorization/export fields. No network requests made.');

// Canvas labels are not DOM text: verify the actual chart configuration in each locale.
const catalogs = Object.fromEntries(['en','fr','mfe'].map(locale => [locale, Object.fromEntries([...fs.readFileSync(`locales/${locale}.lproj/Localizable.strings`, 'utf8').matchAll(/^\s*"((?:\\.|[^"\\])*)"\s*=\s*"((?:\\.|[^"\\])*)"\s*;/gm)].map(match => [JSON.parse(`"${match[1]}"`), JSON.parse(`"${match[2]}"`)]))]));
let locale = 'en';
const charts = [];
function MockChart(_canvas, options) { charts.push(options); this.destroy = () => {}; }
const ui = { exports: {} };
const uiSource = fs.readFileSync('components/Dashboard.tsx', 'utf8')+'\nexport const chartAudit = { ComparisonChart, TrendChart, CommodityChart };';
vm.runInNewContext(ts.transpileModule(uiSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, {
  module: ui, exports: ui.exports,
  require: name => {
    if (name === 'react') return { useRef: () => ({ current: {} }), useEffect: effect => effect(), useMemo: compute => compute() };
    if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({type,props}), jsxs: (type, props) => ({type,props}) };
    if (name === 'chart.js') return MockChart;
    if (name === '@/components/Localization') return { useLocalization: () => ({ locale, t: text => catalogs[locale][text] ?? text }) };
    if (name === '@/components/DashboardBarTooltip') return { useBarTooltip: () => ({ custom: undefined, popup: null, onCanvasLeave: undefined }) };
    return {};
  },
});
for (locale of ['en','fr','mfe']) {
  const t = text => catalogs[locale][text] ?? text;
  ui.exports.chartAudit.ComparisonChart({ labels: ['Positive / reactive','First time tested','Recorded / unclassified','Conflicting results'], rapid: [1,2,3,1], laboratory: [3,2,1,2], ariaLabel: 'Dashboard summary' });
  let config = charts.at(-1);
  assert.equal(config.data.labels[0], t('Positive / reactive'));
  assert.equal(config.data.labels[1], t('First time tested'));
  assert.equal(config.data.labels[2], t('Recorded / unclassified'));
  assert.equal(config.data.labels[3], t('Conflicting results'));
  assert.equal(config.data.datasets[0].label, t('Rapid test'));
  assert.equal(config.data.datasets[1].label, t('Laboratory'));
  ui.exports.chartAudit.TrendChart({ data: build([outreach]) });
  config = charts.at(-1);
  assert.equal(config.data.datasets[0].label, t('Rapid tests'));
  assert.equal(config.data.datasets[1].label, t('Laboratory tests'));
  ui.exports.chartAudit.CommodityChart({ data: build([clinic]) });
  config = charts.at(-1);
  assert.equal(config.data.labels[0], t('Male condoms'));
  assert.equal(config.data.datasets[0].label, t('Units provided'));
  if (locale !== 'en') {
    for (const key of ['First time tested','Recorded / unclassified','Conflicting results','Rapid test','Laboratory']) assert.notEqual(t(key), key, `Missing chart translation: ${locale}/${key}`);
  }
}
console.log('Canvas chart configuration translations passed in English, French and Mauritian Creole.');
