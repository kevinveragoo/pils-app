//
//  clinic-followup.ts
//  pils-app
//
//  Created by Elisa Kevin Veragoo + ChatGPT on 23/10/2026.
//
import { validDate } from "@/lib/redcap-validation";
import { clinicAppointmentDateFields } from "./clinic-appointment-fields";
export function clinicNextAppointment(values: Record<string, string>) {
  if (values.cnv_no_show === "1") return "";
  const dates = clinicAppointmentDateFields.map(field => values[field]).filter(value => value && validDate(value));
  return dates.sort()[0] ?? (validDate(values.cnv_legacy_next_date ?? "") ? values.cnv_legacy_next_date : "");
}
