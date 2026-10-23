import { queueVisitDetails, type VisitWorkflow } from "@/lib/visit-workflow";
import { db } from "@/lib/db";

export const QUEUE_TASKS = ["DOCTOR", "BLOOD_TEST", "MEDICATION", "PREP", "ARV", "OTHER"] as const;
export const QUEUE_STATIONS = ["RECEPTION", "FILE_RETRIEVAL", "DOCTOR", "BLOOD_TEST", "MEDICATION", "CLINICIAN"] as const;
export const QUEUE_STATUSES = ["EXPECTED", "WAITING", "READY", "DONE", "CANCELLED"] as const;
export type QueueTask = typeof QUEUE_TASKS[number];

type Actor = { id: string; name: string };
type PatientRow = Record<string, string>;

const appointmentFields: [string, QueueTask, string][] = [
  ["cnv_next_doctor_date", "DOCTOR", "Clinic doctor review"],
  ["cnv_next_lab_review_date", "DOCTOR", "Clinic laboratory results review"],
  ["cnv_next_other_date", "OTHER", "Clinic other services"],
  ["cnv_next_addicto_date", "DOCTOR", "Clinic addictologist review"],
  ["cnv_next_blood_date", "BLOOD_TEST", "Clinic blood test"],
  ["cnv_next_med_date", "MEDICATION", "Clinic medication collection"],
  ["cnv_next_med_collection", "MEDICATION", "Clinic medication collection"],
  ["cnv_next_doctor_review", "DOCTOR", "Clinic doctor review"],
  ["cnv_next_blood_test", "BLOOD_TEST", "Clinic blood test"],
  ["cnv_next_appointment_date", "OTHER", "Clinic appointment"],
  ["cnv_legacy_next_date", "OTHER", "Clinic appointment"],
  ["cnv_next_appt", "OTHER", "Clinic appointment"],
  ["pv_next_appointment_date", "PREP", "PrEP appointment"],
  ["pv_next_med_date", "MEDICATION", "PrEP medication collection"],
  ["pv_next_blood_date", "BLOOD_TEST", "PrEP blood sample collection"],
  ["pv_next_doctor_date", "DOCTOR", "PrEP doctor review"],

];

const generalClinicAppointmentFields = new Set(["cnv_next_appointment_date", "cnv_legacy_next_date", "cnv_next_appt"]);

function appointmentDate(value: string | undefined) {
  // REDCap exports dates as YMD and date-times as YMD followed by a time.
  return String(value ?? "").trim().match(/^(\d{4}-\d{2}-\d{2})(?:$|[ T]\d{2}:\d{2})/)?.[1] ?? "";
}

export function mauritiusToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Indian/Mauritius", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function parseStringArray(value: string | null | undefined) {
  try { const parsed = JSON.parse(value ?? "[]"); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []; } catch { return []; }
}

