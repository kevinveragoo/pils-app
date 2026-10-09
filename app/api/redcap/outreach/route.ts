import { validateFields } from "@/lib/redcap-validation";
import { generateUic } from "@/lib/uic";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { recordRedcapActivity } from "@/lib/redcap-activity";

const REDCAP_API_URL = process.env.REDCAP_API_URL;
const REDCAP_API_TOKEN = process.env.REDCAP_API_TOKEN;

type Values = Record<string, string>;
type Submission = { mode?: unknown; recordId?: unknown; enrollment?: unknown; outreach?: unknown; partners?: unknown; children?: unknown };

const enrollmentFields = ["ce_active", "ce_date","ce_implementing_partner","ce_district","ce_hotspot","ce_outreach_worker","ce_last_name","ce_first_name","ce_middle_name_1", "ce_middle_name_2", "ce_middle_name_3","ce_alias","ce_dob","ce_gender_identity","ce_vision","ce_kp_type","ce_tel_primary","ce_contact_method","ce_risk_drug_alcohol_sex","ce_risk_violence_1m","ce_sw_age_started","ce_sw_sex_acts_1w","ce_sw_condom_use_1w","ce_msm_age_first_anal","ce_msm_receptive_anal_1w","ce_msm_condom_anal_1w","ce_pwid_age_first_inject","ce_pwid_injections_24h","ce_pwid_shared_24h","ce_pwid_injections_1w","ce_pwid_shared_1w"];
const outreachFields = ["oc_worker_1","oc_worker_2","oc_worker_3","oc_date","oc_type","oc_hotspot","oc_district","oc_is_new_client","oc_sex_acts_1w","oc_condom_use","oc_drug_alcohol","oc_shared_inject_equip","oc_violence_report","oc_violence_address","oc_male_condoms","oc_female_condoms","oc_lubricant","oc_hiv_self_test","oc_syringes","oc_num_needles","oc_hiv_status_prev","oc_hiv_rapid_result","oc_hiv_comms","oc_hepc_status_prev","oc_hepc_result","oc_hepc_comms","oc_hepb_status_prev","oc_hepb_result","oc_hepb_comms","oc_syp_status_prev","oc_syp_result","oc_syp_comms","oc_prep_com","oc_prep_interested","oc_referrals","oc_referral_other","oc_followup_needed","oc_followup_date","oc_notes"];
const partnerFields = ["itp_name","itp_nickname","itp_dob","itp_age","itp_gender","itp_description","itp_lives_with","itp_address","itp_work_address","itp_work_hours","itp_phone","itp_phone_alt","itp_relationship","itp_violence","itp_threats","itp_forced_sex","itp_notif_method","itp_notif_date","itp_1st_cont_date","itp_1st_cont_method","itp_2nd_cont_date","itp_2nd_cont_method","itp_3rd_cont_date","itp_3rd_cont_method","itp_contact_success","itp_contact_by_who","itp_contact_result","itp_contact_result_other","itp_hiv_result","itp_contact_art","itp_enrolled","itp_new_uic","itp_notes"];
const childFields = ["itch_name","itch_dob","itch_age","itch_gender","itch_address","itch_lives_with","itch_violence","itch_threats","itch_force_sex","itch_notif_method","itch_notif_date_limit","itch_contact_method","itch_hiv_result","itch_art","itch_enrolled","itch_new_uic","itch_notes"];

function values(value: unknown): Values | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (!entries.every(([, item]) => typeof item === "string")) return null;
  return Object.fromEntries(entries) as Values;
}


