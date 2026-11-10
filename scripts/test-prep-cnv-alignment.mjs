import assert from 'node:assert/strict';
import fs from 'node:fs';
import { planPrepCnvAlignment } from '../lib/prep-cnv-alignment.mjs';
const forms = JSON.parse(fs.readFileSync('lib/instrument-forms.json','utf8'));
const legacy = Object.entries(forms).flatMap(([form,fields])=>fields.filter(f=>!/^pv_(?:hiv|hbv|hcv|syp)_lab_test_(?:date|done)$/.test(f.name)&&f.name!=='pv_next_lab_review_date').map(f=>({field_name:f.name,form_name:form,field_type:f.kind,field_label:f.label,section_header:f.section,branching_logic:f.branch,select_choices_or_calculations:f.options.map(([code,label])=>`${code}, ${label}`).join(' | '),required_field:f.required?'y':'',field_annotation:f.annotation,field_note:f.note,text_validation_type_or_show_slider_number:f.kind==='text'&&f.type!=='text'?f.type:'',text_validation_min:'',text_validation_max:''})));
const find=name=>legacy.find(f=>f.field_name===name);
find('pv_visit_purpose').select_choices_or_calculations='1, Blood sample collection | 2, Doctor | 3, Medication collection';
for(const infection of ['hiv','hbv','hcv'])find(`pv_${infection}_result`).select_choices_or_calculations='1, Negative / normal | 2, Positive / abnormal | 3, Indeterminate | 4, Result unavailable | 5, Not requested';
find('pv_hbv_vaccination_status').select_choices_or_calculations='0, Not started | 1, Box 1 | 2, Box 2 | 3, Box 3 | 4, Box4 | 5, Completed';
find('pv_hcv_vaccination_status').select_choices_or_calculations='0, Not started | 1, Dose 1 | 2, Dose 2 | 3, Dose 3 | 4, Completed';
const row={uic_ori:'TEST',redcap_repeat_instrument:'prep_visit',redcap_repeat_instance:'1',pv_visit_purpose___2:'1',pv_hiv_result:'1',pv_hbv_result:'2',pv_hcv_result:'3',pv_syphilis_result:'2',pv_hbv_vaccination_status:'5',pv_hcv_vaccination_status:'4',pv_blood_collected_date:'2026-10-01',pv_doctor_comments:'Preserve'};
const original=structuredClone(row), metaOriginal=structuredClone(legacy);
const plan=planPrepCnvAlignment(legacy,[row]);assert.deepEqual(row,original);assert.deepEqual(legacy,metaOriginal);
const updates=plan.changes[0].values;
assert.equal(updates.pv_hiv_result,'2');assert.equal(updates.pv_hbv_result,'1');assert.equal(updates.pv_hcv_result,undefined);assert.equal(updates.pv_syphilis_result,undefined);
assert.equal(updates.pv_hbv_vaccination_status,'4');assert.equal(updates.pv_hcv_vaccination_status,'5');assert.equal(updates.pv_visit_purpose___4,'1');assert.equal(updates.pv_visit_purpose___2,undefined);
for(const infection of ['hiv','hbv','hcv','syp']){assert.equal(updates[`pv_${infection}_lab_test_done`],'1');assert.equal(updates[`pv_${infection}_lab_test_date`],undefined,'Never invent individual test dates');}
assert.equal(updates.pv_doctor_comments,undefined);
for(const infection of ['hiv','hbv','hcv','syp']){
 const result=plan.metadata.find(f=>f.field_name===`pv_${infection==='syp'?'syphilis':infection}_result`);
 assert.equal(result.select_choices_or_calculations,legacy.find(f=>f.field_name===`cnv_${infection}_lab_result`).select_choices_or_calculations);
 assert.match(result.branching_logic,new RegExp(`pv_${infection}_lab_test_done`));
}
for(const code of ['4','5','invalid'])assert.throws(()=>planPrepCnvAlignment(legacy,[{...row,pv_hiv_result:code}]),/needs review/);
for(const [field,codes]of [['pv_hbv_vaccination_status',['1','2','3','4']],['pv_hcv_vaccination_status',['1','2','3']]])for(const code of codes)assert.throws(()=>planPrepCnvAlignment(legacy,[{...row,[field]:code}]),/needs review/);
assert.throws(()=>planPrepCnvAlignment(plan.metadata,[row]),/already exist/);
console.log('PrEP alignment plan checks passed: exact code semantics, clinical ambiguity refusal, additive purpose, unchanged source data, and no fabricated dates.');
