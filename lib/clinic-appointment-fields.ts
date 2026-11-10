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

export const prepAppointmentDateFields = ["pv_next_med_date", "pv_next_blood_date", "pv_next_doctor_date", "pv_next_lab_review_date"] as const;
export const isPrepAppointmentDate = (name: string) => prepAppointmentDateFields.some(field => field === name);
