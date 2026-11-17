import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';

function load(file) {
  const loaded = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module: loaded, exports: loaded.exports, Intl, Date, require: name => {
    if (name === './dashboard-cards' || name === './dashboard-default-cards') return load(`lib/${name.slice(2)}.ts`);
    throw Error(`Unexpected dependency ${name}`);
  } });
  return loaded.exports;
}
const { buildDashboard, dashboardFields } = load('lib/dashboard.ts');
const cardDefinitions = load('lib/dashboard-cards.ts');
const { dashboardCards, dashboardCardInfo, sharedIndicatorFields } = cardDefinitions;
const cardLayout = load('lib/dashboard-card-layout.ts');
const defaultDefinitions = load('lib/dashboard-default-cards.ts');
const schema = JSON.parse(fs.readFileSync('scripts/fixtures/redcap-schema.json', 'utf8'));
for (const field of dashboardFields) assert.ok(schema[field], `Unknown export field ${field}`);
assert.equal(new Set(dashboardFields).size, dashboardFields.length);
assert.equal(dashboardCards.length, 41);
assert.equal(new Set(dashboardCards.map(card => card.id)).size, 41);
for (const card of dashboardCards) {
  const info = dashboardCardInfo[card.id];
  assert.ok(info.assumptions && info.calculation, `Missing explanation for ${card.id}`);
  if (card.blank) { assert.ok(info.missing); assert.equal(info.fields.length, 0); }
  else assert.ok(info.fields.length);
  for (const field of [...info.fields, ...sharedIndicatorFields]) {
    assert.ok(field.startsWith('redcap_') || schema[field.split('___')[0]], `Unknown field in ${card.id} explanation: ${field}`);
  }
}
const now = new Date('2026-11-16T12:00:00Z');
const compute = (rows, options = {}) => JSON.parse(JSON.stringify(buildDashboard(rows, { period: 'month', genders: [], kps: [], ...options }, now).indicators));
const row = (instrument, instance, fields, id = 'A') => ({ uic_ori: id, redcap_repeat_instrument: instrument, redcap_repeat_instance: String(instance), ...fields });
const oc = (instance, date, extra = {}, id = 'A') => row('outreach_contact', instance, { oc_date: date, oc_type: '3', oc_hotspot: 'Site One', ...extra }, id);
const pv = (instance, date, extra = {}, id = 'A') => row('prep_visit', instance, { pv_visit_date: date, ...extra }, id);
const profile = (id, fields) => row('hiv_treatment_profile', 1, fields, id);
const vl = (id, instance, date, fields) => row('hiv_clinical_monitoring', instance, { htm_vl_date: date, ...fields }, id);

const visits = [
  oc(1, '2026-10-01', { oc_hiv_status_prev: '3', oc_hiv_rapid_result: '1' }),
  oc(2, '2026-11-01', { oc_hiv_status_prev: '3', oc_hiv_rapid_result: '1', oc_prep_com: '1', oc_prep_interested: '1' }),
  oc(3, '2026-11-02', { oc_hiv_rapid_result: '2', oc_hepc_result: '1', oc_hepc_status_prev: '3', oc_hotspot: ' site   ONE ' }),
  oc(4, '2026-11-02', { oc_hiv_rapid_result: '2', oc_hotspot: 'SITE ONE' }),
  oc(5, '2026-11-03', { oc_hiv_rapid_result: '1', oc_hiv_status_prev: '3' }, 'B'),
  oc(6, '2026-11-17', { oc_hiv_rapid_result: '1' }, 'FUTURE'),
];
let data = compute([...visits, visits[1]]);
assert.equal(data.reach, 4, 'Exact export duplicate merges; repeat attendances remain separate');
assert.equal(data.hivRapidTests, 4, 'Every repeat test counts even on same patient/day');
assert.equal(data.firstTests.HIV, 1, 'Earlier Never tested entry prevents a second lifetime first test');
assert.equal(data.firstTests.HCV, 1);
assert.equal(data.firstReactivity.HIV, 100);
assert.equal(data.hivReactive, 1, 'Latest negative overrides earlier reactive within period');
assert.equal(data.reactivity.HIV, 50);
assert.equal(data.outreachActivities, 3, 'Same normalized site/day is one activity');
assert.equal(data.averageReach, 4 / 3);
assert.equal(data.prepSensitised, 25);
assert.equal(data.prepInterested, 25);
assert.equal(data.testingCoverage, 100, 'Multiple infections within one encounter count once');
assert.equal(compute([
  oc(1, '2026-11-01'),
  row('clinic_visit', 1, { cnv_hiv_lab_test_date: '2026-11-01', cnv_hiv_lab_result: '2', cnv_hcv_lab_test_date: '2026-11-01', cnv_hcv_lab_result: '1' }),
  pv(1, '2026-11-01', { pv_hiv_result: '2' }),
  row('clinic_visit', 2, { cnv_hiv_lab_test_date: '2026-11-01', cnv_hiv_lab_result: '1', cnv_no_show: '1' }),
]).testingCoverage, 200, 'Total testing encounters span sources, count infections once per encounter, and exclude no-shows');
const conflict = compute([...visits, oc(7, '2026-11-03', { oc_hiv_rapid_result: '2' }, 'B')]);
assert.equal(conflict.hivReactive, 0, 'Unordered same-day conflicting outcomes are excluded');
assert.equal(conflict.reactivity.HIV, 0);
const invalidLatest = compute([...visits, oc(8, '2026-11-04', { oc_hiv_rapid_result: '3' }, 'B')]);
assert.equal(invalidLatest.reactivity.HIV, 0, 'Latest indeterminate must not fall back to earlier positive');
assert.equal(compute([oc(1, 'bad', { oc_hiv_rapid_result: '1' })]).reach, 0);
data = compute([{ uic_ori: 'A', ce_gender_identity: '1' }, { uic_ori: 'B', ce_gender_identity: '2' }, ...visits], { genders: ['2'] });
assert.equal(data.reach, 1);
assert.equal(data.hivReactive, 1);

