import fs from 'node:fs';
import assert from 'node:assert/strict';

// Explicit schema/data migration. Backups include sensitive clinical records;
// keep this ignored directory private and never commit its contents.
const phase = process.argv[2];
assert.ok(['prepare', 'apply'].includes(phase), 'Use prepare|apply');
const dir = '.redcap-backups/prep-syphilis-cnv-20261023';
const fieldName = 'pv_syphilis_result';
async function api(params) {
  const response = await fetch(process.env.REDCAP_API_URL, { method: 'POST', signal: AbortSignal.timeout(120000), body: new URLSearchParams({ token: process.env.REDCAP_API_TOKEN, format: 'json', returnFormat: 'json', ...params }) });
  const data = await response.json();
  if (!response.ok || data?.error) throw Error('REDCap migration request failed; inspect the saved backup before retrying.');
  return data;
}
const records = () => api({ content: 'record', action: 'export', type: 'flat', rawOrLabel: 'raw' });
const save = (name, value) => fs.writeFileSync(`${dir}/${name}.json`, JSON.stringify(value), { mode: 0o600, flag: 'wx' });
const read = name => JSON.parse(fs.readFileSync(`${dir}/${name}.json`));
const key = row => JSON.stringify([row.uic_ori, row.redcap_event_name ?? '', row.redcap_repeat_instrument ?? '', row.redcap_repeat_instance ?? '']);
const metadata = await api({ content: 'metadata' });
assert.ok(Array.isArray(metadata));
if (phase === 'prepare') {
  const field = metadata.find(item => item.field_name === fieldName);
  const template = metadata.find(item => item.field_name === 'cnv_syp_lab_result');
  assert.equal(field?.field_type, 'text');
  assert.equal(template?.field_type, 'radio');
  assert.equal(template.select_choices_or_calculations.replace(/\s+/g, ''), '1,Positive|2,Negative|3,Indeterminate|4,Invalid');
  const before = await records();
  assert.ok(Array.isArray(before));
  const changes = [];
  const codes = { positive: '1', negative: '2', indeterminate: '3', invalid: '4' };
  for (const row of before) {
    const value = String(row[fieldName] ?? '').trim();
    if (!value) continue;
    // A legacy numeric string may be a titre, not a radio code. Never guess.
    const code = codes[value.toLowerCase()];
    assert.ok(code, 'An ambiguous legacy result requires manual review; no remote changes made.');
    assert.equal(row.redcap_repeat_instrument, 'prep_visit');
    assert.ok(row.redcap_repeat_instance);
    changes.push({ key: key(row), import: { uic_ori: row.uic_ori, ...(row.redcap_event_name ? { redcap_event_name: row.redcap_event_name } : {}), redcap_repeat_instrument: row.redcap_repeat_instrument, redcap_repeat_instance: row.redcap_repeat_instance, [fieldName]: code } });
  }
  const target = structuredClone(metadata);
  Object.assign(target.find(item => item.field_name === fieldName), { field_type: 'radio', field_label: template.field_label, select_choices_or_calculations: template.select_choices_or_calculations, text_validation_type_or_show_slider_number: '', text_validation_min: '', text_validation_max: '' });
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  save('metadata-before', metadata); save('metadata-after', target);
  save('records-before', before); save('changes', changes);
  console.log(`Prepared CNV-style PrEP syphilis choices; ${changes.length} exact-label conversions backed up. No remote changes.`);
} else {
  const before = read('records-before'), target = read('metadata-after'), changes = read('changes');
  const conversions = new Map(changes.map(change => [change.key, change.import[fieldName]]));
  function verify(rows, final) {
    assert.equal(rows.length, before.length, 'Record rows changed; stop and review.');
    const indexed = new Map(rows.map(row => [key(row), row]));
    for (const row of before) {
      const current = indexed.get(key(row)); assert.ok(current, 'Existing record row missing.');
      for (const [name, value] of Object.entries(row)) {
        if (name === fieldName && conversions.has(key(row))) {
          assert.ok(current[name] === conversions.get(key(row)) || (!final && current[name] === value), 'Legacy result changed since backup; stop and review.');
        } else assert.equal(current[name], value, 'An existing value changed since backup; stop and review.');
      }
    }
  }
  // Also permits a retry after metadata/part of the exact conversion already succeeded.
  assert.ok(JSON.stringify(metadata) === JSON.stringify(read('metadata-before')) || JSON.stringify(metadata) === JSON.stringify(target), 'Schema changed since backup.');
  verify(await records(), false);
  if (JSON.stringify(metadata) !== JSON.stringify(target)) await api({ content: 'metadata', data: JSON.stringify(target) });
  assert.deepEqual(await api({ content: 'metadata' }), target);
  if (changes.length) await api({ content: 'record', action: 'import', type: 'flat', overwriteBehavior: 'normal', forceAutoNumber: 'false', returnContent: 'count', data: JSON.stringify(changes.map(change => change.import)) });
  verify(await records(), true);
  if (!fs.existsSync(`${dir}/verification.json`)) save('verification', { convertedResults: changes.length, otherExistingValuesPreserved: true });
  console.log(`CNV-style PrEP syphilis field verified; ${changes.length} exact-label conversions verified. All other existing values preserved.`);
}
