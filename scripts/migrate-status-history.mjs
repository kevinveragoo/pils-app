//
//  migrate-status-history.mjs
//  pils-app
//
//  Created by Elisa Kevin Veragoo + ChatGPT on 11/10/2026.
//
// Explicit staged migration. Metadata and records are backed up outside the repository.
import fs from 'node:fs';
const url=process.env.REDCAP_API_URL,token=process.env.REDCAP_API_TOKEN;
async function api(params){const r=await fetch(url,{method:'POST',body:new URLSearchParams({token,...params}),signal:AbortSignal.timeout(120000)});const d=await r.json();if(!r.ok||d?.error)throw Error(d?.error||'REDCap request failed');return d;}
const phase=process.argv[2];
const metadata=await api({content:'metadata',format:'json',returnFormat:'json'});
const added=[];
function add(after,name,form,label,type='text',choices='',branch='',annotation=''){
 if(metadata.some(f=>f.field_name===name))return;
 const blank=Object.fromEntries(Object.keys(metadata[0]).map(key=>[key,'']));
 const field={...blank,field_name:name,form_name:form,field_label:label,field_type:type,select_choices_or_calculations:choices,branching_logic:branch,field_annotation:annotation};
 if(name.endsWith('_status_date'))field.text_validation_type_or_show_slider_number='date_dmy';
 metadata.splice(metadata.findIndex(f=>f.field_name===after)+1,0,field);added.push(name);
}
if(phase==='schema'){
 fs.writeFileSync('/tmp/pils-status-history-schema-backup.json',JSON.stringify(metadata),{mode:0o600});
 for(const [prefix,form,dateField,statusField,choices] of [['pv','prep_visit','pv_visit_date','pv_status_at_visit',null],['hcs','hiv_care_support','hcs_date','hcs_care_status',metadata.find(f=>f.field_name==='htp_care_status').select_choices_or_calculations]]){
  add(dateField,`${prefix}_status_only`,form,'Status update only?','yesno');
  if(choices)add(`${prefix}_status_only`,statusField,form,'Current ARV care status','dropdown',choices);
  add(statusField,`${prefix}_status_date`,form,'Status effective date (leave blank if unknown)');
  add(`${prefix}_status_date`,`${prefix}_status_date_unknown`,form,'Historical status date unknown?','yesno');
  add(`${prefix}_status_date_unknown`,`${prefix}_status_reason`,form,'Reason for status change','notes');
  add(`${prefix}_status_reason`,`${prefix}_status_source`,form,'Status migration source','text','','','@HIDDEN');
  const protectedFields=new Set([dateField,`${prefix}_status_only`,statusField,`${prefix}_status_date`,`${prefix}_status_date_unknown`,`${prefix}_status_reason`,`${prefix}_status_source`,prefix==='pv'?'pv_recorded_by':'hcs_navigator_1']);
  for(const f of metadata.filter(f=>f.form_name===form))if(!protectedFields.has(f.field_name)){
   const guard=`[${prefix}_status_only] <> '1'`;
   if(!f.branching_logic.includes(guard))f.branching_logic=f.branching_logic?`(${f.branching_logic}) and ${guard}`:guard;
  }
 }
 const purpose=metadata.find(f=>f.field_name==='pv_visit_purpose');if(!purpose.select_choices_or_calculations.split('|').some(x=>x.trim().startsWith('4,')))purpose.select_choices_or_calculations+=' | 4, Status update';
 await api({content:'metadata',format:'json',data:JSON.stringify(metadata),returnFormat:'json'});
 const actual=await api({content:'metadata',format:'json',returnFormat:'json'});if(JSON.stringify(actual)!==JSON.stringify(metadata))throw Error('Schema verification failed');
 fs.writeFileSync('/tmp/pils-status-history-schema.json',JSON.stringify(actual),{mode:0o600});console.log('Status history fields added and status-only branching verified. Profile fields remain visible.');
}else if(phase==='migrate'){
 const params={content:'record',action:'export',format:'json',type:'flat',rawOrLabel:'raw',returnFormat:'json'};
 ['client_enrollment','prep_treatment_profile','hiv_treatment_profile','prep_visit','hiv_care_support'].forEach((f,i)=>params[`forms[${i}]`]=f);
 const rows=await api(params);if(!Array.isArray(rows))throw Error('Invalid record export');
 if(!fs.existsSync('/tmp/pils-status-history-records-backup.json'))fs.writeFileSync('/tmp/pils-status-history-records-backup.json',JSON.stringify(rows),{mode:0o600});
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Indian/Mauritius'}).format(new Date()),pending=[];
 const maxima=new Map();for(const row of rows){const key=`${row.uic_ori}:${row.redcap_repeat_instrument}`;maxima.set(key,Math.max(maxima.get(key)||0,Number(row.redcap_repeat_instance)||0));}
 for(const row of rows)for(const [profile,prefix,field,old,dateField] of [['prep_treatment_profile','pv','pv_status_at_visit','ptp_status','ptp_effective_date'],['hiv_treatment_profile','hcs','hcs_care_status','htp_care_status','htp_effective_date']]){
  if(row.redcap_repeat_instrument && row.redcap_repeat_instrument!==profile)continue;
  if(!row[old])continue;
  const source=`profile-status-v1:${profile}:${row.redcap_repeat_instance||'base'}`;
  if(rows.some(existing=>existing.uic_ori===row.uic_ori&&existing[`${prefix}_status_source`]===source))continue;
  const form=prefix==='pv'?'prep_visit':'hiv_care_support',key=`${row.uic_ori}:${form}`,instance=(maxima.get(key)||0)+1;maxima.set(key,instance);
  const date=row[dateField]||'';
  pending.push({uic_ori:row.uic_ori,redcap_repeat_instrument:form,redcap_repeat_instance:String(instance),[prefix==='pv'?'pv_visit_date':'hcs_date']:date||today,[prefix==='pv'?'pv_recorded_by':'hcs_navigator_1']:'Historical status migration',[field]:row[old],[`${prefix}_status_date`]:date,[`${prefix}_status_date_unknown`]:date?'0':'1',[`${prefix}_status_only`]:'1',[`${prefix}_status_reason`]:'Migrated from existing treatment profile; original profile data retained',[`${prefix}_status_source`]:source,...(prefix==='pv'?{pv_visit_purpose___4:'1'}:{})});
 }
 fs.writeFileSync('/tmp/pils-status-history-import-plan.json',JSON.stringify(pending),{mode:0o600});
 // Re-export before mutation to detect changes that could cause an instance collision.
 const fresh=await api(params);if(JSON.stringify(fresh)!==JSON.stringify(rows))throw Error('Records changed during migration planning; rerun before writing');
 for(let i=0;i<pending.length;i+=100)await api({content:'record',action:'import',format:'json',type:'flat',overwriteBehavior:'normal',forceAutoNumber:'false',dateFormat:'YMD',data:JSON.stringify(pending.slice(i,i+100)),returnContent:'count',returnFormat:'json'});
 const actual=await api(params);
 for(const saved of pending){const found=actual.find(r=>r.uic_ori===saved.uic_ori&&r.redcap_repeat_instrument===saved.redcap_repeat_instrument&&String(r.redcap_repeat_instance)===String(saved.redcap_repeat_instance));if(!found||Object.entries(saved).some(([k,v])=>String(found[k]??'')!==String(v??'')))throw Error('Migrated status verification failed');}
 for(const old of JSON.parse(fs.readFileSync('/tmp/pils-status-history-records-backup.json','utf8'))){const found=actual.find(r=>r.uic_ori===old.uic_ori&&r.redcap_repeat_instrument===old.redcap_repeat_instrument&&String(r.redcap_repeat_instance)===String(old.redcap_repeat_instance));if(!found||Object.entries(old).some(([k,v])=>String(found[k]??'')!==String(v??'')))throw Error('Existing record preservation verification failed');}
 fs.writeFileSync('/tmp/pils-status-history-migration-verified.json',JSON.stringify({verified:true,created:pending.length}),{mode:0o600});console.log(`Migration verified: ${pending.length} new history instances; all existing rows unchanged.`);
}else if(phase==='hide'){
 if(!JSON.parse(fs.readFileSync('/tmp/pils-status-history-migration-verified.json','utf8')).verified)throw Error('Migration verification required');
 for(const name of ['ptp_status','htp_care_status']){const f=metadata.find(f=>f.field_name===name);if(!f.field_annotation.includes('@HIDDEN'))f.field_annotation=(f.field_annotation+' @HIDDEN').trim();}
 await api({content:'metadata',format:'json',data:JSON.stringify(metadata),returnFormat:'json'});
 const actual=await api({content:'metadata',format:'json',returnFormat:'json'});if(JSON.stringify(actual)!==JSON.stringify(metadata))throw Error('Hidden field verification failed');
 console.log('Old profile status fields hidden; original fields and data retained.');
}else throw Error('Use schema, migrate or hide');
