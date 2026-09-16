import { NextResponse } from "next/server";

const API_URL = process.env.REDCAP_API_URL;
const API_TOKEN = process.env.REDCAP_API_TOKEN;

type Values = Record<string, string>;

const fields = [
  "enrollment_date_11a07b","enrollment_channel","implementing_partner_41a2cd","district_979c1b","district_other_f71f90","hotspot","new_hotspot","outreach_supervisor","client_outreach_worker",
  "client_last_name","client_first_name","client_middle_name","client_alias","client_name_full","client_dob","client_gender_identity","sex_assigned_birth_4b080f","client_kp_type","nationality_9eb329","national_id","degre_mobilite","uic_ori_valid",
  "phone_primary","phone_secondary","contact_address_74c02c","preferred_contact_method","preferred_meeting_place","emergency_contact_name","emergency_contact_number",
  "marital_status","num_of_children","parent_celib","niveau_etude","srm_registered","pension_yn","codepat",
  "service_visit_6m","service_visit_location","peer_contact_previous","risk_drug_alcohol_sex","risk_violence_month","sw_age_started","sw_sex_acts_week","sw_condom_intimate","msm_age_first_anal","msm_receptive_anal_week","msm_condom_anal","pwid_age_first_inject","pwid_injections_24h_b12f8a","pwid_injections_week","pwid_shared_24h","pwid_shared_week",
  "consent_date","consent_signature_date","consent_witness","client_active","client_exit_date","vital_status","client_exit_reason","comments","client_notes",
];

function letters(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/gi, "").toUpperCase();
}

function buildUic(v: Values) {
  const prefix = ({ "1": "M", "2": "F", "3": "T", "4": "T", "5": "O", "9": "R" } as Record<string, string>)[v.client_gender_identity] ?? "";
  const dob = v.client_dob?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const first = letters(v.client_first_name ?? "").slice(0, 1);
  const middle = (v.client_middle_name ?? "").trim().split(/\s+/).filter(Boolean).map((name) => letters(name).slice(0, 1)).join("");
  const surname = letters(v.client_last_name ?? "");
  return prefix && dob && first && surname ? `${prefix}${dob[3]}${dob[2]}${dob[1]}${first}${middle}_${surname[0]}${surname.at(-1)}` : "";
}

async function redcap(params: Record<string, string>) {
  if (!API_URL || !API_TOKEN) throw new Error("REDCap API configuration is missing.");
  const response = await fetch(API_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: API_TOKEN, ...params }), cache: "no-store" });
  const text = await response.text();
  let result: unknown = text;
  try { result = JSON.parse(text); } catch { /* REDCap may return plain text. */ }
  if (!response.ok || (result && typeof result === "object" && "error" in result)) {
    const message = result && typeof result === "object" && "error" in result ? String((result as { error: unknown }).error) : text || `REDCap returned HTTP ${response.status}.`;
    throw new Error(message);
  }
  return result;
}

async function exists(uic: string) {
  const result = await redcap({ content: "record", action: "export", format: "json", type: "flat", rawOrLabel: "raw", rawOrLabelHeaders: "raw", returnFormat: "json", "records[0]": uic, "fields[0]": "uic_ori" });
  return Array.isArray(result) && result.some((row) => row && typeof row === "object" && (row as Values).uic_ori === uic);
}

