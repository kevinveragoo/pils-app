import { db } from "@/lib/db";

export const QUEUE_TASKS = ["DOCTOR", "BLOOD_TEST", "MEDICATION", "PREP", "ARV", "OTHER"] as const;
export const QUEUE_STATIONS = ["RECEPTION", "FILE_RETRIEVAL", "DOCTOR", "BLOOD_TEST", "MEDICATION", "CLINICIAN"] as const;
export const QUEUE_STATUSES = ["EXPECTED", "WAITING", "READY", "DONE", "CANCELLED"] as const;
export type QueueTask = typeof QUEUE_TASKS[number];

type Actor = { id: string; name: string };
type PatientRow = Record<string, string>;

const appointmentFields: [string, QueueTask, string][] = [
  ["cnv_next_doctor_review", "DOCTOR", "Clinic doctor review"],
  ["cnv_next_blood_test", "BLOOD_TEST", "Clinic blood test"],
  ["cnv_next_med_collection", "MEDICATION", "Clinic medication collection"],
  ["pv_next_appointment_date", "PREP", "PrEP appointment"],
  ["pv_next_collection_date", "MEDICATION", "PrEP medication collection"],
];

export function mauritiusToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Indian/Mauritius", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function parseStringArray(value: string | null | undefined) {
  try { const parsed = JSON.parse(value ?? "[]"); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []; } catch { return []; }
}

function publicEntry<T extends { tasks: string; appointmentSources: string }>(entry: T) {
  return { ...entry, tasks: parseStringArray(entry.tasks), appointmentSources: parseStringArray(entry.appointmentSources), virtual: false };
}

async function redcap(params: Record<string, string>) {
  const url = process.env.REDCAP_API_URL;
  const token = process.env.REDCAP_API_TOKEN;
  if (!url || !token) throw new Error("REDCap API configuration is missing.");
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token, ...params }), cache: "no-store" });
  const text = await response.text();
  if (!response.ok) throw new Error(text || `REDCap returned HTTP ${response.status}.`);
  const result = JSON.parse(text) as unknown;
  if (result && typeof result === "object" && !Array.isArray(result) && "error" in result) throw new Error(String((result as { error: unknown }).error));
  return Array.isArray(result) ? result as PatientRow[] : [];
}

export async function expectedAppointments(date: string) {
  const fields = ["uic_ori", "ce_first_name", "ce_middle_name_1", "ce_middle_name_2", "ce_middle_name_3", "ce_last_name", "ce_alias", "ce_tel_primary", "ce_patient_code", ...appointmentFields.map(([field]) => field)];
  const rows = await redcap(Object.fromEntries([
    ["content", "record"], ["action", "export"], ["format", "json"], ["type", "flat"], ["rawOrLabel", "raw"], ["rawOrLabelHeaders", "raw"], ["exportDataAccessGroups", "false"], ["returnFormat", "json"],
    ...fields.map((field, index) => [`fields[${index}]`, field]),
  ]));
  const patients = new Map<string, { recordId: string; displayName: string; alias: string; phone: string; patientCode: string; tasks: Set<string>; sources: Set<string> }>();
  for (const row of rows) {
    const recordId = String(row.uic_ori ?? "").trim();
    if (!recordId) continue;
    const matching = appointmentFields.filter(([field]) => String(row[field] ?? "").trim() === date);
    if (!matching.length) continue;
    const current = patients.get(recordId) ?? {
      recordId,
      displayName: [row.ce_first_name, row.ce_middle_name_1, row.ce_middle_name_2, row.ce_middle_name_3, row.ce_last_name].map(value => String(value ?? "").trim()).filter(Boolean).join(" ") || String(row.ce_alias ?? "").trim() || recordId,
      alias: String(row.ce_alias ?? "").trim(), phone: String(row.ce_tel_primary ?? "").trim(), patientCode: String(row.ce_patient_code ?? "").trim(), tasks: new Set<string>(), sources: new Set<string>(),
    };
    matching.forEach(([, task, source]) => { current.tasks.add(task); current.sources.add(source); });
    patients.set(recordId, current);
  }
  return [...patients.values()].map(patient => ({ id: `appointment:${date}:${patient.recordId}`, queueDate: date, ...patient, tasks: [...patient.tasks], appointmentSources: [...patient.sources], source: "SCHEDULED", isNewClient: false, status: "EXPECTED", currentStation: "RECEPTION", notes: null, virtual: true }));
}

