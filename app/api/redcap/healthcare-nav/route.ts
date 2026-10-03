import { validateFields } from "@/lib/redcap-validation";
import { NextResponse } from "next/server";
import { isAuthenticatedRequest } from "@/lib/auth";

const REDCAP_API_URL = process.env.REDCAP_API_URL;
const REDCAP_API_TOKEN = process.env.REDCAP_API_TOKEN;

type Values = Record<string, string>;
type Submission = { mode?: unknown; recordId?: unknown; enrollment?: unknown; care?: unknown; monitoring?: unknown; includeMonitoring?: unknown; newCd4?: unknown; newVl?: unknown };

const enrollmentFields = ["ce_active", "ce_date", "ce_implementing_partner", "ce_district", "ce_hotspot", "ce_outreach_worker", "ce_last_name", "ce_first_name", "ce_middle_name_1", "ce_middle_name_2", "ce_alias", "ce_dob", "ce_gender_identity", "ce_vision", "ce_kp_type", "ce_tel_primary", "ce_contact_method", "ce_risk_drug_alcohol_sex", "ce_risk_violence_1m", "ce_sw_age_started", "ce_sw_sex_acts_1w", "ce_sw_condom_use_1w", "ce_msm_age_first_anal", "ce_msm_receptive_anal_1w", "ce_msm_condom_anal_1w", "ce_pwid_age_first_inject", "ce_pwid_injections_24h", "ce_pwid_injections_1w", "ce_pwid_shared_24h", "ce_pwid_shared_1w"];
const careFields = ["hcs_navigator_1", "hcs_navigator_2", "hcs_navigator_3", "hcs_date", "hcs_currently_art", "hcs_art_status", "hcs_care_type", "hcs_care_region", "hcs_adherence_counsel", "hcs_psychosocial", "hcs_comprehensive_ref", "hcs_num_male_condoms", "hcs_num_female_condoms", "hcs_num_lube", "hcs_num_needles", "hcs_followup_needed", "hcs_followup_date", "hcs_notes"];
const monitoringFields = ["htm_viral_load_detectable", "htm_date", "htm_art_status", "htm_cd4_date", "htm_cd4_level", "htm_vl_date", "htm_vl_level", "htm_notes"];

function values(value: unknown): Values | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  return entries.every(([, item]) => typeof item === "string") ? Object.fromEntries(entries) as Values : null;
}

function cleanLetters(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/gi, "").toUpperCase();
}

function buildUic(v: Values) {
  const prefix = ({ "1": "M", "2": "F", "3": "T", "4": "T", "5": "O", "9": "R" } as Record<string, string>)[v.ce_gender_identity] ?? "";
  const dob = v.ce_dob?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const first = cleanLetters(v.ce_first_name ?? "").slice(0, 1);
  const middle = [v.ce_middle_name_1, v.ce_middle_name_2].filter(Boolean).join(" ").trim().split(/\s+/).filter(Boolean).map((name) => cleanLetters(name).slice(0, 1)).join("");
  const surname = cleanLetters(v.ce_last_name ?? "");
  return prefix && dob && first && surname ? `${prefix}${dob[3]}${dob[2]}${dob[1]}${first}${middle}_${surname[0]}${surname.at(-1)}` : "";
}

function copyAllowed(source: Values, allowed: string[]) {
  const row: Values = {};
  for (const key of allowed) if (source[key] !== undefined && source[key] !== "") row[key] = source[key].trim();
  for (const key of ["ce_kp_type", "ce_contact_method", "hcs_care_type"]) {
    if (!source[key]) continue;
    for (const code of source[key].split(",").filter((item) => /^\d+$/.test(item))) row[`${key}___${code}`] = "1";
    delete row[key];
  }
  return row;
}

async function redcap(params: Record<string, string>) {
  if (!REDCAP_API_URL || !REDCAP_API_TOKEN) throw new Error("REDCap API configuration is missing.");
  const response = await fetch(REDCAP_API_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: REDCAP_API_TOKEN, ...params }), cache: "no-store" });
  const text = await response.text();
  let result: unknown = text;
  try { result = JSON.parse(text); } catch { /* REDCap may return plain text. */ }
  if (!response.ok || (result && typeof result === "object" && "error" in result)) {
    const message = result && typeof result === "object" && "error" in result ? String((result as { error: unknown }).error) : text || `REDCap returned HTTP ${response.status}.`;
    throw new Error(message);
  }
  return result;
}

