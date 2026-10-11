import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { buildLookupSections, type LookupField, type LookupInstrument, type LookupRow } from "@/lib/record-lookup";

export async function GET(request: Request) {
  if (!await getCurrentUser()) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const uic = new URL(request.url).searchParams.get("uic")?.trim() ?? "";
  if (!uic) return NextResponse.json({ error: "Select a client to view their record." }, { status: 400 });
  const url = process.env.REDCAP_API_URL, token = process.env.REDCAP_API_TOKEN;
  if (!url || !token) return NextResponse.json({ error: "REDCap API configuration is missing." }, { status: 500 });
  async function read(params: Record<string, string>) {
    const response = await fetch(url!, { method: "POST", body: new URLSearchParams({ token: token!, format: "json", returnFormat: "json", ...params }), cache: "no-store", signal: AbortSignal.timeout(60000) });
    const result: unknown = await response.json();
    if (!response.ok || !Array.isArray(result)) throw new Error("Unable to load the record from REDCap.");
    return result;
  }
  try {
    const results = await Promise.allSettled([
      read({ content: "record", action: "export", type: "flat", "records[0]": uic, rawOrLabel: "raw", rawOrLabelHeaders: "raw", exportCheckboxLabel: "false", exportSurveyFields: "true", exportDataAccessGroups: "true" }),
      read({ content: "metadata" }), read({ content: "instrument" }), read({ content: "repeatingFormsEvents" }),
    ]);
    if (results.some(result => result.status === "rejected")) throw new Error("Unable to load the record from REDCap.");
    const [records, metadata, instruments, repeating] = results.map(result => (result as PromiseFulfilledResult<unknown[]>).value);
    // Restrict the response to exactly the requested record, even if an upstream filter fails.
    const rows = (records as LookupRow[]).filter(row => String(row.uic_ori) === uic);
    if (!rows.length) return NextResponse.json({ error: "The selected record was not found." }, { status: 404 });
    return NextResponse.json({ uic, sections: buildLookupSections(rows, metadata as LookupField[], instruments as LookupInstrument[], repeating as { form_name: string }[]) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Unable to load the record from REDCap." }, { status: 502 });
  }
}
