import "server-only";

import { createHash } from "node:crypto";
import { db } from "@/lib/db";

type RedcapLogRow = { timestamp?: string; username?: string; action?: string; details?: string; record?: string };
type MetadataRow = { field_name: string; field_label: string; field_type: string; select_choices_or_calculations: string };

export type ActivityField = { name: string; label: string; value: string };
export type ActivityEntry = {
  id: string;
  source: "app" | "redcap";
  timestamp: string;
  workflow: string;
  recordId: string;
  enteredBy: string;
  staffName: string;
  serviceDate: string;
  action: string;
  fields: ActivityField[];
  instances: string;
};

const workflows = [
  { name: "Outreach", prefixes: ["oc_", "itp_", "itch_"] },
  { name: "Healthcare Navigator", prefixes: ["hcs_"] },
  { name: "HIV treatment", prefixes: ["htp_", "htm_"] },
  { name: "PrEP", prefixes: ["ptp_", "pv_"] },
  { name: "Clinic", prefixes: ["cne_", "cnv_"] },
  { name: "Breakfast", prefixes: ["breakfast_", "extra_servings"] },
  { name: "Client Enrollment", prefixes: ["ce_"] },
];

const staffFields = ["oc_worker_1", "hcs_navigator_1", "pv_recorded_by", "cne_worker", "cnv_worker", "breakfast_recorded_by", "ce_outreach_worker"];
const dateFields = ["oc_date", "hcs_date", "pv_visit_date", "cne_date", "cnv_date", "breakfast_date", "ce_date"];

function workflowFor(names: string[], fallback = "REDCap record") {
  return workflows.find(item => names.some(name => item.prefixes.some(prefix => name.startsWith(prefix))))?.name ?? fallback;
}

function choices(value: string) {
  return new Map(value.split("|").map(part => part.trim()).map(part => {
    const comma = part.indexOf(",");
    return comma < 0 ? [part, part] : [part.slice(0, comma).trim(), part.slice(comma + 1).trim()];
  }));
}

function labelField(name: string, value: string, metadata: Map<string, MetadataRow>): ActivityField {
  const checkbox = name.match(/^(.+)\(([^)]+)\)$/);
  const base = checkbox?.[1] ?? name;
  const field = metadata.get(base);
  let display = value;
  if (checkbox && field) {
    const state = value === "checked" || value === "1" ? "Selected" : value === "unchecked" || value === "0" ? "Not selected" : value;
    display = `${choices(field.select_choices_or_calculations).get(checkbox[2]) ?? checkbox[2]}: ${state}`;
  }
  else if (field?.field_type === "yesno") display = value === "1" ? "Yes" : value === "0" ? "No" : value;
  else if (field?.field_type === "truefalse") display = value === "1" ? "True" : value === "0" ? "False" : value;
  else if (base.endsWith("_complete")) display = ({ "0": "Incomplete", "1": "Unverified", "2": "Complete" } as Record<string, string>)[value] ?? value;
  else if (field?.select_choices_or_calculations) display = choices(field.select_choices_or_calculations).get(value) ?? value;
  return { name, label: field?.field_label || base.replaceAll("_", " "), value: display };
}

function parseLogDetails(details: string, metadata: Map<string, MetadataRow>) {
  return details.split(/, (?=[a-zA-Z][a-zA-Z0-9_]*(?:\([^)]+\))? = )/).map(part => {
    const match = part.match(/^([^=]+?)\s*=\s*([\s\S]*)$/);
    if (!match) return labelField("details", part, metadata);
    const value = match[2].trim().replace(/^'([\s\S]*)'$/, "$1");
    return labelField(match[1].trim(), value, metadata);
  });
}

function fieldValue(fields: ActivityField[], names: string[]) {
  return fields.find(field => names.includes(field.name))?.value.trim() ?? "";
}

function redcapTimestamp(value: string | undefined) {
  return value ? `${value.replace(" ", "T")}:00Z` : "";
}

async function redcap(params: Record<string, string>) {
  const url = process.env.REDCAP_API_URL;
  const token = process.env.REDCAP_API_TOKEN;
  if (!url || !token) throw new Error("REDCap API configuration is missing.");
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token, ...params }), cache: "no-store" });
  const text = await response.text();
  let result: unknown = text;
  try { result = JSON.parse(text); } catch { /* REDCap can return plain text. */ }
  if (!response.ok || (result && typeof result === "object" && !Array.isArray(result) && "error" in result)) throw new Error(result && typeof result === "object" && "error" in result ? String((result as { error: unknown }).error) : text || `REDCap returned HTTP ${response.status}.`);
  return result;
}

