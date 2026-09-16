import { NextResponse } from "next/server";

const REDCAP_API_URL = process.env.REDCAP_API_URL;
const REDCAP_API_TOKEN = process.env.REDCAP_API_TOKEN;

type Values = Record<string, string>;
type Submission = { mode?: unknown; recordId?: unknown; enrollment?: unknown; outreach?: unknown; partners?: unknown; children?: unknown };

const enrollmentFields = ["enrollment_date_11a07b","implementing_partner_41a2cd","district_979c1b","hotspot","client_outreach_worker","client_last_name","client_first_name","client_middle_name","client_alias","client_dob","client_gender_identity","client_kp_type","phone_primary","preferred_contact_method","risk_drug_alcohol_sex","risk_violence_month","sw_age_started","sw_sex_acts_week","sw_condom_intimate","msm_age_first_anal","msm_receptive_anal_week","msm_condom_anal","pwid_age_first_inject","pwid_injections_week","pwid_shared_week"];
const outreachFields = ["outreach_worker_1","outreach_worker_2","outreach_worker_3","outreach_date","sortie_type","outreach_hotspot","new_client","outreach_sex_acts_week","outreach_condom_use","outreach_drug_alcohol","outreach_shared_inject","outreach_violence_report","outreach_violence_address","outreach_male_condoms","outreach_female_condoms","outreach_lubricant","outreach_hiv_self_test","outreach_syringes","outreach_needles","outreach_hiv_status","outreach_hiv_rapid_result","outreach_hiv_iec","outreach_hepc_status","outreach_hepc_result","outreach_hepc_iec","outreach_hepb_status","outreach_hepb_result","outreach_hepb_iec","outreach_syp_status","outreach_syp_result","outreach_syp_iec","prep_interested","outreach_referred","ref_other_specify","outreach_followup_needed","outreach_followup_date","outreach_notes"];
const partnerFields = ["partner_name","partner_nickname","partner_dob","partner_age","partner_gender","partner_description","partner_lives_with","partner_address","partner_address_2","partner_work_hours","partner_phone","partner_phone_alt","partner_relationship","partner_violence","partner_threats","partner_forced_sex","part_not_method","part_not_date","first_cont_date","first_cont_method","second_cont_date","first_cont_method_2","third_cont_date","first_cont_method_3","part_cont_success","part_cont_by_who","contact_result","cont_result_other","part_hiv_result","part_cont_art","partner_enrolled","partner_new_uic","partner_notes"];
const childFields = ["child_nameprc","child_dobprc","child_ageprc","child_genderprc","partner_addressprc","partner_lives_withprc","partner_violenceprc","partner_threatsprc","partner_forced_sexprc","part_not_methodprc","part_not_dateprc","first_cont_methodprc","part_hiv_resultprc","part_cont_artprc","child_enrolledprc","child_new_uicprc","child_notesprc"];

function values(value: unknown): Values | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (!entries.every(([, item]) => typeof item === "string")) return null;
  return Object.fromEntries(entries) as Values;
}

function cleanLetters(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/gi, "").toUpperCase();
}

function buildUic(v: Values) {
  const prefix = ({ "1": "M", "2": "F", "3": "T", "4": "T", "5": "O", "9": "R" } as Record<string, string>)[v.client_gender_identity] ?? "";
  const dob = v.client_dob?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const first = cleanLetters(v.client_first_name ?? "").slice(0, 1);
  const middle = (v.client_middle_name ?? "").trim().split(/\s+/).filter(Boolean).map((name) => cleanLetters(name).slice(0, 1)).join("");
  const surname = cleanLetters(v.client_last_name ?? "");
  if (!prefix || !dob || !first || !surname) return "";
  return `${prefix}${dob[3]}${dob[2]}${dob[1]}${first}${middle}_${surname[0]}${surname.at(-1)}`;
}

function copyAllowed(source: Values, allowed: string[]) {
  const row: Values = {};
  for (const key of allowed) if (source[key] !== undefined && source[key] !== "") row[key] = source[key];
  for (const key of ["client_kp_type", "preferred_contact_method", "outreach_referred"]) {
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
  let input: Submission;
  try { input = await request.json() as Submission; } catch { return NextResponse.json({ error: "The request body must be valid JSON." }, { status: 400 }); }
  const mode = input.mode;
  const enrollment = values(input.enrollment);
  const outreach = values(input.outreach);
  const partners = Array.isArray(input.partners) ? input.partners.map(values) : [];
  const children = Array.isArray(input.children) ? input.children.map(values) : [];
  if ((mode !== "new" && mode !== "existing") || !outreach || partners.some((x) => !x) || children.some((x) => !x)) return NextResponse.json({ error: "Invalid outreach submission." }, { status: 400 });
  if (!outreach.outreach_worker_1 || !outreach.outreach_date || !outreach.sortie_type) return NextResponse.json({ error: "Outreach worker, contact date, and contact setting are required." }, { status: 400 });
  if (outreach.outreach_hiv_rapid_result !== "1" && (partners.length || children.length)) return NextResponse.json({ error: "Partner referrals require a reactive HIV rapid test result." }, { status: 400 });
  for (const partner of partners as Values[]) if (!["partner_name","partner_gender","partner_violence","partner_threats","partner_forced_sex","part_not_method"].every((key) => partner[key])) return NextResponse.json({ error: "Complete all required partner referral fields." }, { status: 400 });
  for (const child of children as Values[]) if (!["child_nameprc","child_genderprc","partner_violenceprc","partner_threatsprc","partner_forced_sexprc","part_not_methodprc"].every((key) => child[key])) return NextResponse.json({ error: "Complete all required child referral fields." }, { status: 400 });

  const recordId = typeof input.recordId === "string" ? input.recordId.trim() : "";
  if (mode === "new") {
    if (!enrollment || !["enrollment_date_11a07b","district_979c1b","hotspot","client_outreach_worker","client_last_name","client_first_name","client_dob","client_gender_identity","client_kp_type"].every((key) => enrollment[key])) return NextResponse.json({ error: "Complete all required enrollment fields." }, { status: 400 });
    const generated = buildUic(enrollment);
    if (!generated || recordId !== generated) return NextResponse.json({ error: "The generated UIC does not match the enrollment details." }, { status: 400 });
  }
  if (!recordId) return NextResponse.json({ error: "A client record is required." }, { status: 400 });

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
    return NextResponse.json({ success: true, recordId, savedRows: records.length, result });
  } catch (error) {
    console.error("REDCap outreach import error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save outreach contact to REDCap." }, { status: 502 });
  }
}
