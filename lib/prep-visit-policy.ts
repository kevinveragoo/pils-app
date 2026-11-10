import { instrumentFields, visibleInstrumentValues } from "./instrument-forms";
import { validateFields } from "./redcap-validation";

// Old forms used opposite HIV/HBV/HCV codes. Reject stale browser submissions.
export const PREP_VISIT_SCHEMA_VERSION = "cnv-2026-10-23";
export function validatePrepVisit(values: Record<string, string>) {
  if (Object.keys(values).some(key => key.startsWith("pv_") && !instrumentFields("prep_visit").includes(key) && values[key]?.trim())) return "The PrEP form is out of date. Reload it before saving.";
  const visible = visibleInstrumentValues("prep_visit", values);
  if (visible.pv_hiv_lab_test_done === "1" && !visible.pv_hiv_lab_test_date?.trim()) return "HIV laboratory test date is required when an HIV laboratory test was performed.";
  return validateFields(visible, instrumentFields("prep_visit"));
}
