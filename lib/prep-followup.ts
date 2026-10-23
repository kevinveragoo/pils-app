//
//  prep-followup.ts
//  pils-app
//
//  Created by Elisa Kevin Veragoo + ChatGPT on 23/10/2026.
//
import { validDate } from "@/lib/redcap-validation";
// Mirror REDCap's calculated next appointment without substituting today's visit date.
export function prepNextAppointment(values: Record<string, string>) {
  return [values.pv_next_med_date, values.pv_next_blood_date, values.pv_next_doctor_date].filter(value => value && validDate(value)).sort()[0] ?? "";
}
