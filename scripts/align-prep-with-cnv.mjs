import fs from 'node:fs';
import assert from 'node:assert/strict';
import { planPrepCnvAlignment } from '../lib/prep-cnv-alignment.mjs';
const dir = '.redcap-backups/prep-cnv-alignment-20261023-v2';
const phase = process.argv[2];
assert.ok(['prepare','apply'].includes(phase), 'Use prepare|apply');
async function api(params) {
  const response = await fetch(process.env.REDCAP_API_URL, { method:'POST', signal:AbortSignal.timeout(120000), body:new URLSearchParams({token:process.env.REDCAP_API_TOKEN,format:'json',returnFormat:'json',...params}) });
  const result=await response.json(); if (!response.ok || result?.error) throw Error('REDCap alignment request failed. Review the saved backup before retrying.'); return result;
}
const metadata = () => api({content:'metadata'});
const records = () => api({content:'record',action:'export',type:'flat',rawOrLabel:'raw'});
const save = (name,value) => fs.writeFileSync(`${dir}/${name}.json`,JSON.stringify(value),{mode:0o600,flag:'wx'});
const read = name => JSON.parse(fs.readFileSync(`${dir}/${name}.json`));
const key = row => JSON.stringify([row.uic_ori,row.redcap_event_name??'',row.redcap_repeat_instrument??'',row.redcap_repeat_instance??'']);
if (phase === 'prepare') {
  const beforeMetadata=await metadata(), before=await records();assert.ok(Array.isArray(beforeMetadata)&&Array.isArray(before));
  const plan=planPrepCnvAlignment(beforeMetadata,before);
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  save('metadata-before',beforeMetadata);save('records-before',before);save('plan',plan);
  console.log(`Prepared ${plan.changedNames.length} field definitions and ${plan.changes.length} exact-meaning row updates. No remote changes. Per-infection dates are not fabricated.`);
} else {
  const plan=read('plan'), before=read('records-before'), expected=new Map(plan.changes.map(change=>[key(change.identity),change.values]));
  const current=await metadata();
  // Once data codes are inverted this operation must not be replayed. This
  // strict precondition also blocks a second apply after partial completion.
  assert.deepEqual(current,read('metadata-before'),'Schema changed/already applied. Review backups before recovery; do not replay inverted-code updates.');
  assert.deepEqual(await records(),before,'Records changed since backup. Re-prepare in a new backup directory after review.');
  await api({content:'metadata',data:JSON.stringify(plan.metadata)});
  assert.deepEqual(await metadata(),plan.metadata);
  if(plan.changes.length) await api({content:'record',action:'import',type:'flat',overwriteBehavior:'normal',forceAutoNumber:'false',returnContent:'count',data:JSON.stringify(plan.changes.map(change=>({...change.identity,...change.values})))});
  const after=await records();assert.equal(after.length,before.length);
  const indexed=new Map(after.map(row=>[key(row),row]));
  for(const row of before){const actual=indexed.get(key(row));assert.ok(actual);const updates=expected.get(key(row))??{};for(const [name,value]of Object.entries(row))assert.equal(actual[name],Object.hasOwn(updates,name)?updates[name]:value,'Unexpected existing value change. Review private backups.');for(const [name,value]of Object.entries(updates))assert.equal(actual[name],value);}
  save('verification',{rowsUpdated:plan.changes.length,otherExistingValuesPreserved:true,perInfectionDatesFabricated:0});
  console.log(`PrEP/CNV alignment verified for ${plan.changes.length} updated rows. All other existing values preserved.`);
}
