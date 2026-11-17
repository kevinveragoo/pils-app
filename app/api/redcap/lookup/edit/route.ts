import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { filterRestrictedLookupData } from "@/lib/lookup-privacy";
import { getCurrentUser, hasAnyRole } from "@/lib/auth";
import { canEditLookup } from "@/lib/lookup-edit-access";
import { editPatch, editValues, editableField, type EditField } from "@/lib/lookup-edit";
import { db } from "@/lib/db";

type Identity = { uic: string; form: string; instance: string; event: string };
async function api(params: Record<string, string>) {
  const url = process.env.REDCAP_API_URL, token = process.env.REDCAP_API_TOKEN;
  if (!url || !token) throw Error("REDCap API configuration is missing.");
  const response = await fetch(url, { method: "POST", cache: "no-store", signal: AbortSignal.timeout(60000), body: new URLSearchParams({ token, format: "json", returnFormat: "json", ...params }) });
  const result = await response.json();
  if (!response.ok || result?.error) throw Error("REDCap request failed.");
  return result;
}
async function load(identity: Identity, user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>) {
  const [metadata, rows, repeating] = await Promise.all([
    api({ content: "metadata" }),
    api({ content: "record", action: "export", type: "flat", "records[0]": identity.uic, rawOrLabel: "raw", rawOrLabelHeaders: "raw", exportCheckboxLabel: "false" }),
    api({ content: "repeatingFormsEvents" }),
  ]);
  if (![metadata, rows, repeating].every(Array.isArray)) throw Error("Unable to load this entry.");
  const fields: EditField[] = metadata.filter((field: EditField) => field.form_name === identity.form);
  if (!fields.length) throw Error("Instrument not found.");
  const isRepeating = repeating.some((form: { form_name: string }) => form.form_name === identity.form) || rows.some((row: Record<string, string>) => row.redcap_repeat_instrument === identity.form);
  if (isRepeating ? !/^[1-9]\d*$/.test(identity.instance) : Boolean(identity.instance)) throw Error("Invalid entry identity.");
  const matches = rows.filter((row: Record<string, string>) => String(row.uic_ori) === identity.uic && String(row.redcap_event_name ?? "") === identity.event && String(row.redcap_repeat_instrument ?? "") === (isRepeating ? identity.form : "") && String(row.redcap_repeat_instance ?? "") === identity.instance);
  if (matches.length !== 1) throw Error("The exact entry was not found. No new entries can be created here.");
  const row: Record<string, string> = matches[0];
  if (!isRepeating && !fields.some(field => field.field_name !== "uic_ori" && field.field_type !== "descriptive" && field.field_type !== "calc" && (field.field_type === "checkbox" ? Object.entries(row).some(([key, value]) => key.startsWith(`${field.field_name}___`) && String(value) === "1") : String(row[field.field_name] ?? "").trim() !== "")) && !["1", "2"].includes(String(row[`${identity.form}_complete`] ?? ""))) throw Error("This instrument has no existing entry to edit.");
  const names = new Set(fields.map(field => field.field_name));
  const snapshot = Object.entries(row).filter(([name]) => names.has(name.split("___")[0]) || name === `${identity.form}_complete`).sort(([a], [b]) => a.localeCompare(b));
  const version = createHash("sha256").update(JSON.stringify({ identity, fields, snapshot })).digest("hex");
  // Branches may refer to enrollment/profile fields outside this instrument.
  // Only return context the actor is already permitted to view in Lookup.
  const visible = filterRestrictedLookupData(rows, metadata, [], repeating, {
    clinical: hasAnyRole(user, ["HEALTHCARE_ASSISTANT", "HEALTHCARE_NAVIGATOR", "ADMIN"]),
    riskViolence: hasAnyRole(user, ["OUTREACH_WORKER", "HEALTHCARE_ASSISTANT", "ADMIN"]),
  });
  const base = visible.rows.find(candidate => !candidate.redcap_repeat_instrument && String(candidate.redcap_event_name ?? "") === identity.event) ?? {};
  const references = new Set(fields.flatMap(field => [...(field.branching_logic ?? "").matchAll(/\[([a-zA-Z0-9_]+)(?:\(\d+\))?\]/g)].map(match => match[1])));
  const contextFields = visible.metadata.filter(field => references.has(field.field_name) && !fields.some(own => own.field_name === field.field_name));
  return { fields, row, version, isRepeating, values: { ...editValues(contextFields, base), ...editValues(fields, row) } };

}
function identityFrom(value: Record<string, unknown>): Identity {
  for (const key of ["uic", "form", "instance", "event"]) if (typeof value[key] !== "string") throw Error("Invalid entry identity.");
  const identity = value as Identity;
  if (!identity.uic || !/^[a-z][a-z0-9_]*$/.test(identity.form)) throw Error("Invalid entry identity.");
  return { uic: identity.uic, form: identity.form, instance: identity.instance, event: identity.event };
}
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    const identity = identityFrom(Object.fromEntries(new URL(request.url).searchParams));
    if (!canEditLookup(user, identity.form)) return NextResponse.json({ error: "You cannot edit this instrument." }, { status: 403 });
    const loaded = await load(identity, user);
    return NextResponse.json({ identity, fields: loaded.fields.filter(editableField), values: loaded.values, version: loaded.version }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Unable to open this entry for editing." }, { status: 400 }); }
}
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const origin = request.headers.get("origin"), host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (!origin || URL.parse(origin)?.host !== host) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  let auditId: string | undefined;
  try {
    if (Number(request.headers.get("content-length") || 0) > 500000) return NextResponse.json({ error: "Request too large." }, { status: 413 });
    const body = await request.json();
    const identity = identityFrom(body.identity ?? {});
    if (!canEditLookup(user, identity.form)) return NextResponse.json({ error: "You cannot edit this instrument." }, { status: 403 });
    if (!body.values || typeof body.values !== "object" || Array.isArray(body.values) || Object.values(body.values).some(value => typeof value !== "string" || value.length > 50000)) return NextResponse.json({ error: "Invalid field values." }, { status: 400 });
    const current = await load(identity, user);
    if (body.version !== current.version) return NextResponse.json({ error: "This entry changed since you opened it. Close and reopen it before saving." }, { status: 409 });
    let patch: Record<string, string>;
    try { patch = editPatch(current.fields, current.values, body.values); }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid changes." }, { status: 400 }); }
    if (!Object.keys(patch).length) return NextResponse.json({ success: true });
    const changes = Object.fromEntries(Object.keys(patch).map(name => [name, { before: String(current.row[name] ?? ""), after: patch[name] }]));
    const audit = await db.auditLog.create({ data: { actorId: user.id, event: "LOOKUP_EDIT_PENDING", details: JSON.stringify({ ...identity, changes }) } });
    auditId = audit.id;
    const record: Record<string, string> = { uic_ori: identity.uic, ...patch };
    if (identity.event) record.redcap_event_name = identity.event;
    if (current.isRepeating) { record.redcap_repeat_instrument = identity.form;record.redcap_repeat_instance = identity.instance; }
    await api({ content: "record", action: "import", type: "flat", overwriteBehavior: "overwrite", forceAutoNumber: "false", returnContent: "count", data: JSON.stringify([record]) });
    const verified = await load(identity, user);
    if (Object.entries(patch).some(([name, value]) => String(verified.row[name] ?? "") !== value)) throw Error("Save verification failed.");
    await db.auditLog.update({ where: { id: auditId }, data: { event: "LOOKUP_ENTRY_UPDATED" } });
    return NextResponse.json({ success: true });
  } catch {
    if (auditId) await db.auditLog.update({ where: { id: auditId }, data: { event: "LOOKUP_EDIT_REQUIRES_REVIEW" } }).catch(() => {});
    return NextResponse.json({ error: "Unable to confirm the update. Reload the entry to check its current values before trying again." }, { status: 502 });
  }
}