function copyAllowed(source: Values, allowed: string[]) {
  const row: Values = {};
  for (const key of allowed) if (source[key] !== undefined && source[key] !== "") row[key] = source[key];
  for (const key of ["ce_kp_type", "ce_contact_method", "oc_referrals"]) {
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
  try { result = JSON.parse(text); } catch { /* REDCap sometimes returns plain text. */ }
  if (!response.ok || (result && typeof result === "object" && "error" in result)) {
    const message = result && typeof result === "object" && "error" in result ? String((result as { error: unknown }).error) : text || `REDCap returned HTTP ${response.status}.`;
    throw new Error(message);
  }
  return result;
}

export async function GET(request: Request) {
  if (!await getCurrentUser()) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const uic = new URL(request.url).searchParams.get("uic")?.trim().toUpperCase() ?? "";
  if (!uic) return NextResponse.json({ error: "A UIC is required." }, { status: 400 });
  try {
    const exported = await redcap({ content: "record", action: "export", format: "json", type: "flat", rawOrLabel: "raw", rawOrLabelHeaders: "raw", exportDataAccessGroups: "false", returnFormat: "json", "records[0]": uic, "fields[0]": "uic_ori" });
    const rows = Array.isArray(exported) ? exported as Values[] : [];
    return NextResponse.json({ exists: rows.some((row) => row.uic_ori === uic) });
  } catch (error) {
    console.error("REDCap UIC lookup error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to check the UIC in REDCap." }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  let input: Submission;
  try { input = await request.json() as Submission; } catch { return NextResponse.json({ error: "The request body must be valid JSON." }, { status: 400 }); }
  const mode = input.mode;
  const enrollment = values(input.enrollment);
  const outreach = values(input.outreach);
  const partners = Array.isArray(input.partners) ? input.partners.map(values) : [];
  const children = Array.isArray(input.children) ? input.children.map(values) : [];
  if ((mode !== "new" && mode !== "existing") || !outreach || partners.some((x) => !x) || children.some((x) => !x)) return NextResponse.json({ error: "Invalid outreach submission." }, { status: 400 });
  if (!outreach.oc_worker_1 || !outreach.oc_date || !outreach.oc_type || !outreach.oc_district || !outreach.oc_prep_com) return NextResponse.json({ error: "Outreach worker, contact date, activity type, district, and PrEP counselling are required." }, { status: 400 });
  if (outreach.oc_hiv_rapid_result !== "1" && (partners.length || children.length)) return NextResponse.json({ error: "Partner referrals require a reactive HIV rapid test result." }, { status: 400 });
  for (const partner of partners as Values[]) if (!["itp_name","itp_gender","itp_violence","itp_threats","itp_forced_sex","itp_notif_method"].every((key) => partner[key])) return NextResponse.json({ error: "Complete all required partner referral fields." }, { status: 400 });
  for (const child of children as Values[]) if (!["itch_violence","itch_threats","itch_force_sex","itch_notif_method"].every((key) => child[key])) return NextResponse.json({ error: "Complete all required child referral fields." }, { status: 400 });

  const recordId = typeof input.recordId === "string" ? input.recordId.trim() : "";
  if (mode === "new") {
    if (!enrollment || !["ce_date","ce_district","ce_hotspot","ce_outreach_worker","ce_last_name","ce_first_name","ce_dob","ce_gender_identity","ce_kp_type"].every((key) => enrollment[key])) return NextResponse.json({ error: "Complete all required enrollment fields." }, { status: 400 });
    const generated = generateUic(enrollment);
    if (!generated || recordId !== generated) return NextResponse.json({ error: "The generated UIC does not match the enrollment details." }, { status: 400 });
  }
  if (!recordId) return NextResponse.json({ error: "A client record is required." }, { status: 400 });

  const validationError = (mode === "new" && enrollment ? validateFields(enrollment, enrollmentFields) : null) || validateFields(outreach, outreachFields) || (partners as Values[]).map(row => validateFields(row, partnerFields)).find(Boolean) || (children as Values[]).map(row => validateFields(row, childFields)).find(Boolean);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  try {
    const exported = await redcap({ content: "record", action: "export", format: "json", type: "flat", rawOrLabel: "raw", rawOrLabelHeaders: "raw", exportDataAccessGroups: "false", returnFormat: "json", "fields[0]": "uic_ori", "forms[0]": "outreach_contact", "forms[1]": "partner_referral_partner", "forms[2]": "partner_referral_child", "forms[3]": "client_enrollment" });
    const existing = Array.isArray(exported) ? exported as Values[] : [];
    const recordExists = existing.some((row) => row.uic_ori === recordId);
    if (mode === "new" && recordExists) return NextResponse.json({ error: `UIC ${recordId} already exists. Check the enrollment details.` }, { status: 409 });
    if (mode === "existing" && !recordExists) return NextResponse.json({ error: "The selected client no longer exists in REDCap." }, { status: 409 });
    const maximum = new Map<string, number>();
    for (const row of existing.filter((item) => item.uic_ori === recordId)) {
      const form = row.redcap_repeat_instrument;
      const instance = Number(row.redcap_repeat_instance);
      if (form && Number.isInteger(instance)) maximum.set(form, Math.max(maximum.get(form) ?? 0, instance));
    }
    const next = (form: string, offset = 0) => String((maximum.get(form) ?? 0) + 1 + offset);
    const records: Values[] = [];
    if (mode === "new" && enrollment) records.push({ uic_ori: recordId, ...copyAllowed(enrollment, enrollmentFields) });
    records.push({ uic_ori: recordId, redcap_repeat_instrument: "outreach_contact", redcap_repeat_instance: next("outreach_contact"), ...copyAllowed(outreach, outreachFields) });
    (partners as Values[]).forEach((partner, index) => records.push({ uic_ori: recordId, redcap_repeat_instrument: "partner_referral_partner", redcap_repeat_instance: next("partner_referral_partner", index), ...copyAllowed(partner, partnerFields) }));
    (children as Values[]).forEach((child, index) => records.push({ uic_ori: recordId, redcap_repeat_instrument: "partner_referral_child", redcap_repeat_instance: next("partner_referral_child", index), ...copyAllowed(child, childFields) }));
    const result = await redcap({ content: "record", action: "import", format: "json", type: "flat", overwriteBehavior: "normal", forceAutoNumber: "false", dateFormat: "YMD", data: JSON.stringify(records), returnContent: "count", returnFormat: "json" });
    const activityLogged = await recordRedcapActivity({ user, workflow: "outreach", recordId, staffName: outreach.oc_worker_1, serviceDate: outreach.oc_date, instrumentInstances: records.filter(row => row.redcap_repeat_instrument).map(row => ({ instrument: row.redcap_repeat_instrument, instance: Number(row.redcap_repeat_instance) })), submittedData: records });
    return NextResponse.json({ success: true, recordId, savedRows: records.length, activityLogged, result });
  } catch (error) {
    console.error("REDCap outreach import error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save outreach contact to REDCap." }, { status: 502 });
  }
}
