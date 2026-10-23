//
//  check-redcap-schema.mjs
//  pils-app
//
//  Created by Elisa Kevin Veragoo + ChatGPT on 23/10/2026.
//
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
const root = path.resolve(import.meta.dirname, '..');
if (!process.env.REDCAP_API_URL || !process.env.REDCAP_API_TOKEN) throw Error('REDCap API configuration is missing.');
async function read(content) {
  const response = await fetch(process.env.REDCAP_API_URL, { method: 'POST', body: new URLSearchParams({ token: process.env.REDCAP_API_TOKEN, content, format: 'json', returnFormat: 'json' }) });
  const data = await response.json(); if (!response.ok || !Array.isArray(data)) throw Error(`Unable to read ${content}.`); return data;
}
const [metadata, instruments] = await Promise.all([read('metadata'), read('instrument')]);
const live = new Map(metadata.map(field => [field.field_name, field]));
const instrumentDefinitions = JSON.parse(fs.readFileSync(path.join(root,"lib/instrument-forms.json")));
const rules = JSON.parse(fs.readFileSync(path.join(root, 'lib/redcap-field-rules.json')));
const choices = field => ['yesno', 'truefalse'].includes(field.field_type) ? ['0', '1'] : ['checkbox', 'dropdown', 'radio'].includes(field.field_type) ? field.select_choices_or_calculations.split('|').filter(value => value.includes(',')).map(value => value.split(',', 1)[0].trim()) : [];
const sameCodes = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const issues = [];
for (const [form, fields] of Object.entries(instrumentDefinitions)) {
  const current = metadata.filter(field => field.form_name === form);
  if (JSON.stringify(fields.map(f=>f.name)) !== JSON.stringify(current.map(f=>f.field_name))) issues.push(`${form}: form field ordering changed`);
  for (const entry of fields) {
    const field=live.get(entry.name);if(!field)continue;
    const expectedOptions = ['radio','dropdown','checkbox'].includes(field.field_type) ? field.select_choices_or_calculations.split('|').filter(v=>v.includes(',')).map(v=>{const i=v.indexOf(',');return [v.slice(0,i).trim(),v.slice(i+1).trim()];}) : field.field_type==='yesno' ? [['0','No'],['1','Yes']] : [];
    if(JSON.stringify(entry.options)!==JSON.stringify(expectedOptions))issues.push(`${entry.name}: rendered options differ`);
    if(entry.label!==field.field_label||entry.section!==field.section_header||entry.branch!==field.branching_logic||entry.annotation!==field.field_annotation||entry.note!==field.field_note||entry.required!==(field.required_field==='y')) issues.push(`${entry.name}: rendered field configuration differs`);
  }
}
for (const field of metadata) {
  const rule = rules[field.field_name];
  if (!rule) { issues.push(`${field.field_name}: missing validation definition`); continue; }
  if (rule.label !== field.field_label) issues.push(`${field.field_name}: label changed`);
  if (rule.form !== field.form_name || rule.type !== (field.text_validation_type_or_show_slider_number || field.field_type)) issues.push(`${field.field_name}: form/type changed`);
  if (!!rule.required !== (field.required_field === 'y') || (rule.branch || '') !== field.branching_logic) issues.push(`${field.field_name}: required/branching rule changed`);
  if (!sameCodes(rule.choices ?? [], choices(field))) issues.push(`${field.field_name}: choice codes changed`);
  for (const bound of ['min', 'max']) if (['integer', 'number'].includes(rule.type)) {
    const raw = field[`text_validation_${bound}`], expected = raw === '' || !Number.isFinite(Number(raw)) ? undefined : Number(raw);
    const expression = raw && !Number.isFinite(Number(raw)) ? raw : undefined;
    if (rule[bound] !== expected || rule[`${bound}Expression`] !== expression) issues.push(`${field.field_name}: ${bound} changed`);
  }
  if (rule.required && rule.branch && rule.branch.replace(/\[[\w]+(?:\(\d+\))?\]|<>|>=|<=|=|>|<|'[^']*'|"[^"]*"|\band\b|\bor\b|\(|\)|-?\d+(?:\.\d+)?/gi, "").trim()) issues.push(`${field.field_name}: conditional required expression needs review`);
}
for (const name of Object.keys(rules)) if (!live.has(name)) issues.push(`${name}: field no longer exists`);
function load(relative) {
  const loaded = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, { module: loaded, exports: loaded.exports, require(name) { if (name.endsWith(".json")) return JSON.parse(fs.readFileSync(path.join(root,path.dirname(relative),name),"utf8")); if (name.startsWith("./")) return load(path.join(path.dirname(relative),name+".ts")); throw Error(`Unexpected audit dependency: ${name}`); } }); return loaded.exports;
}
const purpose = load('lib/visit-workflow.ts'), status = load('lib/treatment-status.ts'), clinic = load('lib/clinic-enrollment.ts'), options = load('lib/redcap-options.ts');
for (const [name, value] of Object.entries(clinic.clinicEnrollmentDefaults)) {
  const annotation = live.get(name)?.field_annotation ?? "";
  const match = annotation.match(/@DEFAULT\s*=\s*['"]([^'"]*)['"]/);
  if (match?.[1] !== value) issues.push(`${name}: app default differs from REDCap`);
}
const maps = { cnv_visit_purpose: purpose.clinicVisitPurposes, pv_visit_purpose: purpose.prepVisitPurposes, ptp_status: status.prepStatusChoices, pv_status_at_visit: status.prepStatusChoices, htp_care_status: status.hivStatusChoices, hcs_care_status: status.hivStatusChoices, ...clinic.clinicEnrollmentChoices, ce_district: options.districts.map((label, index) => [String(index + 1), label]), cne_district: options.districts.map((label, index) => [String(index + 1), label]), oc_district: options.districts.map((label, index) => [String(index + 1), label]), hcs_care_type: options.hivCareChoices };
for (const [name, pairs] of Object.entries(maps)) {
  const field = live.get(name); if (!field) continue;
  const expected = Object.fromEntries(field.select_choices_or_calculations.split('|').map(value => { const i = value.indexOf(','); return [value.slice(0, i).trim(), value.slice(i + 1).trim()]; }));
  const actual = Object.fromEntries(pairs);
  if (JSON.stringify(Object.entries(expected).sort()) !== JSON.stringify(Object.entries(actual).sort())) issues.push(`${name}: shared app choices differ`);
}
const forms = new Set(instruments.map(form => form.instrument_name));
// Check literal choices in rendered controls as well as shared option lists.
function checkControl(node, source, relative) {
  if (!ts.isJsxElement(node) && !ts.isJsxSelfClosingElement(node)) return;
  const opening = ts.isJsxElement(node) ? node.openingElement : node;
  const tag = opening.tagName.getText(source);
  if (!["Select", "ChoiceChecks", "YesNo"].includes(tag)) return;
  const attrs = opening.attributes.properties;
  const binding = attrs.find(attr => ["value", "values"].includes(attr.name?.getText(source)))?.initializer?.getText(source);
  const name = binding?.match(/\.(\w+)\}/)?.[1], field = live.get(name);
  if (!field) return;
  let codes = [];
  if (tag === "YesNo") codes = ["0", "1"];
  if (tag === "Select" && ts.isJsxElement(node)) codes = node.children.filter(ts.isJsxElement)
    .filter(child => child.openingElement.tagName.getText(source) === "option")
    .map(child => child.openingElement.attributes.properties.find(attr => attr.name?.getText(source) === "value")?.initializer)
    .filter(value => value && ts.isStringLiteral(value)).map(value => value.text);
  if (tag === "Select" && ts.isJsxElement(node)) {
    for (const child of node.children) {
      const expression = ts.isJsxExpression(child) ? child.expression : undefined;
      if (expression && ts.isCallExpression(expression) && ts.isPropertyAccessExpression(expression.expression)
        && expression.expression.name.text === "map" && ts.isArrayLiteralExpression(expression.expression.expression)) {
        codes.push(...expression.expression.expression.elements.filter(ts.isArrayLiteralExpression).map(item => item.elements[0]?.text));
      }
    }
  }
  const options = attrs.find(attr => attr.name?.getText(source) === "options")?.initializer?.expression;
  if (options && ts.isArrayLiteralExpression(options)) codes = options.elements.filter(ts.isArrayLiteralExpression).map(item => item.elements[0]?.text);
  const expected = choices(field);
  if (codes.length && expected.length && !sameCodes(codes, expected)) issues.push(`${relative}: ${name} control choices differ`);
}
function scan(directory) {
  for (const item of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
    const relative = path.join(directory, item.name);
    if (item.isDirectory()) { scan(relative); continue; }
    if (!/\.tsx?$/.test(relative)) continue;
    const source = ts.createSourceFile(relative, fs.readFileSync(path.join(root, relative), 'utf8'), ts.ScriptTarget.Latest, true);
    function visit(node) {
      checkControl(node, source, relative);
      if (ts.isStringLiteral(node) && /^(ce|oc|cne|cnv|ptp|pv|htp|htm|hcs|itp|itch|breakfast|cl)_\w+$/.test(node.text) && !live.has(node.text) && !forms.has(node.text) && !node.text.endsWith('_complete')) issues.push(`${relative}: unknown field ${node.text}`);
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
}
for (const directory of ['app', 'components', 'lib']) scan(directory);
if (issues.length) { console.error([...new Set(issues)].join('\n')); process.exitCode = 1; }
else console.log(`Live schema checks passed: ${metadata.length} fields, shared and inline choices, defaults, labels, validation and app field references. Read-only; no client data exported.`);
