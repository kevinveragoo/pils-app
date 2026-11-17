import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import * as crypto from 'node:crypto';
let actor = { id: 'tester', organization: 'PILS', role: 'ADMIN', roles: '[]' }, imports = [], audits = [], failAudit = false;
const fields = [
 { field_name: 'uic_ori', form_name: 'client_enrollment', field_type: 'text' },
 { field_name: 'ce_first_name', form_name: 'client_enrollment', field_type: 'text' },
 ...[
  ['cnv_date', 'text', { text_validation_type_or_show_slider_number: 'date_dmy' }],
  ['cnv_proxy', 'yesno', {}],
  ['cnv_proxy_name', 'text', { branching_logic: "[cnv_proxy] = '1'", required_field: 'y' }],
  ['cnv_choices', 'checkbox', { select_choices_or_calculations: '1, First | 2, Second' }],
  ['cnv_number', 'text', { text_validation_type_or_show_slider_number: 'integer', text_validation_min: '0', text_validation_max: '20' }],
  ['cnv_calculated', 'text', { field_annotation: '@CALCTEXT(1)' }],
  ['cnv_hidden', 'text', { field_annotation: '@HIDDEN' }],
 ].map(([field_name, field_type, extra]) => ({ field_name, field_type, form_name: 'clinic_visit', ...extra })),
].map(field => ({ field_label: field.field_name, select_choices_or_calculations: '', ...field }));
let rows = [{ uic_ori: 'TEST', ce_first_name: 'Original' }, { uic_ori: 'TEST', redcap_repeat_instrument: 'clinic_visit', redcap_repeat_instance: '2', cnv_date: '2026-11-17', cnv_proxy: '0', cnv_proxy_name: 'Historical hidden value', cnv_choices___1: '1', cnv_choices___2: '0', cnv_number: '3', cnv_calculated: 'Computed', cnv_hidden: 'Keep' }];
const cache = new Map();
function load(file) {
 if (cache.has(file)) return cache.get(file);
 const loaded = { exports: {} };
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, {
  module: loaded, exports: loaded.exports, Request, Response, URL, URLSearchParams, AbortSignal, console,
  process: { env: { REDCAP_API_URL: 'https://mock.invalid', REDCAP_API_TOKEN: 'mock' } },
  require: name => {
   if (name === 'node:crypto') return crypto;
   if (name === 'next/server') return { NextResponse: Response };
   if (name === '@/lib/auth') return { getCurrentUser: async () => actor, hasAnyRole: (user, roles) => [user.role, ...JSON.parse(user.roles ?? '[]')].some(role => roles.includes(role)) };
   if (name === '@/lib/db') return { db: { auditLog: { create: async ({ data }) => { if (failAudit) throw Error('audit unavailable'); const item = { id: String(audits.length), ...data };audits.push(item);return item; }, update: async ({ where, data }) => Object.assign(audits.find(item => item.id === where.id), data) } } };
   const target = name.startsWith('@/') ? name.slice(2) : path.resolve(path.dirname(file), name);
   if (target.endsWith('.json')) return JSON.parse(fs.readFileSync(target));
   return load(target + '.ts');
  },
  fetch: async (_url, options) => {
   const params = options.body;
   if (params.get('content') === 'metadata') return Response.json(fields);
   if (params.get('content') === 'repeatingFormsEvents') return Response.json([{ form_name: 'clinic_visit' }]);
   if (params.get('action') !== 'import') return Response.json(rows);
   const data = JSON.parse(params.get('data'));assert.equal(data.length, 1);imports.push(data[0]);
   assert.equal(params.get('forceAutoNumber'), 'false');assert.equal(params.get('overwriteBehavior'), 'overwrite');
   const imported = data[0];const target = rows.find(row => row.uic_ori === imported.uic_ori && (row.redcap_repeat_instrument ?? '') === (imported.redcap_repeat_instrument ?? '') && (row.redcap_repeat_instance ?? '') === (imported.redcap_repeat_instance ?? '') && (row.redcap_event_name ?? '') === (imported.redcap_event_name ?? ''));
   assert.ok(target, 'Editing must never create an instance');Object.assign(target, imported);return Response.json({ count: 1 });
  },
 });
 cache.set(file, loaded.exports);return loaded.exports;
}
const route = load('app/api/redcap/lookup/edit/route.ts');
const identity = { uic: 'TEST', form: 'clinic_visit', instance: '2', event: '' };
const get = (id = identity) => route.GET(new Request(`https://app.test/api/redcap/lookup/edit?${new URLSearchParams(id)}`));
const post = (body, origin = 'https://app.test') => route.POST(new Request('https://app.test/api/redcap/lookup/edit', { method: 'POST', headers: { origin, host: 'app.test', 'content-type': 'application/json' }, body: JSON.stringify(body) }));
let response = await get(), entry = await response.json();assert.equal(response.status, 200);
assert.ok(!entry.fields.some(field => /calculated|hidden/.test(field.field_name)));
assert.equal(entry.values.cnv_choices, '1');
response = await post({ identity, version: entry.version, values: { cnv_number: '5', cnv_choices: '2', cnv_date: '' } });assert.equal(response.status, 200);
assert.equal(rows.length, 2);assert.equal(imports[0].redcap_repeat_instance, '2');assert.equal(imports[0].cnv_choices___1, '0');assert.equal(imports[0].cnv_choices___2, '1');assert.equal(imports[0].cnv_date, '');
assert.equal(rows[1].cnv_proxy_name, 'Historical hidden value');assert.equal(rows[1].cnv_hidden, 'Keep');
assert.equal(audits[0].event, 'LOOKUP_ENTRY_UPDATED');assert.equal(JSON.parse(audits[0].details).changes.cnv_number.before, '3');assert.equal(JSON.parse(audits[0].details).changes.cnv_number.after, '5');
assert.equal((await post({ identity, version: entry.version, values: { cnv_number: '6' } })).status, 409);
entry = await (await get()).json();
for (const values of [{ uic_ori: 'OTHER' }, { cnv_calculated: 'Bad' }, { cnv_hidden: 'Bad' }, { cnv_proxy_name: 'Bad' }, { cnv_proxy: '1', cnv_proxy_name: '' }, { cnv_number: '21' }, { cnv_date: '2026-02-30' }, { cnv_proxy: '2' }]) assert.equal((await post({ identity, version: entry.version, values })).status, 400, JSON.stringify(values));
assert.equal((await post({ identity, version: entry.version, values: { cnv_proxy: '1', cnv_proxy_name: 'Friend' } })).status, 200);
const count = imports.length;
assert.equal((await get({ ...identity, instance: '3' })).status, 400);assert.equal((await get({ ...identity, event: 'wrong_event' })).status, 400);assert.equal(imports.length, count);
assert.equal((await post({}, 'https://other.test')).status, 403);
failAudit = true;entry = await (await get()).json();assert.equal((await post({ identity, version: entry.version, values: { cnv_number: '7' } })).status, 502);assert.equal(imports.length, count);failAudit = false;
for (const [role, allowed] of [['OUTREACH_WORKER', false], ['HEALTHCARE_NAVIGATOR', false], ['FACILITY_STAFF', false], ['HEALTHCARE_ASSISTANT', true], ['ADMIN', true]]) { actor = { ...actor, role };assert.equal((await get()).status, allowed ? 200 : 403); }
actor = { ...actor, role: 'ADMIN', organization: 'CUT' };assert.equal((await get()).status, 403);assert.equal((await post({ identity })).status, 403);
actor = null;assert.equal((await get()).status, 401);assert.equal((await post({ identity })).status, 401);
actor = { id: 'tester', role: 'ADMIN', organization: 'PILS' };
const clientId = { ...identity, form: 'client_enrollment', instance: '' };entry = await (await get(clientId)).json();assert.ok(!entry.fields.some(field => field.field_name === 'uic_ori'));assert.equal((await post({ identity: clientId, version: entry.version, values: { ce_first_name: 'Corrected' } })).status, 200);assert.equal(rows[0].ce_first_name, 'Corrected');assert.equal(rows.length, 2);
console.log('Lookup editing passed: role/organisation checks, exact repeat and base identity, no new records, changed fields only, blank/checkbox updates, hidden/identifier protection, validation, stale-edit rejection and audit before/after. Synthetic records only.');
// Instrument permissions include secondary roles and never grant external access.
const { canEditLookup } = load('lib/lookup-edit-access.ts');
for (const [role, own, denied] of [['OUTREACH_WORKER', 'outreach_contact', 'prep_visit'], ['HEALTHCARE_ASSISTANT', 'prep_visit', 'hiv_care_support'], ['HEALTHCARE_NAVIGATOR', 'hiv_care_support', 'violence_disclosure'], ['FACILITY_STAFF', 'client_enrollment', 'clinic_visit']]) {
 const user = { ...actor, role, roles: '[]' };assert.equal(canEditLookup(user, own), true);assert.equal(canEditLookup(user, denied), false);
 assert.equal(canEditLookup({ ...user, roles: '["ADMIN"]' }, denied), true);
 assert.equal(canEditLookup({ ...user, organization: 'CUT', roles: '["ADMIN"]' }, own), false);
}
const React = await import('react');const runtime = await import('react/jsx-runtime');const { renderToStaticMarkup } = await import('react-dom/server');
const editable = load('lib/lookup-edit.ts');
const uiEntry = { fields: fields.filter(field => field.form_name === 'clinic_visit' && editable.editableField(field)), values: { cnv_proxy: '0', cnv_proxy_name: 'Keep hidden', cnv_date: '2026-11-17', cnv_choices: '2', cnv_number: '5' }, version: 'test' };
let uiState = 0;const ui = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/LookupEntryEditor.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
 module: ui, exports: ui.exports,
 require: name => {
  if (name === 'react') return { useEffect() {}, useRef: () => ({ current: null }), useState: () => [[uiEntry, uiEntry.values, '', false][uiState++], () => {}] };
  if (name === 'react/jsx-runtime') return runtime;
  if (name === '@/components/Localization') return { useLocalization: () => ({ t: value => value }) };
  if (name === '@/components/ui/button') return { Button: props => React.createElement('button', props) };
  if (name.startsWith('@/lib/')) return load(name.slice(2) + '.ts');
  throw Error(`Unexpected editor dependency: ${name}`);
 },
});
const html = renderToStaticMarkup(React.createElement(ui.exports.default, { identity: { ...identity, label: 'Clinic Visit' }, onClose() {}, onSaved() {} }));
assert.match(html, /<dialog/);assert.match(html, /Save changes/);assert.match(html, /lookup-edit-cnv_number/);assert.ok(!html.includes('lookup-edit-cnv_proxy_name'));assert.ok(!html.includes('lookup-edit-cnv_calculated'));assert.ok(!html.includes('lookup-edit-uic_ori'));
console.log('Editor rendering passed: modal identity, save/cancel controls, editable fields and branch/identifier exclusions.');