data = compute([
  oc(1, '2026-11-01', { oc_type: '12' }),
  row('hiv_care_support', 1, { hcs_date: '2026-11-01', hcs_care_type___9: '1', hcs_care_type___2: '1' }),
  row('hiv_care_support', 2, { hcs_date: '2026-11-02', hcs_care_type___9: '1', hcs_care_type___3: '1' }),
  row('hiv_care_support', 3, { hcs_date: '2026-11-03', hcs_status_only: '1', hcs_care_type___3: '1' }),
  row('breakfast_attendance', 1, { breakfast_date: '2026-11-01', breakfast_present_8edd8b: '1', extra_servings: '3' }),
  row('breakfast_attendance', 2, { breakfast_date: '2026-11-02', breakfast_present_8edd8b: '0' }),
  row('clinical_referral', 1, { cr_date: '2026-11-01', cr_status: '1' }),
  row('social_referral', 1, { sr_date: '2026-11-01', sr_service_received: '0' }),
]);
assert.equal(data.fourBaz, 2);
assert.equal(data.eyeHospital, 1);
assert.equal(data.hospital, 1, 'Status-only rows are not service encounters');
assert.equal(data.breakfast, 1, 'Extra servings are not extra encounters');
assert.equal(data.referrals, 2, 'Count issued referrals without requiring completion');

data = compute([
  profile('A', { htp_diagnosis_date: '2026-01-01', htp_art_start_date: '2026-11-01' }),
  profile('B', { htp_diagnosis_date: '2026-02-01' }),
  profile('C', { htp_diagnosis_date: '2026-02-01' }),
  vl('A', 1, '2026-10-01', { htm_vl_level: '39' }),
  vl('A', 2, '2026-11-01', { htm_vl_level: '40' }),
  vl('A', 3, '2026-12-01', { htm_viral_load_detectable: '2' }),
  vl('B', 1, '2026-09-01', { htm_viral_load_detectable: '2' }),
  vl('C', 1, '2026-10-01', { htm_vl_level: '39' }),
  vl('UNKNOWN', 1, '2026-11-01', { htm_vl_level: '0' }),
]);
assert.equal(data.undetectable, 2, 'Latest as-of result; strictly less than 40; pre-period tests qualify');
assert.ok(Math.abs(data.suppression - 200 / 3) < 1e-10);
assert.equal(data.arvInitiations, 1);
data = compute([profile('A', { htp_diagnosis_date: '2026-01-01' }), vl('A', 1, '2026-11-01', { htm_viral_load_detectable: '2', htm_vl_level: '100' })]);
assert.equal(data.suppression, null, 'Contradictory numeric/category result is not classified');
assert.equal(compute([profile('A', { htp_art_start_date: '2026-01-01' }), vl('A', 1, '2026-11-01', { htm_viral_load_detectable: '2', htm_vl_level: '-1' })]).suppression, null, 'Negative viral loads are invalid');