function publicEntry<T extends { tasks: string; appointmentSources: string }>(entry: T) {
  const tasks = parseStringArray(entry.tasks), appointmentSources = parseStringArray(entry.appointmentSources);
  return { ...entry, tasks, appointmentSources, ...queueVisitDetails({ ...entry, tasks, appointmentSources }), virtual: false };
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
  const fields = ["uic_ori", "ce_first_name", "ce_middle_name_1", "ce_middle_name_2", "ce_middle_name_3", "ce_last_name", "ce_alias", "ce_tel_primary", "cne_patient_code", "cnv_no_show", ...appointmentFields.map(([field]) => field)];
  const rows = await redcap(Object.fromEntries([
    ["content", "record"], ["action", "export"], ["format", "json"], ["type", "flat"], ["rawOrLabel", "raw"], ["rawOrLabelHeaders", "raw"], ["exportDataAccessGroups", "false"], ["returnFormat", "json"],
    ...fields.map((field, index) => [`fields[${index}]`, field]),
  ]));
  const patients = new Map<string, { recordId: string; displayName: string; alias: string; phone: string; patientCode: string; tasks: Set<string>; sources: Set<string> }>();
  // Join repeat follow-up rows to their enrollment identity before building the queue.
  const identities = new Map(rows.filter(row => !row.redcap_repeat_instrument && !row.redcap_repeat_instance).map(row => [String(row.uic_ori ?? "").trim(), row]));
  for (const row of rows) {
    const recordId = String(row.uic_ori ?? "").trim();
    if (!recordId) continue;
    const matchingDates = appointmentFields.filter(([field]) => !(row.cnv_no_show === "1" && field.startsWith("cnv_")) && appointmentDate(row[field]) === date);
    const hasSpecificClinicService = matchingDates.some(([field]) => field.startsWith("cnv_") && !generalClinicAppointmentFields.has(field));
    const matching = matchingDates.filter(([field]) => !generalClinicAppointmentFields.has(field) || !hasSpecificClinicService);
    if (!matching.length) continue;
    const identity = identities.get(recordId) ?? row;
    const current = patients.get(recordId) ?? {
      recordId,
      displayName: [identity.ce_first_name, identity.ce_middle_name_1, identity.ce_middle_name_2, identity.ce_middle_name_3, identity.ce_last_name].map(value => String(value ?? "").trim()).filter(Boolean).join(" ") || String(identity.ce_alias ?? "").trim() || recordId,
      alias: String(identity.ce_alias ?? "").trim(), phone: String(identity.ce_tel_primary ?? "").trim(), patientCode: String(identity.cne_patient_code ?? "").trim(), tasks: new Set<string>(), sources: new Set<string>(),
    };
    matching.forEach(([, task, source]) => { current.tasks.add(task); current.sources.add(source); });
    patients.set(recordId, current);
  }
  return [...patients.values()].map(patient => ({ id: `appointment:${date}:${patient.recordId}`, queueDate: date, ...patient, ...queueVisitDetails({tasks: [...patient.tasks], appointmentSources: [...patient.sources]}), tasks: [...patient.tasks], appointmentSources: [...patient.sources], source: "SCHEDULED", isNewClient: false, status: "EXPECTED", currentStation: "RECEPTION", notes: null, virtual: true }));
}

export async function queueForDate(date: string) {
  const [local, scheduled] = await Promise.all([db.clinicQueueEntry.findMany({ where: { queueDate: date }, orderBy: [{ status: "asc" }, { createdAt: "asc" }] }), expectedAppointments(date)]);
  const persistedRecords = new Set(local.map(entry => entry.recordId).filter(Boolean));
  return [...scheduled.filter(entry => !persistedRecords.has(entry.recordId)), ...local.map(publicEntry)];
}

export async function createQueueEntry(data: { queueDate: string; recordId?: string; displayName: string; firstName?: string; lastName?: string; nationalId?: string; alias?: string; patientCode?: string; phone?: string; visitWorkflow?: VisitWorkflow; clinicPurposes?: string[]; prepPurposes?: string[]; source?: string; isNewClient?: boolean; status?: string; currentStation?: string; tasks: string[]; appointmentSources?: string[]; notes?: string }, actor: Actor) {
  let alreadyQueued = false;
  data = { ...data, recordId: data.recordId?.trim().toUpperCase() };
  const now = new Date();
  const entry = await db.$transaction(async transaction => {
    if (data.recordId) {
      const existing = await transaction.clinicQueueEntry.findFirst({ where: { queueDate: data.queueDate, recordId: data.recordId }, orderBy: { createdAt: "asc" } });
      if (existing) {
        alreadyQueued = true;
        if (data.source !== "SCHEDULED" || data.status !== "WAITING" || existing.status !== "EXPECTED") return existing;
        if (existing.noShow) throw new Error("Return the no-show to Expected before checking in the client.");
        const latestNumber = existing.queueNumber === null ? await transaction.clinicQueueEntry.aggregate({ where: { queueDate: data.queueDate }, _max: { queueNumber: true } }) : null;
        return transaction.clinicQueueEntry.update({ where: { id: existing.id }, data: { status: "WAITING", currentStation: data.currentStation ?? "FILE_RETRIEVAL", queueNumber: existing.queueNumber ?? (latestNumber?._max.queueNumber ?? 0) + 1, checkedInAt: now, updatedById: actor.id, updatedByName: actor.name, version: { increment: 1 }, events: { create: { actorId: actor.id, actorName: actor.name, action: "ARRIVED" } } } });
      }
    }
    const latest = data.status === "WAITING" ? await transaction.clinicQueueEntry.aggregate({ where: { queueDate: data.queueDate }, _max: { queueNumber: true } }) : null;
    return transaction.clinicQueueEntry.create({ data: { queueDate: data.queueDate, recordId: data.recordId || null, displayName: data.displayName, firstName: data.firstName || null, lastName: data.lastName || null, nationalId: data.nationalId || null, visitWorkflow: data.visitWorkflow || null, clinicPurposes: JSON.stringify(data.clinicPurposes ?? []), prepPurposes: JSON.stringify(data.prepPurposes ?? []), alias: data.alias || null, patientCode: data.patientCode || null, phone: data.phone || null, source: data.source ?? "WALK_IN", isNewClient: Boolean(data.isNewClient), status: data.status ?? "EXPECTED", currentStation: data.currentStation ?? "RECEPTION", queueNumber: data.status === "WAITING" ? (latest?._max.queueNumber ?? 0) + 1 : null, checkedInAt: data.status === "WAITING" ? now : null, tasks: JSON.stringify(data.tasks), appointmentSources: JSON.stringify(data.appointmentSources ?? []), notes: data.notes || null, createdById: actor.id, createdByName: actor.name, updatedById: actor.id, updatedByName: actor.name, events: { create: { actorId: actor.id, actorName: actor.name, action: data.status === "WAITING" ? "WALK_IN_CHECKED_IN" : "ADDED" } } } });
  }).catch(async error => {
    // Another request may have committed the same client while this one waited.
    if (data.recordId && error && typeof error === "object" && "code" in error && ["P2002", "P2034", "P1008"].includes(String(error.code))) {
      const existing = await db.clinicQueueEntry.findFirst({ where: { queueDate: data.queueDate, recordId: data.recordId } });
      if (existing) { alreadyQueued = true; return existing; }
    }
    throw error;
  });
  return { ...publicEntry(entry), alreadyQueued };
}

