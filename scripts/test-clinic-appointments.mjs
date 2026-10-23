import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const nativeRequire=createRequire(import.meta.url),cache=new Map();
function load(file){
 const filename=path.resolve(file);if(cache.has(filename))return cache.get(filename);
 const loaded={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(code,{module:loaded,exports:loaded.exports,require:name=>{
  if(name==='@/components/ui/input')return {Input:props=>React.createElement('input',props)};
  if(name==='@/components/ui/checkbox')return {Checkbox:props=>React.createElement('input',{type:'checkbox',defaultChecked:props.checked})};
  if(name.startsWith('@/')){const target=name.slice(2);if(target.endsWith('.json'))return JSON.parse(fs.readFileSync(target));return load(fs.existsSync(target+'.ts')?target+'.ts':target+'.tsx');}
  if(name.endsWith('.json'))return JSON.parse(fs.readFileSync(path.resolve(path.dirname(filename),name)));
  if(name.startsWith('.'))return load(path.resolve(path.dirname(filename),name+'.ts'));
  return nativeRequire(name);
 }});cache.set(filename,loaded.exports);return loaded.exports;
}
const Dates=load('components/ClinicAppointmentDates.tsx').default;
const {InstrumentForm}=load('components/InstrumentForm.tsx');
const {clinicAppointmentDateFields:fields}=load('lib/clinic-appointment-fields.ts');
const {clinicNextAppointment}=load('lib/clinic-followup.ts');
const values={cnv_next_med_date:'2026-12-01',cnv_next_doctor_date:'2026-11-20',cnv_next_addicto_date:'2026-11-15',cnv_next_blood_date:'2026-11-10',cnv_next_lab_review_date:'2026-11-05',cnv_next_other_date:'2026-11-01'};
for(const purpose of ['','2','3','4','8','9','11','12','15','16','99']){
 const v={...values,cnv_visit_purpose:purpose};
 const html=renderToStaticMarkup(React.createElement(Dates,{values:v,set:()=>{}}));
 assert.equal((html.match(/type="date"/g)||[]).length,6,'Every service date is editable irrespective of purpose');
 for(const field of fields)assert.ok(html.includes(`id="${field}"`));
 assert.match(html,/<output[^>]*><time[^>]*>01\/11\/2026<\/time><\/output>/,'Calculated date is plain output, never a date input');
 assert.ok(!html.includes('id="cnv_next_appointment_date"'));
 const rest=renderToStaticMarkup(React.createElement(InstrumentForm,{form:'clinic_visit',values:v,set:()=>{},excludeFields:[...fields,'cnv_next_reason','cnv_next_appointment_date']}));
 for(const field of fields)assert.ok(!rest.includes(`id="${field}"`),'Dates must not be duplicated inside purpose-specific sections');
}
assert.equal(renderToStaticMarkup(React.createElement(Dates,{values:{...values,cnv_no_show:'1'},set:()=>{}})),'');
for(let mask=0;mask<64;mask++){
 const selected=Object.fromEntries(Object.entries(values).filter((_,i)=>mask&(1<<i)));
 assert.equal(clinicNextAppointment({...selected,cnv_legacy_next_date:'2026-01-01'}),Object.values(selected).sort()[0]??'2026-01-01','Earliest service date takes precedence over the legacy fallback');
}
console.log('Clinic appointment UI checks passed: all visit purposes, six unique date inputs, non-interactive calculated output, no-show handling and earliest-date/fallback combinations.');
