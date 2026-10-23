// Elisa Kevin Veragoo + ChatGPT
import fs from 'node:fs';
import assert from 'node:assert/strict';
const dir = '.redcap-backups/clinic-other-services-20261023';
const phase = process.argv[2];
assert.ok(['prepare', 'apply'].includes(phase), 'Use prepare|apply');
async function api(params) {
  const response = await fetch(process.env.REDCAP_API_URL, { method: 'POST', signal: AbortSignal.timeout(120000), body: new URLSearchParams({ token: process.env.REDCAP_API_TOKEN, format: 'json', returnFormat: 'json', ...params }) });
  const result = await response.json();
  if (!response.ok || result?.error) throw Error('REDCap migration request failed');
  return result;
}
const save = (name, value) => fs.writeFileSync(`${dir}/${name}.json`, JSON.stringify(value), { mode: 0o600, flag: 'wx' });
const read = name => JSON.parse(fs.readFileSync(`${dir}/${name}.json`));
const records = () => api({ content: 'record', action: 'export', type: 'flat', rawOrLabel: 'raw' });
const metadata = await api({ content: 'metadata' });
if (phase === 'prepare') {
  assert.ok(Array.isArray(metadata));
  assert.ok(!metadata.some(f => f.field_name === 'cnv_next_other_date'));
  const template = metadata.find(f => f.field_name === 'cnv_next_blood_date');
  assert.equal(template?.form_name, 'clinic_visit');
  const target = structuredClone(metadata);
  const index = target.findIndex(f => f.field_name === 'cnv_section_15_hdr');
  assert.ok(index > 0 && target[index - 1].field_name === 'cnv_other_refer_where', 'Review other services section placement');
  target.splice(index, 0, { ...template, field_name: 'cnv_next_other_date', field_label: 'Next other services appointment date', section_header: '', branching_logic: "([cnv_no_show] <> '1') and ([cnv_visit_purpose(99)] = '1')", field_annotation: '', field_note: '' });
  const calculated = target.find(f => f.field_name === 'cnv_next_appointment_date');
  const match = calculated.field_annotation.match(/^@CALCTEXT\((.*)\)$/s);
  assert.ok(match, 'Unexpected next appointment formula');
  const previous = match[1];
  const oldBlank = ['cnv_next_med_date', 'cnv_next_blood_date', 'cnv_next_doctor_date', 'cnv_next_addicto_date', 'cnv_next_lab_review_date'].map(name => `isblankormissingcode([${name}])`).join(' and ');
  // Preserve the old expression exactly when the new field is blank. When only
  // the new service date exists, it takes precedence over the historical date.
  calculated.field_annotation = `@CALCTEXT(if(isblankormissingcode([cnv_next_other_date]), ${previous}, if(${oldBlank}, [cnv_next_other_date], if([cnv_next_other_date] <= ${previous}, [cnv_next_other_date], ${previous}))))`;
  calculated.field_note = 'Earliest service follow-up date, including laboratory results review and other services. Uses the historical appointment date only when all service dates are blank.';
  assert.ok(calculated.field_annotation.length < 60000);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  save('metadata-before', metadata); save('metadata-after', target);
  const before = await records(); assert.ok(Array.isArray(before)); save('records-before', before);
  console.log(`Backed up ${before.length} rows. Staged other services follow-up date and updated calculation; no remote changes.`);
} else {
  assert.deepEqual(metadata, read('metadata-before'), 'Schema changed since backup');
  const target = read('metadata-after');
  await api({ content: 'metadata', data: JSON.stringify(target) });
  assert.deepEqual(await api({ content: 'metadata' }), target);
  const before = read('records-before'), after = await records();
  const key = row => JSON.stringify([row.uic_ori, row.redcap_event_name ?? '', row.redcap_repeat_instrument ?? '', row.redcap_repeat_instance ?? '']);
  const indexed = new Map(after.map(row => [key(row), row]));
  assert.equal(after.length, before.length);
  for (const row of before) {
    const current = indexed.get(key(row)); assert.ok(current);
    for (const [field, value] of Object.entries(row)) assert.equal(current[field], value, `Existing value changed: ${field}`);
    assert.equal(current.cnv_next_other_date ?? '', '');
  }
  save('verification', { rows: before.length, existingValuesPreserved: true, recordImports: 0 });
  console.log(`Schema and formula updated; all ${before.length} existing rows preserved. No patient record imports.`);
}
