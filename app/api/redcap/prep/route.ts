//
//  route.ts
//  pils-app
//
//  Created by Elisa Kevin Veragoo + ChatGPT on 03/10/2026.
//
import { instrumentFields, instrumentCheckboxes, visibleInstrumentValues } from "@/lib/instrument-forms";
import { prepNextAppointment } from "@/lib/prep-followup";
import { latestStatus } from "@/lib/status-history";
import { NextResponse } from "next/server";
import { generateUic } from "@/lib/uic";
import { getCurrentUser, hasAnyRole } from "@/lib/auth";
import { recordRedcapActivity } from "@/lib/redcap-activity";
import { validateFields } from "@/lib/redcap-validation";
import { completeQueueEntry } from "@/lib/clinic-queue";

const REDCAP_API_URL = process.env.REDCAP_API_URL;
const REDCAP_API_TOKEN = process.env.REDCAP_API_TOKEN;

type Values = Record<string, string>;
type Submission = { mode?: unknown; recordId?: unknown; enrollment?: unknown; profile?: unknown; visit?: unknown; includeProfile?: unknown; queueId?: unknown };

const enrollmentFields = ["ce_active", "ce_date", "ce_implementing_partner", "ce_district", "ce_hotspot", "ce_outreach_worker", "ce_last_name", "ce_first_name", "ce_middle_name_1", "ce_middle_name_2", "ce_middle_name_3", "ce_alias", "ce_dob", "ce_gender_identity", "ce_vision", "ce_kp_type", "ce_tel_primary", "ce_contact_method", "ce_risk_drug_alcohol_sex", "ce_risk_violence_1m", "ce_sw_age_started", "ce_sw_sex_acts_1w", "ce_sw_condom_use_1w", "ce_msm_age_first_anal", "ce_msm_receptive_anal_1w", "ce_msm_condom_anal_1w", "ce_pwid_age_first_inject", "ce_pwid_injections_24h", "ce_pwid_injections_1w", "ce_pwid_shared_24h", "ce_pwid_shared_1w"];
const profileFields = instrumentFields("prep_treatment_profile");
const visitFields = instrumentFields("prep_visit");

function values(value: unknown): Values | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  return entries.every(([, item]) => typeof item === "string") ? Object.fromEntries(entries) as Values : null;
}