export async function updateQueueEntry(id: string, patch: { status?: string; currentStation?: string; tasks?: string[]; notes?: string; recordId?: string; patientCode?: string; noShow?: boolean }, actor: Actor) {
  const now = new Date();
  const entry = await db.$transaction(async transaction => {
    const current = await transaction.clinicQueueEntry.findUniqueOrThrow({ where: { id } });
    if (current.noShow && patch.noShow === undefined && (patch.status && patch.status !== "DONE" || patch.currentStation && patch.currentStation !== current.currentStation)) throw new Error("Return the no-show to Expected before moving it.");
    const enteringWaiting = patch.status === "WAITING" && current.status !== "WAITING";
    const latest = enteringWaiting && current.queueNumber === null ? await transaction.clinicQueueEntry.aggregate({ where: { queueDate: current.queueDate }, _max: { queueNumber: true } }) : null;
    return transaction.clinicQueueEntry.update({ where: { id }, data: { ...(patch.status ? { status: patch.status, ...(enteringWaiting ? { checkedInAt: now, queueNumber: current.queueNumber ?? (latest?._max.queueNumber ?? 0) + 1 } : {}), ...(patch.status === "READY" ? { readyAt: now } : {}), ...(patch.status === "DONE" ? { completedAt: now } : {}) } : {}), ...(patch.status === "EXPECTED" ? { completedAt: null, readyAt: null, checkedInAt: null, queueNumber: null } : {}), ...(patch.noShow !== undefined ? { noShow: patch.noShow } : {}), ...(patch.currentStation ? { currentStation: patch.currentStation } : {}), ...(patch.tasks ? { tasks: JSON.stringify(patch.tasks) } : {}), ...(patch.notes !== undefined ? { notes: patch.notes || null } : {}), ...(patch.recordId ? { recordId: patch.recordId } : {}), ...(patch.patientCode !== undefined ? { patientCode: patch.patientCode } : {}), updatedById: actor.id, updatedByName: actor.name, version: { increment: 1 }, events: { create: { actorId: actor.id, actorName: actor.name, action: patch.status ?? patch.currentStation ?? "UPDATED", details: JSON.stringify(patch) } } } });
  });
  return publicEntry(entry);
}

export async function completeQueueEntry(id: string | undefined, recordId: string, actor: Actor) {
  if (!id) return false;
  try { const entry = await db.clinicQueueEntry.findUnique({ where: { id } }); if (!entry || (entry.recordId && entry.recordId !== recordId)) return false; await updateQueueEntry(id, { status: "DONE", currentStation: "CLINICIAN", recordId }, actor); return true; } catch (error) { console.error("Unable to complete clinic queue entry:", error); return false; }
}
