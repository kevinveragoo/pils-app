//
//  route.ts
//  pils-app
//
//  Created by Elisa Kevin Veragoo + ChatGPT on 18/10/2026.
//
import { NextResponse } from "next/server";
import { getCurrentUser, hasAnyRole } from "@/lib/auth";
import { enrollmentFields, requiredEnrollmentFields } from "@/lib/client-enrollment";
import { generateUic } from "@/lib/uic";
import { validateFields } from "@/lib/redcap-validation";
import { recordRedcapActivity } from "@/lib/redcap-activity";
async function redcap(params: Record<string, string>) {
  const url = process.env.REDCAP_API_URL, token = process.env.REDCAP_API_TOKEN;
  if (!url || !token) throw Error("REDCap API configuration is missing.");
  const response = await fetch(url, { method: "POST", body: new URLSearchParams({ token, format: "json", returnFormat: "json", ...params }), cache: "no-store" });
  const data = await response.json();
  if (!response.ok || data?.error) throw Error(data?.error || "Unable to access REDCap.");
  return data;
}
async function exists(uic: string) {
  const rows = await redcap({ content: "record", action: "export", type: "flat", "records[0]": uic, "fields[0]": "uic_ori" });
  if (!Array.isArray(rows)) throw Error("Unable to check the UIC in REDCap.");
  return rows.some(row => row.uic_ori === uic);
}
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!hasAnyRole(user, ["FACILITY_STAFF", "ADMIN"])) return NextResponse.json({ error: "Facility Staff access is required." }, { status: 403 });
  const uic = new URL(request.url).searchParams.get("uic")?.trim().toUpperCase();
  if (!uic) return NextResponse.json({ error: "A UIC is required." }, { status: 400 });
  try { return NextResponse.json({ exists: await exists(uic) }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to check UIC." }, { status: 502 }); }
}
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!hasAnyRole(user, ["FACILITY_STAFF", "ADMIN"])) return NextResponse.json({ error: "Facility Staff access is required." }, { status: 403 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const input = body?.enrollment;
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.values(input).some(value => typeof value !== "string")) return NextResponse.json({ error: "Invalid enrollment details." }, { status: 400 });
  const enrollment = Object.fromEntries(Object.entries(input as Record<string, string>).map(([key, value]) => [key, value.trim()]));
  if (!requiredEnrollmentFields.every(key => enrollment[key])) return NextResponse.json({ error: "Complete all required enrollment fields." }, { status: 400 });
  const uic = generateUic(enrollment);
  if (!uic || body.recordId !== uic) return NextResponse.json({ error: "The UIC does not match the enrollment details." }, { status: 400 });
  const error = validateFields(enrollment, enrollmentFields);
  if (error) return NextResponse.json({ error }, { status: 400 });
  try {
    if (await exists(uic)) return NextResponse.json({ error: "This UIC already exists. The existing client has not been changed." }, { status: 409 });
    const row: Record<string, string> = { uic_ori: uic };
    for (const field of enrollmentFields) {
      if (!enrollment[field]) continue;
      if (["ce_kp_type", "ce_contact_method"].includes(field)) for (const code of enrollment[field].split(",")) row[`${field}___${code}`] = "1";
      else row[field] = enrollment[field];
    }
    const result = await redcap({ content: "record", action: "import", type: "flat", overwriteBehavior: "normal", forceAutoNumber: "false", dateFormat: "YMD", returnContent: "count", data: JSON.stringify([row]) });
    const activityLogged = await recordRedcapActivity({ user, workflow: "client-enrollment", recordId: uic, staffName: enrollment.ce_outreach_worker, serviceDate: enrollment.ce_date, instrumentInstances: [{ instrument: "client_enrollment" }], submittedData: [row] });
    return NextResponse.json({ success: true, recordId: uic, activityLogged, result });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save enrollment." }, { status: 502 }); }
}
