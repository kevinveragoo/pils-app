import type { LookupField, LookupInstrument, LookupRow } from "@/lib/record-lookup";
const protectedInstruments = new Set(["clinic_enrollment", "clinic_visit", "hiv_treatment_profile", "hiv_clinical_monitoring", "hiv_care_support", "prep_treatment_profile", "prep_visit"]);
const protectedPrefix = /^(cne|cnv|htp|htm|hcs|ptp|pv)_/i;
export function filterRestrictedLookupData(rows: LookupRow[], metadata: LookupField[], instruments: LookupInstrument[], repeating: { form_name: string }[]) {
  const protectedFields = new Set(metadata.filter(field => protectedInstruments.has(field.form_name)).map(field => field.field_name));
  const restrictedField = (name: string) => protectedFields.has(name.split("___")[0]) || protectedPrefix.test(name) || [...protectedInstruments].some(form => name.startsWith(`${form}_`));
  return {
    rows: rows.filter(row => !protectedInstruments.has(String(row.redcap_repeat_instrument ?? ""))).map(row => Object.fromEntries(Object.entries(row).filter(([name]) => !restrictedField(name)))),
    metadata: metadata.filter(field => !protectedInstruments.has(field.form_name) && !restrictedField(field.field_name)),
    instruments: instruments.filter(form => !protectedInstruments.has(form.instrument_name)),
    repeating: repeating.filter(form => !protectedInstruments.has(form.form_name)),
  };
}
