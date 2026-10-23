// Elisa Kevin Veragoo + ChatGPT
// Additive migration: original field definitions and values are never removed.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const dir=process.env.CNV_BACKUP_DIR;
if(!dir||!dir.startsWith('/tmp/'))throw Error('Set a private /tmp CNV_BACKUP_DIR.');
fs.mkdirSync(dir,{recursive:true,mode:0o700});
const pairs=[['cnv_next_med_collection','cnv_next_med_date'],['cnv_next_blood_test','cnv_next_blood_date'],['cnv_next_doctor_review','cnv_next_doctor_date']];
const overall='cnv_next_appointment_date',fallback='cnv_legacy_next_date';
const phase=process.argv[2];
async function api(p){const r=await fetch(process.env.REDCAP_API_URL,{method:'POST',body:new URLSearchParams({token:process.env.REDCAP_API_TOKEN,format:'json',returnFormat:'json',...p}),signal:AbortSignal.timeout(120000)});const d=await r.json();if(!r.ok||d?.error)throw Error(d?.error||'REDCap request failed');return d;}
function save(name,data){fs.writeFileSync(`${dir}/${name}.json`,JSON.stringify(data,null,2),{mode:0o600,flag:'wx'});}
const metadata=await api({content:'metadata'});const id=metadata[0].field_name;
async function records(){const fields=[id,...metadata.filter(f=>f.form_name==='clinic_visit').map(f=>f.field_name)];return await api({content:'record',action:'export',type:'flat',rawOrLabel:'raw',...Object.fromEntries(fields.map((f,i)=>[`fields[${i}]`,f]))});}
function key(row){return [row[id],row.redcap_event_name||'',row.redcap_repeat_instrument||'',row.redcap_repeat_instance||''].join('|');}
const oldNames=[...pairs.map(([old])=>old),'cnv_next_appt'];
if(phase==='prepare'){
 save('metadata-before',metadata);save('records-before',await records());
 const pv=metadata.find(f=>f.field_name==='pv_next_appointment_date');assert.ok(pv?.field_annotation.startsWith('@CALCTEXT('));
 let calc=pv.field_annotation.replaceAll('pv_next_','cnv_next_');
 const inside=calc.slice('@CALCTEXT('.length,-1);
 calc=`@CALCTEXT(if(isblankormissingcode([cnv_next_med_date]) and isblankormissingcode([cnv_next_blood_date]) and isblankormissingcode([cnv_next_doctor_date]), [${fallback}], ${inside}))`;
 const updated=structuredClone(metadata);
 for(const [old,name] of pairs){assert.ok(!metadata.some(f=>f.field_name===name));const field={...metadata.find(f=>f.field_name===old),field_name:name,section_header:''};updated.splice(updated.findIndex(f=>f.field_name===old),0,field);}
 const original=metadata.find(f=>f.field_name==='cnv_next_appt');
 const legacy={...original,field_name:fallback,field_label:'Historical next appointment date (fallback)',text_validation_type_or_show_slider_number:'date_dmy',field_annotation:'@HIDDEN',section_header:''};
 const final={...legacy,field_name:overall,field_label:'Next appointment date',field_annotation:calc,field_note:'Earliest service follow-up date. Uses the historical appointment date only when all service dates are blank.'};
 updated.splice(updated.findIndex(f=>f.field_name==='cnv_next_appt'),0,legacy,final);
 save('metadata-added',updated);console.log('Prepared private metadata and clinic-visit backups; five additive fields staged.');
}else if(phase==='schema'){
 assert.deepEqual(metadata,JSON.parse(fs.readFileSync(`${dir}/metadata-before.json`)));
 const target=JSON.parse(fs.readFileSync(`${dir}/metadata-added.json`));await api({content:'metadata',data:JSON.stringify(target)});assert.deepEqual(await api({content:'metadata'}),target);console.log('Additive schema verified; original fields remain visible and unchanged.');
}else if(phase==='identify'){
 const rows=await records();assert.ok(rows.some(r=>r[id]&&r.redcap_repeat_instrument==='clinic_visit'));
 save('records-identified-before',rows);console.log('Identified record/instance backup verified; no data writes have occurred.');
}else if(phase==='copy'){
 const before=JSON.parse(fs.readFileSync(`${dir}/records-identified-before.json`)), current=await records();const currentMap=new Map(current.map(r=>[key(r),r]));
 const writes=[];
 for(const row of before.filter(r=>r.redcap_repeat_instrument==='clinic_visit')){
  const now=currentMap.get(key(row));assert.ok(now);for(const f of oldNames)assert.equal(now[f],row[f],'Source changed since backup; stop.');
  const write=Object.fromEntries([id,'redcap_event_name','redcap_repeat_instrument','redcap_repeat_instance'].filter(f=>row[f]).map(f=>[f,row[f]]));
  const dates=[];for(const [old,name] of pairs){if(row[old]){assert.match(row[old],/^\d{4}-\d{2}-\d{2}$/);assert.ok(!now[name]||now[name]===row[old]);write[name]=row[old];dates.push(row[old]);}}
  if(row.cnv_next_appt){assert.match(row.cnv_next_appt,/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);write[fallback]=row.cnv_next_appt.slice(0,10);}
  const next=dates.sort()[0]||write[fallback];if(next)write[overall]=next;
  if(Object.keys(write).some(f=>f===overall))writes.push(write);
 }
 assert.ok(writes.length,'No migrations generated');save('copy-payload-identified',writes);
 for(let i=0;i<writes.length;i+=100)await api({content:'record',action:'import',type:'flat',overwriteBehavior:'normal',data:JSON.stringify(writes.slice(i,i+100))});
 const after=await records();save('records-after-verified',after);const map=new Map(after.map(r=>[key(r),r]));
 for(const row of before){const now=map.get(key(row));assert.ok(now);for(const [field,value]of Object.entries(row))if(![...pairs.map(([,name])=>name),overall,fallback].includes(field))assert.equal(now[field],value,`Existing value changed: ${field}`);}
 for(const row of writes){const now=map.get(key(row));for(const [field,value]of Object.entries(row))assert.equal(now[field],value,`Copied value differs: ${field}`);}
 console.log(`Verified ${writes.length} migrated instances; every pre-existing clinic-visit value unchanged.`);
}else if(phase==='verify'){
 const before=JSON.parse(fs.readFileSync(`${dir}/records-identified-before.json`)), writes=JSON.parse(fs.readFileSync(`${dir}/copy-payload-identified.json`)),after=await records();
 const map=new Map(after.map(r=>[key(r),r]));assert.equal(map.size,after.length);assert.equal(after.length,before.length);
 for(const row of before){const now=map.get(key(row));assert.ok(now);for(const [field,value]of Object.entries(row))if(![...pairs.map(([,name])=>name),overall,fallback].includes(field))assert.equal(now[field],value,`Existing value changed: ${field}`);}
 for(const row of writes){const now=map.get(key(row));for(const [field,value]of Object.entries(row))assert.equal(now[field],value,`Copied value differs: ${field}`);}
 save('verification',{instances:writes.length,existingRows:before.length,allOriginalValuesUnchanged:true});console.log(`Verified ${writes.length} migrated instances; all ${before.length} existing rows preserved.`);
}else if(phase==='hide'){
 const verification=JSON.parse(fs.readFileSync(`${dir}/verification.json`));assert.ok(verification.allOriginalValuesUnchanged);
 const target=metadata.map(f=>oldNames.includes(f.field_name)?{...f,field_annotation:[f.field_annotation,'@HIDDEN'].filter(Boolean).join(' ')}:f);
 await api({content:'metadata',data:JSON.stringify(target)});assert.deepEqual(await api({content:'metadata'}),target);save('metadata-final',target);console.log('Original fields hidden, retained with original date/time data.');
}else throw Error('Use prepare, schema, copy or hide.');