const prepRows = [
  row('prep_treatment_profile', 1, { ptp_previous_use: '0', ptp_update_date: '2026-10-01' }),
  pv(1, '2026-11-01', { pv_medication_dispensed: '30', pv_next_med_date: '2026-11-10' }),
  profile('A', { htp_diagnosis_date: '2026-11-12' }),
  pv(2, '2026-11-17', { pv_medication_dispensed: '30' }),
];
data = compute(prepRows);
assert.equal(data.prepInitiations, 1);
assert.equal(data.hivAfterPrep, 100);
assert.equal(data.missedPrep, 1, 'Future attendance cannot clear a missed appointment historically');
assert.equal(compute([...prepRows, pv(3, '2026-11-15')]).missedPrep, 0, 'Any subsequent PrEP attendance clears the missed appointment');
assert.equal(compute([pv(1, '2026-11-01', { pv_next_med_date: '2026-11-16' })]).missedPrep, 0, 'Due today is not missed until tomorrow');
assert.equal(compute([row('prep_treatment_profile', 1, { ptp_previous_use: '1', ptp_update_date: '2026-10-01' }), ...prepRows.slice(1)]).prepInitiations, 0, 'Known prior use is not a first-ever start');
assert.equal(compute([pv(1, '2026-11-01', { pv_medication_dispensed: '30' })]).prepInitiations, 0, 'Unknown previous use is not assumed first-ever');

const empty = compute([]);
for (const card of dashboardCards) {
  if (card.blank) assert.equal(empty[card.id], undefined, `Missing-field card ${card.id} must stay blank`);
  else assert.ok(card.id in empty, `Supported card ${card.id} must have an aggregate`);
}
assert.equal(empty.testingCoverage, null);
assert.equal(empty.suppression, null);
assert.equal(empty.reactivity.HIV, null);

