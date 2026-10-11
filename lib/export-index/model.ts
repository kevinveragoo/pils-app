import { latestStatus } from "../status-history";
import definitions from "./fields.json";
export type RecordRow = Record<string, string>;
export type IndexValue = string | number | Date;
export type IndexRow = IndexValue[];
const fields = definitions as Record<string, { form: string; type: string; choices: Record<string, string> }>;
export const exportForms = [...new Set(Object.values(fields).map(field => field.form))];
export function label(row: RecordRow, field: string): string {
  const definition = fields[field];
  if (definition?.type === "checkbox") return Object.entries(definition.choices).filter(([code]) => row[`${field}___${code}`] === "1" || row[field]?.split(",").includes(code)).map(([, value]) => value).join("; ");
  const value = row[field] ?? "";
  return definition?.choices[value] ?? (definition?.type === "yesno" ? ({ "1": "YES", "0": "NO" }[value] ?? value) : value);
}
function date(value: string): Date | "" {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? parsed : "";
}
function number(value: string): number | "" { return value.trim() && Number.isFinite(Number(value)) ? Number(value) : ""; }
function age(birth: Date | "", today: string): number | "" {
  if (!birth) return "";
  const born = birth.toISOString().slice(0, 10);
  const years = Number(today.slice(0, 4)) - birth.getUTCFullYear() - (today.slice(5) < born.slice(5) ? 1 : 0);
  return years >= 0 ? years : "";
}
const kpCodes: Record<string, string> = { "1": "SW", "2": "MSM", "3": "PWID", "4": "PPWID", "5": "TG", "6": "Former PWID", "7": "GP", "8": "FIP" };
function population(row: RecordRow) { return Object.entries(kpCodes).filter(([code]) => row[`ce_kp_type___${code}`] === "1" || row.ce_kp_type?.split(",").includes(code)).map(([, value]) => value).join("; "); }
function snapshots(rows: RecordRow[], form: string, dateField: string) {
  return rows.filter(row => (!row.redcap_repeat_instrument || row.redcap_repeat_instrument === form) && Object.entries(row).some(([key, value]) => value !== "" && fields[key.split("___")[0]]?.form === form))
    .sort((a, b) => (b[dateField] || "").localeCompare(a[dateField] || "") || Number(b.redcap_repeat_instance || 0) - Number(a.redcap_repeat_instance || 0));
}
function latestValue(rows: RecordRow[], field: string) { return rows.find(row => row[field] !== undefined && row[field] !== "")?.[field] ?? ""; }
const prepStatuses: Record<string, string> = { "1": "Active", "2": "LTFU", "3": "Not interested", "4": "On demand", "5": "Abroad", "6": "Transfer to NDDCI", "7": "HIV+", "8": "Prison", "9": "Transferred to another facility", "10": "Active", "11": "Treatment interrupted", "12": "Deported" };
const arvStatuses: Record<string, string> = { "1": "Active", "2": "Transfer to NDDCI", "3": "Prison", "4": "Transferred to another facility", "5": "Active", "6": "Treatment interrupted", "7": "LTFU", "8": "Abroad", "9": "Deported", "10": "Not interested", "11": "On demand", "12": "HIV+" };
export function buildIndexRows(records: RecordRow[], today: string): [IndexRow[], IndexRow[]] {
  const clients = new Map<string, RecordRow[]>();
  for (const row of records) { if (!row.uic_ori) continue; const rows = clients.get(row.uic_ori) ?? []; rows.push(row); clients.set(row.uic_ori, rows); }
  const prep: IndexRow[] = [], arv: IndexRow[] = [];
  for (const [uic, rows] of [...clients.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const ce = rows.find(row => !row.redcap_repeat_instrument) ?? {};
    const name = [ce.ce_first_name, ce.ce_middle_name_1, ce.ce_middle_name_2, ce.ce_middle_name_3].filter(Boolean).join(" ");
    const gender = ({ "1": "M", "2": "F", "3": "T", "4": "T", "5": "Other", "9": "Refused" } as Record<string, string>)[ce.ce_gender_identity] ?? "";
    const birth = date(ce.ce_dob ?? ""), dead = ce.ce_vital_status === "2";
    const pp = snapshots(rows, "prep_treatment_profile", "ptp_effective_date"), pv = snapshots(rows.filter(row=>row.pv_status_only!=="1"), "prep_visit", "pv_visit_date");
    if (pp.length) {
      const status=latestStatus(rows,"prep").status;
      const p = pp[0], medication = p.ptp_medication ? label(p, "ptp_medication") : label(pv.find(r => r.pv_medication) ?? {}, "pv_medication");
      const rx = medication === "Other" ? p.ptp_other_medication || latestValue(pv, "pv_other_medication") || "Other" : medication;
      prep.push([ce.ce_patient_code ?? "", ce.ce_last_name ?? "", name, ce.ce_tel_primary ?? "", uic, population(ce), gender, date(p.ptp_start_date ?? ""), birth, status ? (status==="2"?"YES":"NO") : label(p,"ptp_ltfu").toUpperCase(), date(pv[0]?.pv_visit_date ?? ""), rx, number(latestValue(pv, "pv_prescription_months")), date(latestValue(pv, "pv_blood_test_date")), date(latestValue(pv, "pv_doctor_review_date")), label(pv.find(r => r.pv_syphilis_referral) ?? {}, "pv_syphilis_referral"), label(pv.find(r => r.pv_hcv_referral) ?? {}, "pv_hcv_referral"), label(pv.find(r => r.pv_hbv_vaccination_status) ?? {}, "pv_hbv_vaccination_status"), latestValue(pv, "pv_other_referral"), latestValue(pv, "pv_physician_comments") || p.ptp_regimen_notes || "", ce.ce_nationality ?? "", dead ? "Dead" : prepStatuses[status] ?? label({ptp_status:status},"ptp_status")]);
    }
    const hp = snapshots(rows, "hiv_treatment_profile", "htp_effective_date"), cv = snapshots(rows, "clinic_visit", "cnv_date"), monitoring = snapshots(rows, "hiv_clinical_monitoring", "htm_date");
    if (hp.length) {
      const status=latestStatus(rows,"hiv").status;
      const p = hp[0], baseline = monitoring.filter(r => r.htm_is_baseline === "1").reverse();
      const cd4 = monitoring.filter(r => r.htm_cd4_level !== undefined && r.htm_cd4_level !== "").sort((a,b) => (b.htm_cd4_date || b.htm_date || "").localeCompare(a.htm_cd4_date || a.htm_date || ""))[0] ?? {};
      const vl = monitoring.filter(r => r.htm_vl_level || r.htm_viral_load_detectable).sort((a,b) => (b.htm_vl_date || b.htm_date || "").localeCompare(a.htm_vl_date || a.htm_date || ""))[0] ?? {};
      const viral = (r: RecordRow) => number(r.htm_vl_level ?? "") !== "" ? number(r.htm_vl_level) : label(r, "htm_viral_load_detectable");
      const started = date(p.htp_art_start_date ?? ""), regimen = label(p, "htp_art_regimen").split("; ").map(value => value === "Other" ? p.htp_art_regimen_other || "Other" : value).join("; ");
      const baseCd4 = baseline.find(r => r.htm_cd4_level !== undefined && r.htm_cd4_level !== "") ?? {}, baseVl = baseline.find(r => r.htm_vl_level || r.htm_viral_load_detectable) ?? {};
      const initials = [ce.ce_first_name, ce.ce_middle_name_1, ce.ce_middle_name_2, ce.ce_middle_name_3].map(value => value?.trim().slice(0,1) ?? "");
      arv.push(["", ce.ce_patient_code ?? "", ce.ce_last_name ?? "", name, ce.ce_nid ?? "", population(ce), gender, birth, ...initials, ce.ce_last_name?.trim().slice(0,1) ?? "", ce.ce_last_name?.trim().slice(-1) ?? "", uic, age(birth,today), "", ({ "0": "No", "1": "Bed Ridden", "2": "Reduce mobility", "3": "Reduce mobility" } as Record<string,string>)[ce.ce_mobility] ?? "", label(p,"htp_started_abroad"), "", started, started ? started.toLocaleString("en",{month:"long",timeZone:"UTC"}).toUpperCase() : "", number(baseCd4.htm_cd4_level ?? ""), viral(baseVl), regimen, ce.ce_contact_address ?? "", ce.ce_tel_primary ?? "", date(cd4.htm_cd4_date ?? ""), number(cd4.htm_cd4_level ?? ""), date(vl.htm_vl_date ?? ""), viral(vl), date(cv[0]?.cnv_date ?? ""), date(latestValue(cv,"cnv_next_blood_test")), date(latestValue(cv,"cnv_next_doctor_review")), label(cv.find(r => r.cnv_syphilis_referral) ?? {},"cnv_syphilis_referral"), label(cv.find(r => r.cnv_hcv_lab_result) ?? cv.find(r => r.cnv_hcv_reported) ?? {}, cv.some(r => r.cnv_hcv_lab_result) ? "cnv_hcv_lab_result" : "cnv_hcv_reported"), label(cv.find(r => r.cnv_hcv_treat) ?? {},"cnv_hcv_treat"), latestValue(cv,"cnv_hcv_vl_result"), "", label(cv.find(r => r.cnv_hbv_vaccination_status) ?? {},"cnv_hbv_vaccination_status"), "", ce.ce_nationality ?? "", dead ? "Dead" : arvStatuses[status] ?? label({htp_care_status:status},"htp_care_status")]);
    }
  }
  return [prep, arv];
}
