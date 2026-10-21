import { validDate } from "@/lib/redcap-validation";
export function clinicNextAppointment(values: Record<string, string>) {
  if (values.cnv_no_show === "1") return "";
  const dates = [values.cnv_next_med_date, values.cnv_next_blood_date, values.cnv_next_doctor_date, values.cnv_next_addicto_date].filter(value => value && validDate(value));
  return dates.sort()[0] ?? (validDate(values.cnv_legacy_next_date ?? "") ? values.cnv_legacy_next_date : "");
}
