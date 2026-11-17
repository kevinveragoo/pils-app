//
//  route.ts
//  pils-app
//
//  Created by Elisa Kevin Veragoo + ChatGPT on 07/10/2026.
//
import { NextResponse } from "next/server";
import { getCurrentUser, hasAnyRole } from "@/lib/auth";
import { buildDashboard, dashboardFields, genderCodes, kpCodes, parseMultiFilter, periods, type Period, type Values } from "@/lib/dashboard";

const REDCAP_API_URL = process.env.REDCAP_API_URL;
const REDCAP_API_TOKEN = process.env.REDCAP_API_TOKEN;

async function redcap(params: Record<string, string>) {
  if (!REDCAP_API_URL || !REDCAP_API_TOKEN) throw new Error("REDCap API configuration is missing.");
  const response = await fetch(REDCAP_API_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: REDCAP_API_TOKEN, ...params }), cache: "no-store" });
  const text = await response.text();
  let result: unknown;
  try { result = JSON.parse(text); } catch { throw new Error(text.startsWith("<!DOCTYPE") ? "REDCap returned an HTML page instead of data." : "REDCap returned an invalid response."); }
  if (!response.ok || (result && typeof result === "object" && "error" in result)) {
    const message = result && typeof result === "object" && "error" in result ? String((result as { error: unknown }).error) : `REDCap returned HTTP ${response.status}.`;
    throw new Error(message);
  }
  return Array.isArray(result) ? result as Values[] : [];
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!hasAnyRole(user, ["HEALTHCARE_ASSISTANT", "ADMIN"])) return NextResponse.json({ error: "Healthcare Assistant or Administrator access required." }, { status: 403 });

  const search = new URL(request.url).searchParams;
  const period = search.get("period") ?? "all";
  const genders = parseMultiFilter(search.get("gender"), genderCodes);
  const kps = parseMultiFilter(search.get("kp"), kpCodes);
  if (!periods.has(period as Period) || genders === null || kps === null) return NextResponse.json({ error: "Invalid dashboard filter." }, { status: 400 });

  try {
    const params: Record<string, string> = { content: "record", action: "export", format: "json", type: "flat", rawOrLabel: "raw", rawOrLabelHeaders: "raw", exportCheckboxLabel: "false", exportDataAccessGroups: "false", returnFormat: "json" };
    dashboardFields.forEach((field, index) => { params[`fields[${index}]`] = field; });
    const rows = await redcap(params);
    return NextResponse.json(buildDashboard(rows, { period: period as Period, genders, kps }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("REDCap dashboard error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load dashboard data." }, { status: 502 });
  }
}
