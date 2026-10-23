//
//  InstrumentForm.tsx
//  pils-app
//
//  Created by Elisa Kevin Veragoo + ChatGPT on 23/10/2026.
//
'use client';
import definitions from '@/lib/instrument-forms.json';
import { fieldVisible, type InstrumentName } from '@/lib/instrument-forms';
import { numericAttributes } from '@/lib/redcap-validation';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
export function InstrumentForm({ form, values, set, readOnlyFields=[], excludeFields=[] }: { form: InstrumentName; values: Record<string,string>; set: (name:string,value:string)=>void; readOnlyFields?: string[]; excludeFields?: readonly string[] }) {
  let heading='Details';
  const sections=new Map<string,typeof definitions[typeof form]>();
  for(const field of definitions[form]) {
    if(field.section) heading=field.section;
    if(form==='clinic_visit' && field.kind==='descriptive' && /^cnv_section_/.test(field.name)) heading=field.label.replace(/<[^>]*>/g,'');
    if(excludeFields.includes(field.name)||['descriptive','calc','file'].includes(field.kind)||(/@HIDDEN|@CALC/.test(field.annotation)&&field.name!=='ptp_status')) continue;
    if(!sections.has(heading)) sections.set(heading,[]);
    sections.get(heading)!.push(field);
  }
  const purposes=(values[form==='prep_visit'?'pv_visit_purpose':'cnv_visit_purpose']??'').split(',');
  const relevant=(title:string)=> {
    const text=title.toUpperCase();
    if(form==='prep_treatment_profile')return true;
    if(form==='prep_visit')return purposes.some(code=>code==='1'?text.includes('BLOOD'):code==='2'?['TEST RESULTS','DOCTOR','REFERRALS','VACCINATION STATUS'].includes(text):code==='3'?text.includes('MEDICATION'):false);
    return purposes.some(code=>code==='11'?/BLOOD|LABORATORY REFERRAL/.test(text):['4','12'].includes(code)?/DOCTOR/.test(text):['9','10'].includes(code)?/MEDICATION/.test(text):code==='8'?/STI|SYPHILIS/.test(text):code==='3'?/LAB RESULT/.test(text):code==='15'?/ADDICTOLOGY/.test(text):code==='16'?/COMMODITIES/.test(text):code==='99'?/OTHER SERVICES/.test(text):false);
  };
  return <div className="grid gap-4">{[...sections].filter(([,fields])=>fields.some(f=>fieldVisible(f.branch,values))).map(([title,fields])=><details key={title} className="rounded-2xl border p-4" open={fields.some(field=>Boolean(values[field.name]))||relevant(title)}><summary className="cursor-pointer font-bold">{title}</summary><div className="mt-4 grid gap-4 sm:grid-cols-2">{fields.filter(f=>fieldVisible(f.branch,values)).map(field=>{
    const value=values[field.name]??'', label=field.label.replace(/<[^>]*>/g,'');
    return <div key={field.name} className="grid content-start gap-2"><label htmlFor={field.name} className="text-sm font-medium">{label}{field.required?' *':''}</label>{readOnlyFields.includes(field.name)?<span>{field.options.find(([code])=>code===value)?.[1]||value||'—'}</span>:field.kind==='checkbox'?<div className="grid gap-2">{field.options.map(([code,text])=><label key={code} className="flex items-center gap-3 rounded-xl border px-3 py-2"><Checkbox checked={value.split(',').includes(code)} onCheckedChange={checked=>{const selected=new Set(value.split(',').filter(Boolean));if(checked)selected.add(code);else selected.delete(code);set(field.name,[...selected].join(','));}}/>{text}</label>)}</div>:field.options.length?<select id={field.name} className="h-10 rounded-lg border px-3" value={value} onChange={e=>set(field.name,e.target.value)}><option value="">Choose…</option>{field.options.map(([code,text])=><option key={code} value={code}>{text}</option>)}</select>:field.kind==='notes'?<textarea id={field.name} className="min-h-24 rounded-lg border p-3" value={value} onChange={e=>set(field.name,e.target.value)}/>:<Input id={field.name} type={field.type.startsWith('date_')?'date':['integer','number'].includes(field.type)?'number':'text'} {...numericAttributes(field.name)} value={value} onChange={e=>set(field.name,e.target.value)}/>} {field.note&&<p className="text-sm text-muted-foreground">{field.note}</p>}</div>;
  })}</div></details>)}</div>;
}
