import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';

const loaded = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/dashboard.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: loaded, exports: loaded.exports, Intl, Date });
const { buildDashboard } = loaded.exports;
const now = new Date('2026-11-16T12:00:00Z');
const filters = { period: 'month', genders: ['1'], kps: [] };
const a = { uic_ori: 'SECRET_UIC_A', redcap_repeat_instrument: 'outreach_contact', oc_date: '2026-11-01', oc_hiv_rapid_result: '1', oc_hiv_status_prev: '3', oc_male_condoms: '10' };
const clinic = { uic_ori: 'SECRET_UIC_A', redcap_repeat_instrument: 'clinic_visit', cnv_date: '2026-11-01', cnv_visit_purpose___3: '1', cnv_visit_purpose___16: '1', cnv_hiv_lab_result: '1', cnv_hiv_lab_test_date: '2026-11-01', cnv_num_male_condoms: '5' };
const rows = [
  { uic_ori: 'SECRET_UIC_A', ce_gender_identity: '1' }, { uic_ori: 'SECRET_UIC_B', ce_gender_identity: '1' }, { uic_ori: 'FILTERED', ce_gender_identity: '2' },
  a, { ...a, oc_male_condoms: '', redcap_repeat_instance: '2' },
  { ...a, oc_date: '2026-11-02', oc_male_condoms: '' },
  { ...a, uic_ori: 'SECRET_UIC_B', oc_hiv_rapid_result: '2', oc_hiv_status_prev: '2', oc_male_condoms: '4' },
  { ...a, uic_ori: 'FILTERED' }, { ...a, oc_date: '2026-12-01' },
  clinic,
  { uic_ori: 'SECRET_UIC_A', redcap_repeat_instrument: 'prep_visit', pv_visit_date: '2026-11-01', pv_hiv_lab_test_date: '2026-11-01', pv_hiv_result: '2' },
  { ...clinic, uic_ori: 'SECRET_UIC_B', cnv_no_show: '1', cnv_num_male_condoms: '100' },
  { uic_ori: 'SECRET_UIC_A', redcap_repeat_instrument: 'hiv_care_support', hcs_date: '2026-11-01', hcs_num_male_condoms: '3' },
  { uic_ori: 'SECRET_UIC_A', redcap_repeat_instrument: 'hiv_care_support', hcs_date: '2026-11-01', hcs_status_only: '1', hcs_num_male_condoms: '100' },
];
const result = buildDashboard(rows, filters, now, false, true);
const uics = result.barContributors;
assert.deepEqual(JSON.parse(JSON.stringify(uics.rapid.totals.hiv)), { SECRET_UIC_A: 2, SECRET_UIC_B: 1 });
assert.equal(uics.rapid.firstTime.hiv.SECRET_UIC_A, 2, 'First-time chart contributions match the existing test-day counting rule');
assert.equal(uics.lab.outcomes.hiv.conflicting.SECRET_UIC_A, 1, 'Clinic/PrEP disagreements contribute once to conflicting results');
assert.equal(uics.lab.outcomes.hiv.positive.SECRET_UIC_A, undefined);
assert.equal(uics.commodities.maleCondoms.SECRET_UIC_A, 18);
assert.equal(uics.commodities.maleCondoms.SECRET_UIC_B, 4);
for (const method of ['rapid', 'lab']) for (const infection of ['hiv', 'syphilis', 'hcv', 'hbv']) {
  const sum = map => Object.values(map).reduce((a, b) => a + b, 0);
  assert.equal(sum(uics[method].totals[infection]), result[method].totals[infection]);
  assert.equal(sum(uics[method].firstTime[infection]), result[method].firstTime?.[infection] ?? 0);
  for (const outcome of ['positive', 'negative', 'indeterminate', 'invalid', 'unclassified', 'conflicting']) assert.equal(sum(uics[method].outcomes[infection][outcome]), result[method].outcomes[infection][outcome]);
}
for (const [commodity, map] of Object.entries(uics.commodities)) assert.equal(Object.values(map).reduce((a, b) => a + b, 0), result.commodities.totals[commodity]);
const aggregateOnly = buildDashboard(rows, filters, now, false);
assert.ok(!('barContributors' in aggregateOnly));
assert.ok(!JSON.stringify(aggregateOnly).includes('SECRET_UIC'), 'Default responses cannot leak contributing identifiers');

// Render the real popup with synthetic identifiers; confirm dataset/bar
// selection, safe text rendering and removal when no permission data exists.
let active = null;
const tooltip = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/DashboardBarTooltip.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
  module: tooltip, exports: tooltip.exports, setTimeout, clearTimeout,
  require: name => {
    if (name === 'react') return { useState: () => [active, value => { active = value; }], useRef: value => ({ current: value }), useEffect: () => {}, useCallback: fn => fn };
    if (name === 'react/jsx-runtime') return jsxRuntime;
    if (name === '@/components/Localization') return { useLocalization: () => ({ locale: 'en', t: text => text }) };
    throw Error(name);
  },
});
const maps = [[{ RAPID_ONLY: 1 }], [{ SECRET_UIC_A: 2, '<script>unsafe</script>': 1 }]];
tooltip.exports.useBarTooltip(maps).custom({ opacity: 1, dataPoints: [{ datasetIndex: 1, index: 0 }], title: ['HIV'], body: [{ lines: ['Laboratory: 3'] }] });
const html = renderToStaticMarkup(tooltip.exports.useBarTooltip(maps).popup);
assert.ok(html.includes('SECRET_UIC_A') && html.includes('Laboratory: 3') && html.includes('× 2'));
assert.ok(!html.includes('RAPID_ONLY'), 'Popup lists only the hovered bar contributors');
assert.ok(html.includes('&lt;script&gt;') && !html.includes('<script>'), 'UICs are rendered as safe text');
assert.equal(tooltip.exports.useBarTooltip().popup, null, 'No contributor data means no identifier popup');
assert.equal(tooltip.exports.useBarTooltip().custom, undefined, 'Unauthorized charts retain ordinary tooltips');
console.log('Bar contributor checks passed: totals reconcile, deduplication/conflicts, dates/demographics, commodity units, identifier omission, hovered dataset selection and safe popup rendering. Synthetic records only.');
