//
//  migrate-patient-code.mjs
//  pils-app
//
//  Created by Elisa Kevin Veragoo + ChatGPT on 23/10/2026.
//
// Additive migration: never rename/delete the populated source field.
// node --env-file=.env.local scripts/migrate-patient-code.mjs prepare|copy|retire BACKUP_DIR
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const [phase, directory] = process.argv.slice(2);
assert.ok(['prepare', 'copy', 'retire'].includes(phase) && directory, 'Use prepare|copy|retire BACKUP_DIR');
const dir = path.resolve(directory);
async function api(params) {
  const response = await fetch(process.env.REDCAP_API_URL, {
    method: 'POST', signal: AbortSignal.timeout(120000),
    body: new URLSearchParams({ token: process.env.REDCAP_API_TOKEN, format: 'json', returnFormat: 'json', ...params }),
  });
  const result = await response.json();
  if (!response.ok || result?.error) throw Error('REDCap migration request failed; inspect project before retrying.');
  return result;
}
const save = (name, value) => fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(value), { mode: 0o600, flag: 'wx' });
const read = name => JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`)));
const rows = () => api({ content: 'record', action: 'export', type: 'flat', rawOrLabel: 'raw', exportSurveyFields: 'false' });
const key = row => JSON.stringify([row.uic_ori, row.redcap_event_name ?? '', row.redcap_repeat_instrument ?? '', row.redcap_repeat_instance ?? '']);
function verify(before, after, copied = false) {
  const indexed = new Map(after.map(row => [key(row), row]));
  assert.equal(indexed.size, after.length);
  assert.equal(after.length, before.length, 'Record count changed; stop and inspect');
  let codes = 0;
  for (const row of before) {
    const current = indexed.get(key(row));
    assert.ok(current, 'Existing record missing');
    for (const [field, value] of Object.entries(row)) {
      // Adding data to CNE may initialise its previously blank form-status field.
      if (field === 'clinic_enrollment_complete' && value === '') continue;
      assert.equal(current[field], value, `Existing field changed: ${field}`);
    }
    if (row.ce_patient_code) {
      assert.ok(!row.redcap_repeat_instrument && !row.redcap_repeat_instance, 'Source unexpectedly repeats');
      if (copied) assert.equal(current.cne_patient_code, row.ce_patient_code, 'Copied patient code differs');
      codes++;
    }
  }
  return codes;
}
const metadata = await api({ content: 'metadata' });
if (phase === 'prepare') {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const source = metadata.find(f => f.field_name === 'ce_patient_code');
  assert.equal(source?.form_name, 'client_enrollment');
  assert.equal(source.field_type, 'text');
  assert.ok(!metadata.some(f => f.field_name === 'cne_patient_code'));
  assert.ok(metadata.some(f => f.field_name === 'cne_date' && f.form_name === 'clinic_enrollment'));
  assert.ok(!metadata.some(f => Object.values(f).some(v => String(v).includes('[ce_patient_code'))), 'Source has schema references requiring migration');
  const before = await rows();
  const codes = verify(before, before);
  save('metadata-before', metadata); save('records-before', before);
  const target = structuredClone(metadata);
  target.splice(target.findIndex(f => f.field_name === 'cne_date') + 1, 0, { ...source, field_name: 'cne_patient_code', form_name: 'clinic_enrollment' });
  save('metadata-added', target);
  console.log(`Backed up ${before.length} rows; ${codes} populated patient codes. No remote changes.`);
} else if (phase === 'copy') {
  assert.deepEqual(metadata, read('metadata-before'), 'Schema changed since backup');
  const before = read('records-before');
  assert.deepEqual(await rows(), before, 'Records changed since backup');
  const target = read('metadata-added');
  await api({ content: 'metadata', data: JSON.stringify(target) });
  assert.deepEqual(await api({ content: 'metadata' }), target);
  const payload = before.filter(row => row.ce_patient_code).map(row => ({
    uic_ori: row.uic_ori,
    ...(row.redcap_event_name ? { redcap_event_name: row.redcap_event_name } : {}),
    cne_patient_code: row.ce_patient_code,
  }));
  verify(before, await rows());
  for (let i = 0; i < payload.length; i += 100) {
    await api({ content: 'record', action: 'import', type: 'flat', overwriteBehavior: 'normal', forceAutoNumber: 'false', returnContent: 'count', data: JSON.stringify(payload.slice(i, i + 100)) });
  }
  const after = await rows(), codes = verify(before, after, true);
  save('records-after-copy', after);
  save('verification', { rows: after.length, codes, existingValuesPreserved: true });
  console.log(`Copied and verified ${codes} codes exactly; original values retained.`);
} else {
  assert.deepEqual(metadata, read('metadata-added'));
  const before = read('records-before'), after = await rows();
  const codes = verify(before, after, true);
  const target = metadata.map(f => f.field_name === 'ce_patient_code' ? { ...f, field_annotation: [f.field_annotation, '@HIDDEN'].filter(Boolean).join(' '), required_field: '' } : f);
  await api({ content: 'metadata', data: JSON.stringify(target) });
  assert.deepEqual(await api({ content: 'metadata' }), target);
  verify(before, await rows(), true);
  save('metadata-final', target);
  console.log(`Original field hidden, retained intact. Verified ${codes} codes and ${after.length} rows.`);
}
