//
//  instrument-forms.ts
//  pils-app
//
//  Created by Elisa Kevin Veragoo + ChatGPT on 19/10/2026.
//
import definitions from './instrument-forms.json';
import { isClinicAppointmentDate } from './clinic-appointment-fields';
export type InstrumentName = keyof typeof definitions;
export const instrumentFields = (form: InstrumentName) => definitions[form].filter(f => !['descriptive', 'calc','file'].includes(f.kind) && (!/@HIDDEN|@CALC/.test(f.annotation) || ['pv_next_appointment_date','cnv_next_appointment_date','ptp_status'].includes(f.name))).map(f => f.name);
export const retiredClinicEnrollmentFields = definitions.clinic_enrollment.filter(f=>/@HIDDEN/.test(f.annotation)).map(f=>f.name);
export const instrumentCheckboxes = (form: InstrumentName) => definitions[form].filter(f => f.kind === 'checkbox').map(f => f.name);
export function instrumentInitial(form: InstrumentName, defaults: Record<string,string> = {}): Record<string,string> {
  return Object.fromEntries(instrumentFields(form).map(name => [name,defaults[name] ?? '']));
}
export function fieldVisible(branch: string, values: Record<string,string>): boolean {
  if (!branch) return true;
  const tokens=branch.match(/\[[\w]+(?:\(\d+\))?\]|<>|>=|<=|=|>|<|'[^']*'|"[^"]*"|\band\b|\bor\b|\(|\)|-?\d+(?:\.\d+)?/gi)??[];
  let index=0;
  function comparison(): boolean {
    if(tokens[index]==='('){index++;const result=or();if(tokens[index++]!==')')throw Error('Invalid branching');return result;}
    const reference=tokens[index++]?.match(/^\[([\w]+)(?:\((\d+)\))?\]$/);
    if(!reference)throw Error('Invalid field reference');
    const operator=tokens[index++], raw=tokens[index++];if(raw===undefined)throw Error('Missing comparison');
    const expected=raw.replace(/^['"]|['"]$/g,''), [,name,code]=reference;
    const value=code ? values[`${name}___${code}`] ?? (values[name]?.split(',').includes(code)?'1':'0') : values[name]??'';
    if(operator==='=')return value===expected;
    if(operator==='<>')return value!==expected;
    const a=Number(value),b=Number(expected);if(!value||!Number.isFinite(a)||!Number.isFinite(b))return false;
    return operator==='>'?a>b:operator==='<'?a<b:operator==='>='?a>=b:operator==='<='?a<=b:false;
  }
  function and(): boolean {let result=comparison();while(tokens[index]?.toLowerCase()==='and'){index++;const next=comparison();result=result&&next;}return result;}
  function or(): boolean {let result=and();while(tokens[index]?.toLowerCase()==='or'){index++;const next=and();result=result||next;}return result;}
  try{const result=or();return index===tokens.length&&result;}catch{return false;}
}
export function visibleInstrumentValues(form: InstrumentName, values: Record<string,string>) {
  return Object.fromEntries(definitions[form].filter(f=>instrumentFields(form).includes(f.name)&&(form === 'clinic_visit' && isClinicAppointmentDate(f.name) ? values.cnv_no_show !== '1' : fieldVisible(f.branch,values))).map(f=>[f.name, values[f.name] ?? '']));
}
