// Additive metadata-only migration. Never imports or deletes patient records.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const phase = process.argv[2];
assert.ok(['prepare', 'apply'].includes(phase), 'Use prepare|apply');
const dir = '.redcap-backups/medication-proxy-20261117';
async function api(params) {
  const response = await fetch(process.env.REDCAP_API_URL, { method: 'POST', signal: AbortSignal.timeout(120000), body: new URLSearchParams({ token: process.env.REDCAP_API_TOKEN, format: 'json', returnFormat: 'json', ...params }) });
  const result = await response.json();
  if (!response.ok || result?.error) throw Error('REDCap proxy migration request failed; inspect private backups before retrying.');
  return result;
}
const save = (name, value) => fs.writeFileSync(`${dir}/${name}.json`, JSON.stringify(value), { mode: 0o600, flag: 'wx' });
const read = name => JSON.parse(fs.readFileSync(`${dir}/${name}.json`));
const records = () => api({ content: 'record', action: 'export', type: 'flat', rawOrLabel: 'raw', 'forms[0]': 'clinic_visit', 'forms[1]': 'prep_visit' });
const metadata = await api({ content: 'metadata' });
assert.ok(Array.isArray(metadata));
if (phase === 'prepare') {
  const target = structuredClone(metadata);
  for (const [prefix, form, anchor] of [['cnv', 'clinic_visit', 'cnv_next_med_date'], ['pv', 'prep_visit', 'pv_next_med_date']]) {
    assert.ok(!target.some(field => field.field_name === `${prefix}_med_collected_proxy`), 'Proxy fields already exist; inspect before reapplying.');
    const template = target.find(field => field.field_name === anchor);
    assert.ok(template && template.form_name === form && template.branching_logic);
    const blank = Object.fromEntries(Object.keys(template).map(key => [key, '']));
    const common = { ...blank, form_name: form };
    const collected = { ...common, field_name: `${prefix}_med_collected_proxy`, field_type: 'yesno', field_label: 'Medication collected by someone else?', branching_logic: template.branching_logic };
    const name = { ...common, field_name: `${prefix}_med_proxy_name`, field_type: 'text', field_label: 'Name of person collecting medication', required_field: 'y', branching_logic: `(${template.branching_logic}) and ([${prefix}_med_collected_proxy] = '1')` };
    target.splice(target.indexOf(template), 0, collected, name);
  }
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  save('metadata-before', metadata);save('metadata-after', target);save('records-before', await records());
  console.log('Prepared four additive proxy fields. Private schema/record backups saved; no remote changes.');
} else {
  assert.deepEqual(metadata, read('metadata-before'), 'Live metadata changed; do not overwrite it.');
  const before = await records();
  // Refresh the data backup immediately before the metadata-only update.
  save('records-at-apply', before);
  const target = read('metadata-after');
  await api({ content: 'metadata', data: JSON.stringify(target) });
  assert.deepEqual(await api({ content: 'metadata' }), target);
  const after = await records();
  assert.equal(after.length, before.length, 'Record count changed during verification.');
  // Form-restricted REDCap exports omit identity fields. Compare complete row
  // multisets (including duplicate multiplicity), without relying on row order.
  const added = new Set(['cnv_med_collected_proxy', 'cnv_med_proxy_name', 'pv_med_collected_proxy', 'pv_med_proxy_name']);
  const digest = row => createHash('sha256').update(JSON.stringify(Object.entries(row).filter(([field]) => !added.has(field)).sort(([a], [b]) => a.localeCompare(b)))).digest('hex');
  assert.deepEqual(after.map(digest).sort(), before.map(digest).sort(), 'Existing values changed; inspect private backups.');
  for (const row of after) for (const field of added) assert.equal(row[field] ?? '', '');
  save('verification', { rows: before.length, existingValuesPreserved: true, fieldsAdded: 4, recordImports: 0 });
  console.log(`Four fields added; ${before.length} existing rows preserved. No patient records imported or deleted.`);
}