export async function GET(request: Request) {
  const uic = new URL(request.url).searchParams.get("uic")?.trim().toUpperCase() ?? "";
  if (!uic) return NextResponse.json({ error: "A UIC is required." }, { status: 400 });
  try {
    const result = await redcap({ content: "record", action: "export", format: "json", type: "flat", rawOrLabel: "raw", rawOrLabelHeaders: "raw", exportCheckboxLabel: "false", returnFormat: "json", "records[0]": uic, "forms[0]": "client_enrollment" });
    const rows = Array.isArray(result) ? result as Values[] : [];
    const row = rows.find((item) => !item.redcap_repeat_instrument && item.uic_ori === uic);
    if (!row) return NextResponse.json({ error: "Client enrollment not found." }, { status: 404 });
    const values: Values = {};
    for (const key of fields) values[key] = row[key] ?? "";
    for (const key of ["client_kp_type", "preferred_contact_method"]) values[key] = Array.from({ length: key === "client_kp_type" ? 7 : 5 }, (_, index) => String(index + 1)).filter((code) => row[`${key}___${code}`] === "1").join(",");
    return NextResponse.json({ uic, values });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load enrollment." }, { status: 502 });
  }
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const payloadText = form.get("payload");
    if (typeof payloadText !== "string") return NextResponse.json({ error: "Enrollment data is missing." }, { status: 400 });
    const payload = JSON.parse(payloadText) as { mode?: unknown; recordId?: unknown; values?: unknown };
    if ((payload.mode !== "new" && payload.mode !== "existing") || typeof payload.recordId !== "string" || !payload.values || typeof payload.values !== "object" || Array.isArray(payload.values)) return NextResponse.json({ error: "Invalid enrollment submission." }, { status: 400 });
    const values = payload.values as Values;
    if (!Object.values(values).every((value) => typeof value === "string")) return NextResponse.json({ error: "Invalid enrollment values." }, { status: 400 });
    const required = ["enrollment_date_11a07b","district_979c1b","client_outreach_worker","client_last_name","client_first_name","client_dob","client_gender_identity","client_kp_type"];
    const missing = required.filter((key) => !values[key]?.trim());
    if (missing.length) return NextResponse.json({ error: "Complete all required enrollment fields." }, { status: 400 });
    const recordId = payload.recordId.trim().toUpperCase();
    if (payload.mode === "new" && buildUic(values) !== recordId) return NextResponse.json({ error: "The generated UIC does not match the enrollment details." }, { status: 400 });
    const recordExists = await exists(recordId);
    if (payload.mode === "new" && recordExists) return NextResponse.json({ error: `UIC ${recordId} already exists. Use Existing client.` }, { status: 409 });
    if (payload.mode === "existing" && !recordExists) return NextResponse.json({ error: "The selected client no longer exists in REDCap." }, { status: 409 });
    const row: Values = { uic_ori: recordId };
    for (const key of fields) if (payload.mode === "existing" || values[key]?.trim()) row[key] = values[key]?.trim() ?? "";
    for (const key of ["client_kp_type", "preferred_contact_method"]) {
      delete row[key];
      const selected = new Set(values[key]?.split(",").filter(Boolean) ?? []);
      const count = key === "client_kp_type" ? 7 : 5;
      for (let index = 1; index <= count; index++) row[`${key}___${index}`] = selected.has(String(index)) ? "1" : "0";
    }
    await redcap({ content: "record", action: "import", format: "json", type: "flat", overwriteBehavior: "overwrite", forceAutoNumber: "false", dateFormat: "YMD", data: JSON.stringify([row]), returnContent: "count", returnFormat: "json" });
    const signature = form.get("client_signature");
    if (signature instanceof File && signature.size > 0) {
      if (!API_URL || !API_TOKEN) throw new Error("REDCap API configuration is missing.");
      const upload = new FormData();
      upload.set("token", API_TOKEN); upload.set("content", "file"); upload.set("action", "import"); upload.set("record", recordId); upload.set("field", "client_signature"); upload.set("returnFormat", "json"); upload.set("file", signature, signature.name);
      const response = await fetch(API_URL, { method: "POST", body: upload });
      const text = await response.text();
      if (!response.ok) throw new Error(text || "Unable to upload the client signature.");
      try { const result = JSON.parse(text) as { error?: string }; if (result.error) throw new Error(result.error); } catch (error) { if (error instanceof SyntaxError) { /* success may be plain text */ } else throw error; }
    }
    return NextResponse.json({ success: true, recordId });
  } catch (error) {
    console.error("REDCap enrollment error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save enrollment." }, { status: 502 });
  }
}
