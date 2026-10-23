//
//  clinic-appointment-fields.ts
//  pils-app
//
//  Created by Elisa Kevin Veragoo + ChatGPT on 23/10/2026.
//
// App-side visibility override; REDCap metadata keeps its original branching.
export const clinicAppointmentDateFields = [
  "cnv_next_med_date",
  "cnv_next_doctor_date",
  "cnv_next_addicto_date",
  "cnv_next_blood_date",
  "cnv_next_lab_review_date",
  "cnv_next_other_date",
] as const;
export const isClinicAppointmentDate = (name: string) => clinicAppointmentDateFields.some(field => field === name);