export async function queueForDate(date: string) {
  const [local, scheduled] = await Promise.all([db.clinicQueueEntry.findMany({ where: { queueDate: date }, orderBy: [{ status: "asc" }, { createdAt: "asc" }] }), expectedAppointments(date)]);
  const persistedRecords = new Set(local.map(entry => entry.recordId).filter(Boolean));
  return [...scheduled.filter(entry => !persistedRecords.has(entry.recordId)), ...local.map(publicEntry)];
}

export async function createQueueEntry(data: { queueDate: string; recordId?: string; displayName: string; alias?: string; patientCode?: string; phone?: string; source?: string; isNewClient?: boolean; status?: string; currentStation?: string; tasks: string[]; appointmentSources?: string[]; notes?: string }, actor: Actor) {
  const now = new Date();
  const entry = await db.$transaction(async transaction => {
    const latest = data.status === "WAITING" ? await transaction.clinicQueueEntry.aggregate({ where: { queueDate: data.queueDate }, _max: { queueNumber: true } }) : null;
    return transaction.clinicQueueEntry.create({ data: { queueDate: data.queueDate, recordId: data.recordId || null, displayName: data.displayName, alias: data.alias || null, patientCode: data.patientCode || null, phone: data.phone || null, source: data.source ?? "WALK_IN", isNewClient: Boolean(data.isNewClient), status: data.status ?? "EXPECTED", currentStation: data.currentStation ?? "RECEPTION", queueNumber: data.status === "WAITING" ? (latest?._max.queueNumber ?? 0) + 1 : null, checkedInAt: data.status === "WAITING" ? now : null, tasks: JSON.stringify(data.tasks), appointmentSources: JSON.stringify(data.appointmentSources ?? []), notes: data.notes || null, createdById: actor.id, createdByName: actor.name, updatedById: actor.id, updatedByName: actor.name, events: { create: { actorId: actor.id, actorName: actor.name, action: data.status === "WAITING" ? "WALK_IN_CHECKED_IN" : "ADDED" } } } });
  });
  return publicEntry(entry);
}

export async function updateQueueEntry(id: string, patch: { status?: string; currentStation?: string; tasks?: string[]; notes?: string; recordId?: string }, actor: Actor) {
  const now = new Date();
  const entry = await db.$transaction(async transaction => {
    const current = await transaction.clinicQueueEntry.findUniqueOrThrow({ where: { id } });
    const enteringWaiting = patch.status === "WAITING" && current.status !== "WAITING";
    const latest = enteringWaiting && current.queueNumber === null ? await transaction.clinicQueueEntry.aggregate({ where: { queueDate: current.queueDate }, _max: { queueNumber: true } }) : null;
    return transaction.clinicQueueEntry.update({ where: { id }, data: { ...(patch.status ? { status: patch.status, ...(enteringWaiting ? { checkedInAt: now, queueNumber: current.queueNumber ?? (latest?._max.queueNumber ?? 0) + 1 } : {}), ...(patch.status === "READY" ? { readyAt: now } : {}), ...(patch.status === "DONE" ? { completedAt: now } : {}) } : {}), ...(patch.currentStation ? { currentStation: patch.currentStation } : {}), ...(patch.tasks ? { tasks: JSON.stringify(patch.tasks) } : {}), ...(patch.notes !== undefined ? { notes: patch.notes || null } : {}), ...(patch.recordId ? { recordId: patch.recordId } : {}), updatedById: actor.id, updatedByName: actor.name, version: { increment: 1 }, events: { create: { actorId: actor.id, actorName: actor.name, action: patch.status ?? patch.currentStation ?? "UPDATED", details: JSON.stringify(patch) } } } });
  });
  return publicEntry(entry);
}

export async function completeQueueEntry(id: string | undefined, recordId: string, actor: Actor) {
  if (!id) return false;
  try { await updateQueueEntry(id, { status: "DONE", currentStation: "CLINICIAN", recordId }, actor); return true; } catch (error) { console.error("Unable to complete clinic queue entry:", error); return false; }
}
