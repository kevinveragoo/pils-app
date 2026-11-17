//
//  add-clinic-no-show.mjs
//  pils-app
//
//  Created by Elisa Kevin Veragoo + ChatGPT on 21/10/2026.
//
// Additive schema migration; never imports or deletes patient records.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const dir = '.redcap-backups/clinic-no-show-20261021';
const phase = process.argv[2];
assert.ok(['prepare', 'apply'].includes(phase), 'Use prepare|apply');
async function api(params) {
  const response = await fetch(process.env.REDCAP_API_URL, { method: 'POST', signal: AbortSignal.timeout(120000), body: new URLSearchParams({ token: process.env.REDCAP_API_TOKEN, format: 'json', returnFormat: 'json', ...params }) });
  const result = await response.json();
  if (!response.ok || result?.error || !Array.isArray(result) && params.content !== 'metadata') throw Error('REDCap migration request failed');
  return result;
}
const save = (name, value) => fs.writeFileSync(`${dir}/${name}.json`, JSON.stringify(value), { mode: 0o600, flag: 'wx' });
const read = name => JSON.parse(fs.readFileSync(`${dir}/${name}.json`));
const records = () => api({ content: 'record', action: 'export', type: 'flat', rawOrLabel: 'raw' });
const metadata = await api({ content: 'metadata' });
if (phase === 'prepare') {
  assert.ok(!metadata.some(f => f.field_name === 'cnv_no_show'));
  const index = metadata.findIndex(f => f.field_name === 'cnv_date');
  assert.ok(index >= 0);
  const field = Object.fromEntries(Object.keys(metadata[index]).map(key => [key, '']));
  Object.assign(field, { field_name: 'cnv_no_show', form_name: 'clinic_visit', field_type: 'yesno', field_label: 'No show', field_note: 'Select Yes if the client was expected on this date but did not attend.' });
  const keep = new Set(['cnv_client_hdr', 'cnv_worker_1', 'cnv_date']);
  const target = metadata.map(f => f.form_name === 'clinic_visit' && !keep.has(f.field_name) ? { ...f, branching_logic: f.branching_logic ? `([cnv_no_show] <> '1') and (${f.branching_logic})` : "[cnv_no_show] <> '1'" } : f);
  target.splice(index + 1, 0, field);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  save('metadata-before', metadata); save('metadata-after', target);
  const before = await records(); save('records-before', before);
  console.log(`Backed up ${before.length} rows; staged no-show field and conditional clinical questions. No remote changes.`);
} else {
  assert.deepEqual(metadata, read('metadata-before'), 'Live metadata changed; inspect before proceeding');
  const target = read('metadata-after');
  await api({ content: 'metadata', data: JSON.stringify(target) });
  assert.deepEqual(await api({ content: 'metadata' }), target);
  const before = read('records-before'), after = await records();
  const key = row => JSON.stringify([row.uic_ori, row.redcap_event_name ?? '', row.redcap_repeat_instrument ?? '', row.redcap_repeat_instance ?? '']);
  const indexed = new Map(after.map(row => [key(row), row]));
  assert.equal(after.length, before.length);
  for (const row of before) {
    const current = indexed.get(key(row)); assert.ok(current);
    for (const [field, value] of Object.entries(row)) assert.equal(current[field], value, `Existing field changed: ${field}`);
    assert.equal(current.cnv_no_show ?? '', '', 'Historical visits must remain unclassified');
  }
  save('verification', { rows: before.length, existingValuesPreserved: true, recordImports: 0 });
  console.log(`Schema updated; ${before.length} rows preserved exactly. No patient record imports.`);
}