function copyAllowed(source: Values, allowed: string[]) {
  if(allowed===visitFields)source=visibleInstrumentValues("prep_visit",source);
  if(allowed===profileFields)source=visibleInstrumentValues("prep_treatment_profile",source);
  const row: Values = {};
  for (const key of allowed) if (source[key] !== undefined && source[key] !== "") row[key] = source[key].trim();
  if (source.ce_kp_type) {
    for (const code of source.ce_kp_type.split(",").filter((item) => /^\d+$/.test(item))) row[`ce_kp_type___${code}`] = "1";
    delete row.ce_kp_type;
  }
  if (source.ce_contact_method) {
    for (const code of source.ce_contact_method.split(",").filter((item) => /^\d+$/.test(item))) row[`ce_contact_method___${code}`] = "1";
    delete row.ce_contact_method;
  }
  for (const key of instrumentCheckboxes("prep_visit")) {
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

function latestProfile(rows: Values[]) {
  const profiles = rows.filter((row) => row.redcap_repeat_instrument === "prep_treatment_profile");
  profiles.sort((a, b) => Number(b.redcap_repeat_instance || 0) - Number(a.redcap_repeat_instance || 0));
  const latest = profiles[0];
  if (!latest) return null;
  return Object.fromEntries(profileFields.map((field) => [field, latest[field] ?? ""]));
}

async function exportRecord(recordId: string) {
  const result = await redcap({ content: "record", action: "export", format: "json", type: "flat", rawOrLabel: "raw", rawOrLabelHeaders: "raw", exportDataAccessGroups: "false", returnFormat: "json", "records[0]": recordId, "forms[0]": "client_enrollment", "forms[1]": "prep_treatment_profile", "forms[2]": "prep_visit" });
  return Array.isArray(result) ? result as Values[] : [];
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!hasAnyRole(user, ["HEALTHCARE_ASSISTANT", "ADMIN"])) return NextResponse.json({ error: "Access to this workflow is not permitted." }, { status: 403 });
  const uic = new URL(request.url).searchParams.get("uic")?.trim().toUpperCase() ?? "";
  if (!uic) return NextResponse.json({ error: "A UIC is required." }, { status: 400 });
  try {
    const rows = await exportRecord(uic);
    return NextResponse.json({ exists: rows.some((row) => row.uic_ori === uic), latestProfile: latestProfile(rows),programmeStatus:latestStatus(rows,"prep") });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load the client from REDCap." }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!hasAnyRole(user, ["HEALTHCARE_ASSISTANT", "ADMIN"])) return NextResponse.json({ error: "Access to this workflow is not permitted." }, { status: 403 });
  let input: Submission;
  try { input = await request.json() as Submission; } catch { return NextResponse.json({ error: "The request body must be valid JSON." }, { status: 400 }); }

  const mode = input.mode;
  const recordId = typeof input.recordId === "string" ? input.recordId.trim().toUpperCase() : "";
  const enrollment = values(input.enrollment);
  const submittedProfile = values(input.profile);
  const visit = values(input.visit);
  const includeProfile = mode === "new" || input.includeProfile === true;
  if ((mode !== "new" && mode !== "existing") || !recordId || !visit || (includeProfile && !submittedProfile)) return NextResponse.json({ error: "Invalid PrEP workflow submission." }, { status: 400 });
  if (!visit.pv_visit_date?.trim()) return NextResponse.json({ error: "Visit date is required." }, { status: 400 });
  visit.pv_next_appointment_date = prepNextAppointment(visit);

  if (mode === "new") {
    const requiredEnrollment = ["ce_date", "ce_district",  "ce_outreach_worker", "ce_last_name", "ce_first_name", "ce_dob", "ce_gender_identity", "ce_kp_type"];
    if (!enrollment || !requiredEnrollment.every((key) => enrollment[key]?.trim())) return NextResponse.json({ error: "Complete all required enrollment fields." }, { status: 400 });
    if (generateUic(enrollment) !== recordId) return NextResponse.json({ error: "The generated UIC does not match the enrollment details." }, { status: 400 });
  }

  const earlyValidation = (mode === "new" && enrollment ? validateFields(enrollment, enrollmentFields) : null) || validateFields(visit, visitFields);
  if (earlyValidation) return NextResponse.json({ error: earlyValidation }, { status: 400 });

  try {
    const existing = await exportRecord(recordId);
    const recordExists = existing.some((row) => row.uic_ori === recordId);
    if (mode === "new" && recordExists) return NextResponse.json({ error: `UIC ${recordId} already exists. Use Existing client.` }, { status: 409 });
    if (mode === "existing" && !recordExists) return NextResponse.json({ error: "The selected client no longer exists in REDCap." }, { status: 409 });

    const currentProfile = latestProfile(existing) ?? {};
    const profile = includeProfile ? { ...currentProfile, ...submittedProfile } as Values : null;
    if (profile) {

      const requiredProfile = ["ptp_update_date", "ptp_recorded_by"];
      if (!requiredProfile.every((key) => profile[key]?.trim())) return NextResponse.json({ error: "Complete all required PrEP Treatment Profile fields." }, { status: 400 });
      const profileValidation = validateFields(profile, profileFields);
      if (profileValidation) return NextResponse.json({ error: profileValidation }, { status: 400 });
    }

    const maximum = new Map<string, number>();
    for (const row of existing) {
      const form = row.redcap_repeat_instrument;
      const instance = Number(row.redcap_repeat_instance);
      if (form && Number.isInteger(instance)) maximum.set(form, Math.max(maximum.get(form) ?? 0, instance));
    }
    const next = (form: string) => String((maximum.get(form) ?? 0) + 1);
    visit.pv_profile_updated = profile ? "1" : "0";
    if(mode==="new"&&!visit.ptp_status)visit.ptp_status="1";
    const records: Values[] = [];
    if (mode === "new" && enrollment) records.push({ uic_ori: recordId, ...copyAllowed(enrollment, enrollmentFields) });
    if (profile) records.push({ uic_ori: recordId, redcap_repeat_instrument: "prep_treatment_profile", redcap_repeat_instance: next("prep_treatment_profile"), ...copyAllowed(profile, profileFields) });
    records.push({ uic_ori: recordId, redcap_repeat_instrument: "prep_visit", redcap_repeat_instance: next("prep_visit"), ...copyAllowed(visit, visitFields) });

    const result = await redcap({ content: "record", action: "import", format: "json", type: "flat", overwriteBehavior: "normal", forceAutoNumber: "false", dateFormat: "YMD", data: JSON.stringify(records), returnContent: "count", returnFormat: "json" });
    const activityLogged = await recordRedcapActivity({ user, workflow: "prep", recordId, staffName: visit.pv_worker_1 || user.name, serviceDate: visit.pv_visit_date, instrumentInstances: records.filter(row => row.redcap_repeat_instrument).map(row => ({ instrument: row.redcap_repeat_instrument, instance: Number(row.redcap_repeat_instance) })), submittedData: records });
    const queueCompleted = await completeQueueEntry(typeof input.queueId === "string" ? input.queueId : undefined, recordId, user);
    return NextResponse.json({ success: true, recordId, savedRows: records.length, profileUpdated: Boolean(profile), activityLogged, queueCompleted, result });
  } catch (error) {
    console.error("REDCap PrEP workflow import error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save PrEP workflow data to REDCap." }, { status: 502 });
  }
}