export async function GET(request: Request) {
  if (!await isAuthenticatedRequest()) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const uic = new URL(request.url).searchParams.get("uic")?.trim().toUpperCase() ?? "";
  if (!uic) return NextResponse.json({ error: "A UIC is required." }, { status: 400 });
  try {
    const exported = await redcap({ content: "record", action: "export", format: "json", type: "flat", rawOrLabel: "raw", rawOrLabelHeaders: "raw", returnFormat: "json", "records[0]": uic, "fields[0]": "uic_ori" });
    const rows = Array.isArray(exported) ? exported as Values[] : [];
    return NextResponse.json({ exists: rows.some((row) => row.uic_ori === uic) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to check the UIC in REDCap." }, { status: 502 });
  }
}

export async function POST(request: Request) {
  if (!await isAuthenticatedRequest()) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  let input: Submission;
  try { input = await request.json() as Submission; } catch { return NextResponse.json({ error: "The request body must be valid JSON." }, { status: 400 }); }

  const mode = input.mode;
  const enrollment = values(input.enrollment);
  const care = values(input.care);
  const monitoring = values(input.monitoring);
  const includeMonitoring = input.includeMonitoring === true;
  const newCd4 = input.newCd4 === true;
  const newVl = input.newVl === true;
  const recordId = typeof input.recordId === "string" ? input.recordId.trim().toUpperCase() : "";

  if ((mode !== "new" && mode !== "existing") || !care || !monitoring || !recordId) return NextResponse.json({ error: "Invalid healthcare navigation submission." }, { status: 400 });
  const requiredCare = ["hcs_navigator_1", "hcs_date", "hcs_currently_art", "hcs_art_status"];
  if (!requiredCare.every((key) => care[key]?.trim())) return NextResponse.json({ error: "Complete all required HIV Care Support fields." }, { status: 400 });
  if (includeMonitoring !== (newCd4 || newVl)) return NextResponse.json({ error: "Select the clinical monitoring data being submitted." }, { status: 400 });
  if (includeMonitoring) {
    if (!monitoring.htm_date) return NextResponse.json({ error: "A monitoring date is required." }, { status: 400 });
  }
  if (mode === "new") {
    const requiredEnrollment = ["ce_date", "ce_district", "ce_hotspot", "ce_outreach_worker", "ce_last_name", "ce_first_name", "ce_dob", "ce_gender_identity", "ce_kp_type"];
    if (!enrollment || !requiredEnrollment.every((key) => enrollment[key]?.trim())) return NextResponse.json({ error: "Complete all required enrollment fields." }, { status: 400 });
    if (buildUic(enrollment) !== recordId) return NextResponse.json({ error: "The generated UIC does not match the enrollment details." }, { status: 400 });
  }

  const validationError = (mode === "new" && enrollment ? validateFields(enrollment, enrollmentFields) : null) || validateFields(care, careFields) || (includeMonitoring ? validateFields(monitoring, monitoringFields) : null);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  try {
    const exported = await redcap({ content: "record", action: "export", format: "json", type: "flat", rawOrLabel: "raw", rawOrLabelHeaders: "raw", exportDataAccessGroups: "false", returnFormat: "json", "records[0]": recordId, "forms[0]": "client_enrollment", "forms[1]": "hiv_care_support", "forms[2]": "hiv_clinical_monitoring" });
    const existing = Array.isArray(exported) ? exported as Values[] : [];
    const recordExists = existing.some((row) => row.uic_ori === recordId);
    if (mode === "new" && recordExists) return NextResponse.json({ error: `UIC ${recordId} already exists. Use Existing client.` }, { status: 409 });
    if (mode === "existing" && !recordExists) return NextResponse.json({ error: "The selected client no longer exists in REDCap." }, { status: 409 });

    const maximum = new Map<string, number>();
    for (const row of existing) {
      const form = row.redcap_repeat_instrument;
      const instance = Number(row.redcap_repeat_instance);
      if (form && Number.isInteger(instance)) maximum.set(form, Math.max(maximum.get(form) ?? 0, instance));
    }
    const next = (form: string) => String((maximum.get(form) ?? 0) + 1);
    const records: Values[] = [];
    if (mode === "new" && enrollment) records.push({ uic_ori: recordId, ...copyAllowed(enrollment, enrollmentFields) });
    records.push({ uic_ori: recordId, redcap_repeat_instrument: "hiv_care_support", redcap_repeat_instance: next("hiv_care_support"), ...copyAllowed(care, careFields) });
    if (includeMonitoring) records.push({ uic_ori: recordId, redcap_repeat_instrument: "hiv_clinical_monitoring", redcap_repeat_instance: next("hiv_clinical_monitoring"), ...copyAllowed(monitoring, monitoringFields) });

    const result = await redcap({ content: "record", action: "import", format: "json", type: "flat", overwriteBehavior: "normal", forceAutoNumber: "false", dateFormat: "YMD", data: JSON.stringify(records), returnContent: "count", returnFormat: "json" });
    return NextResponse.json({ success: true, recordId, savedRows: records.length, result });
  } catch (error) {
    console.error("REDCap healthcare navigation import error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save healthcare navigation data to REDCap." }, { status: 502 });
  }
}