// Render the actual component with synthetic aggregates: missing-field cards
// must remain title-only even when neighbouring cards have real values.
let renderData = buildDashboard(visits, { period: 'month', genders: [], kps: [] }, now);
let stateIndex = 0;
let cardFlipped = false;
let cardFocusReturned = false;
const cardScreen = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/DashboardIndicatorCard.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText, {
  module: cardScreen, exports: cardScreen.exports,
  require: name => {
    if (name === 'react') return {
      useState: () => [cardFlipped, update => { cardFlipped = typeof update === 'function' ? update(cardFlipped) : update; }],
      useRef: () => ({ current: { focus: () => { cardFocusReturned = true; } } }),
    };
    if (name === 'react/jsx-runtime') return jsxRuntime;
    if (name === '@/components/Localization') return { useLocalization: () => ({ locale: 'en', t: text => text }) };
    if (name === '@/lib/dashboard-cards') return cardDefinitions;
    if (name === 'lucide-react') return { Info: () => null, RotateCcw: () => null };
    throw Error(`Unexpected card dependency ${name}`);
  },
});
const screen = { exports: {} };
const gridScreen = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/DashboardCardGrid.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText, {
  module: gridScreen, exports: gridScreen.exports,
  require: name => {
    if (name === 'react') return {
      useState: initial => [initial, () => {}], useRef: () => ({ current: null }), useEffect: () => {},
      useMemo: fn => fn(), useSyncExternalStore: (_subscribe, _snapshot, serverSnapshot) => serverSnapshot(),
    };
    if (name === 'react/jsx-runtime') return jsxRuntime;
    if (name === '@/components/Localization') return { useLocalization: () => ({ locale: 'en', t: text => text }) };
    if (name === '@/lib/dashboard-cards') return cardDefinitions;
    if (name === '@/lib/dashboard-card-layout') return cardLayout;
    if (name === '@/components/DashboardCard') return { DashboardCard: ({ children }) => children };
    if (name === '@/components/DashboardIndicatorCard') return cardScreen.exports;
    if (name === 'lucide-react') return { GripVertical: () => null };
    throw Error(`Unexpected grid dependency ${name}`);
  },
});
vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/Dashboard.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText, {
  module: screen, exports: screen.exports,
  require: name => {
    if (name === 'react') return {
      useState: () => [['month', [], [], renderData, false, ''][stateIndex++], () => {}],
      useEffect: () => {}, useMemo: fn => fn(), useRef: () => ({ current: null }),
    };
    if (name === 'react/jsx-runtime') return jsxRuntime;
    if (name === '@/components/Localization') return { useLocalization: () => ({ locale: 'en', t: text => text }) };
    if (name === '@/lib/dashboard-cards') return { dashboardCards };
    if (name === '@/lib/dashboard-default-cards') return defaultDefinitions;
    if (name === '@/components/DashboardBarTooltip') return { useBarTooltip: () => ({ custom: undefined, popup: null, onCanvasLeave: undefined }) };
    if (name === '@/components/DashboardCard') return { DashboardCard: ({ children }) => children };
    if (name === '@/components/DashboardIndicatorCard') return cardScreen.exports;
    if (name === '@/components/DashboardCardGrid') return gridScreen.exports;
    if (name === '@/components/ui/checkbox') return { Checkbox: () => null };
    if (name === 'lucide-react') return Object.fromEntries(['Activity', 'AlertCircle', 'Beaker', 'Boxes', 'FlaskConical', 'Users'].map(key => [key, () => null]));
    if (name === 'chart.js') return function () {};
    throw Error(`Unexpected UI dependency ${name}`);
  },
});
let dashboardHtml = '';
function renderCards(showExecutive = true) {
  stateIndex = 0;
  const html = renderToStaticMarkup(React.createElement(screen.exports.default, { showExecutive }));
  dashboardHtml = html;
  return new Map([...html.matchAll(/<article[^>]*aria-labelledby="indicator-([^"]+)"[^>]*>([\s\S]*?)<\/article>/g)].filter(match => dashboardCards.some(card => card.id === match[1])).map(match => [match[1], match[2]]));
}
let rendered = renderCards();
assert.equal(rendered.size, 41);
assert.deepEqual([...rendered.keys()], [...cardLayout.defaultCardOrder], 'Default grid puts all implemented cards before templates');
for (const card of dashboardCards) {
  const html = rendered.get(card.id);
  const front = html.split('indicator-card-back')[0];
  if (card.blank) {
    assert.ok(!front.includes('<p') && !front.includes('<dl'), `${card.id} must not contain a numeric value`);
    assert.ok(front.includes('Not Implemented'), `${card.id} must display its implementation status`);
  } else assert.ok(front.includes('<p') || front.includes('<dl') || front.includes('No data'), `${card.id} must show its aggregate or no-data label`);
  assert.ok(html.includes('Show card details:') && html.includes('aria-expanded="false"'));
  assert.ok(html.includes('Assumptions') && html.includes('REDCap fields used'));
}
assert.match(rendered.get('suppression'), /No data/);
assert.match(rendered.get('hivReactive'), />1<\/p>/);
assert.equal(renderCards(false).size, 0, 'Non-admin view must not render executive cards');
assert.ok(dashboardHtml.includes('Default cards') && dashboardHtml.includes('Tests by infection and method'), 'Staff view retains original default cards');
assert.ok(!dashboardHtml.includes('executive-card-layout-help') && dashboardHtml.includes('default-card-layout-help'), 'Staff get only the Default group layout controls');
for (const card of defaultDefinitions.defaultDashboardCards) {
  assert.ok(dashboardHtml.includes(`data-move-card="${card.id}"`), `${card.id} has a grip`);
  assert.ok(dashboardHtml.includes(`indicator-details-${card.id}`), `${card.id} has an info back`);
  const info = defaultDefinitions.defaultDashboardCardInfo[card.id];
  assert.ok(info.assumptions && info.calculation && info.fields.length);
  for (const field of info.fields) assert.ok(schema[field.split('___')[0]], `Unknown default-card field ${field}`);
}
renderData = null;
rendered = renderCards();
assert.equal(rendered.size, 41, 'All titles remain visible without a successful data response');
assert.ok([...rendered.values()].every(html => { const front = html.split('indicator-card-back')[0]; return !front.includes('<p') && !front.includes('<dl'); }), 'No unavailable data appears as zero');
for (const card of dashboardCards.filter(card => !card.blank)) assert.ok(rendered.get(card.id).split('indicator-card-back')[0].includes('No data'));
const zeroCard = renderToStaticMarkup(React.createElement(cardScreen.exports.DashboardIndicatorCard, { card: dashboardCards[0], value: 0 })).split('indicator-card-back')[0];
assert.match(zeroCard, />0<\/p>/);
assert.ok(!zeroCard.includes('No data'), 'A recorded zero remains a valid value');
const renderCard = () => cardScreen.exports.DashboardIndicatorCard({ card: dashboardCards[0], value: 7 });
let cardElement = renderCard();
cardElement.props.children[0].props.onClick();
cardElement = renderCard();
assert.equal(cardElement.props['data-flipped'], true, 'Info button flips to details');
assert.equal(cardElement.props.children[0].props['aria-expanded'], true);
assert.equal(cardElement.props.children[1].props.children[0].props.inert, true, 'Hidden front is not keyboard accessible');
assert.equal(cardElement.props.children[1].props.children[1].props.inert, false, 'Visible back is keyboard accessible');
cardElement.props.children[0].props.onClick();
assert.equal(renderCard().props['data-flipped'], false, 'Return button restores front');
renderCard().props.children[0].props.onClick();
renderCard().props.onKeyDown({ key: 'Escape' });
assert.equal(renderCard().props['data-flipped'], false, 'Escape restores front');
assert.equal(cardFocusReturned, true, 'Escape returns keyboard focus to the info button');
console.log('41 indicator cards verified: lifetime first tests, latest screening, repeated encounters, filters, cutoff dates, viral-load thresholds, first dispensing, missed appointments, referrals and blank templates. No patient data or network used.');