function localFields(data: string, metadata: Map<string, MetadataRow>) {
  let rows: unknown;
  try { rows = JSON.parse(data); } catch { return []; }
  if (!Array.isArray(rows)) return [];
  return rows.flatMap(row => row && typeof row === "object" ? Object.entries(row as Record<string, unknown>) : []).filter(([name]) => name !== "uic_ori" && !name.startsWith("redcap_")).map(([name, value]) => {
    const checkbox = name.match(/^(.+)___(.+)$/);
    return labelField(checkbox ? `${checkbox[1]}(${checkbox[2]})` : name, String(value ?? ""), metadata);
  });
}

export async function loadActivities({ from, to }: { from: string; to: string }) {
  const utcMinute = (value: string) => new Date(value).toISOString().slice(0, 16).replace("T", " ");
  const begin = utcMinute(`${from}T00:00:00+04:00`);
  const end = utcMinute(`${to}T23:59:59+04:00`);
  const [rawLogs, rawMetadata, locals] = await Promise.all([
    redcap({ content: "log", format: "json", returnFormat: "json", logtype: "record", beginTime: begin, endTime: end }),
    redcap({ content: "metadata", format: "json", returnFormat: "json" }),
    db.redcapActivity.findMany({ where: { createdAt: { gte: new Date(`${from}T00:00:00+04:00`), lte: new Date(`${to}T23:59:59+04:00`) } }, orderBy: { createdAt: "desc" }, take: 1000 }),
  ]);
  const logRows = Array.isArray(rawLogs) ? rawLogs as RedcapLogRow[] : [];
  const metadataRows = Array.isArray(rawMetadata) ? rawMetadata as MetadataRow[] : [];
  const metadata = new Map(metadataRows.map(field => [field.field_name, field]));
  const apiMoments = new Set(logRows.filter(row => /\(API\)/i.test(row.action ?? "")).map(row => `${row.record ?? ""}|${redcapTimestamp(row.timestamp)}`));

  const localEntries: ActivityEntry[] = locals.map(item => {
    const fields = localFields(item.submittedData, metadata);
    let instances = "";
    try { instances = (JSON.parse(item.instrumentInstances) as { instrument: string; instance?: number }[]).map(value => `${value.instrument}${value.instance ? ` #${value.instance}` : ""}`).join(", "); } catch { /* Keep it blank. */ }
    return { id: `app:${item.id}`, source: "app" as const, timestamp: item.createdAt.toISOString(), workflow: workflows.find(value => value.prefixes.some(prefix => item.workflow.startsWith(prefix)))?.name ?? ({ outreach: "Outreach", "healthcare-nav": "Healthcare Navigator", prep: "PrEP", clinic: "Clinic", arv: "Clinic", breakfast: "Breakfast" }[item.workflow] ?? item.workflow), recordId: item.recordId, enteredBy: `${item.actorName} (@${item.actorUsername})`, staffName: item.staffName ?? "", serviceDate: item.serviceDate ?? "", action: "Submitted through app", fields, instances };
  });

  const redcapEntries: ActivityEntry[] = logRows.map((row, index) => {
    const fields = parseLogDetails(row.details ?? "", metadata);
    const names = fields.map(field => field.name.replace(/\(.+\)$/, ""));
    const hash = createHash("sha1").update(`${row.timestamp}|${row.record}|${row.action}|${row.details}|${index}`).digest("hex").slice(0, 16);
    return { id: `redcap:${hash}`, source: "redcap" as const, timestamp: redcapTimestamp(row.timestamp), workflow: workflowFor(names), recordId: row.record ?? "", enteredBy: row.username?.trim() || "REDCap", staffName: fieldValue(fields, staffFields), serviceDate: fieldValue(fields, dateFields), action: row.action ?? "Record activity", fields, instances: "" };
  }).filter(entry => {
    if (!entry.recordId || /auto calculation/i.test(entry.action)) return false;
    const names = entry.fields.map(field => field.name.replace(/\(.+\)$/, ""));
    return !(names.includes("uic_ori_valid") && names.every(name => name === "uic_ori" || name === "uic_ori_valid"));
  });

  const dedupedRedcap = redcapEntries.filter(entry => {
    const belongsToApiCluster = apiMoments.has(`${entry.recordId}|${entry.timestamp}`);
    const matchingAppSubmission = localEntries.some(local => local.recordId === entry.recordId && Math.abs(new Date(local.timestamp).getTime() - new Date(entry.timestamp).getTime()) < 90 * 1000);
    return !(belongsToApiCluster && matchingAppSubmission);
  });
  return { entries: [...localEntries, ...dedupedRedcap].sort((a, b) => b.timestamp.localeCompare(a.timestamp)), truncated: logRows.length >= 10000 };
}
