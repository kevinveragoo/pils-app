import definitions from "./instrument-forms.json";

export const appointmentTypes = [
  { value: "DOCTOR", label: "Doctor", field: "cnv_next_doctor_date" },
  { value: "BLOOD_TEST", label: "Blood test", field: "cnv_next_blood_date" },
  { value: "MEDICATION", label: "Medication", field: "cnv_next_med_date" },
  { value: "ADDICTOLOGY", label: "Addictology", field: "cnv_next_addicto_date" },
] as const;
export const appointmentRoles = ["HEALTHCARE_ASSISTANT", "ADMIN"] as const;

export type AppointmentCounts = Record<typeof appointmentTypes[number]["value"], number>;
export function countAppointments(rows: Record<string, string>[], date: string): AppointmentCounts {
  const clients = Object.fromEntries(appointmentTypes.map(type => [type.value, new Set<string>()])) as Record<keyof AppointmentCounts, Set<string>>;
  const prepFields = { DOCTOR: "pv_next_doctor_date", BLOOD_TEST: "pv_next_blood_date", MEDICATION: "pv_next_med_date", ADDICTOLOGY: "" };
  for (const row of rows) {
    if (!row.uic_ori) continue;
    for (const type of appointmentTypes) {
      const clinic = (!row.redcap_repeat_instrument || row.redcap_repeat_instrument === "clinic_visit") && row.cnv_no_show !== "1" && row[type.field] === date;
      const prepField = prepFields[type.value];
      const prep = prepField && (!row.redcap_repeat_instrument || row.redcap_repeat_instrument === "prep_visit") && row[prepField] === date;
      if (clinic || prep) clients[type.value].add(row.uic_ori);
    }
  }
  return Object.fromEntries(appointmentTypes.map(type => [type.value, clients[type.value].size])) as AppointmentCounts;
}

// A date plus follow-up dates alone records scheduling, not an attended visit.
export function isAppointmentOnly(row: Record<string, string>) {
  const dates = new Set<string>(["cnv_date", "cnv_next_appointment_date", "cnv_legacy_next_date", ...appointmentTypes.map(type => type.field)]);
  if (!appointmentTypes.some(type => Boolean(row[type.field]))) return false;
  return !definitions.clinic_visit.some(field => {
    if (dates.has(field.name) || ["descriptive", "calc", "file"].includes(field.kind) || /@CALC/.test(field.annotation)) return false;
    if (field.name === "cnv_no_show" && row[field.name] !== "1") return false;
    return field.kind === "checkbox" ? Boolean(row[field.name]) || Object.entries(row).some(([key, value]) => key.startsWith(`${field.name}___`) && value === "1") : Boolean(row[field.name]?.trim());
  });
}
