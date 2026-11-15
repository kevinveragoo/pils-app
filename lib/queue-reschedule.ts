import type { User } from "@prisma/client";
import { db } from "@/lib/db";
import { createQueueEntry, mauritiusToday, parseStringArray } from "@/lib/clinic-queue";
import { setQueueNoShow, QueueNoShowError } from "@/lib/queue-no-show";
import { validDate } from "@/lib/redcap-validation";
import { queueVisitDetails, includesClinic, includesPrep, purposeTasks } from "@/lib/visit-workflow";
import { recordRedcapActivity } from "@/lib/redcap-activity";

type Row = Record<string, string>;
type Plan = { date: string; records: Row[] };
const pending = new Map<string, Promise<unknown>>();
async function redcap(params: Record<string, string>) {
  const url = process.env.REDCAP_API_URL, token = process.env.REDCAP_API_TOKEN;
  if (!url || !token) throw new QueueNoShowError("REDCap API configuration is missing.", 502);
  const response = await fetch(url, { method: "POST", cache: "no-store", signal: AbortSignal.timeout(60000), body: new URLSearchParams({ token, format: "json", returnFormat: "json", ...params }) });
  const result = await response.json();
  if (!response.ok || result?.error) throw new QueueNoShowError("Unable to save the rescheduled appointment. Retry with the same date.", 502);
  return result;
}
async function read(recordId: string): Promise<Row[]> {
  const rows = await redcap({ content: "record", action: "export", type: "flat", rawOrLabel: "raw", "records[0]": recordId, "fields[0]": "uic_ori", "forms[0]": "clinic_visit", "forms[1]": "prep_visit" });
  if (!Array.isArray(rows)) throw new QueueNoShowError("Unable to verify appointments in REDCap.", 502);
  return rows.filter(row => row.uic_ori === recordId);
}

export function rescheduleFields(entry: { visitWorkflow?: string | null; clinicPurposes?: unknown; prepPurposes?: unknown; tasks: string[]; appointmentSources: string[] }, date: string) {
  const details = queueVisitDetails(entry);
  const clinic = new Set<string>(), prep = new Set<string>();
  const sourceFields: Record<string, string> = { "Clinic doctor review": "cnv_next_doctor_date", "Clinic laboratory results review": "cnv_next_lab_review_date", "Clinic addictologist review": "cnv_next_addicto_date", "Clinic other services": "cnv_next_other_date", "Clinic blood test": "cnv_next_blood_date", "Clinic medication collection": "cnv_next_med_date" };
  if (includesClinic(details.visitWorkflow)) {
    for (const source of entry.appointmentSources) if (sourceFields[source]) clinic.add(sourceFields[source]);
    for (const code of details.clinicPurposes) clinic.add(code === "11" ? "cnv_next_blood_date" : ["9", "10"].includes(code) ? "cnv_next_med_date" : code === "15" ? "cnv_next_addicto_date" : code === "3" ? "cnv_next_lab_review_date" : ["99", "13", "16"].includes(code) ? "cnv_next_other_date" : "cnv_next_doctor_date");
    if (!clinic.size) for (const task of entry.tasks) clinic.add(task === "BLOOD_TEST" ? "cnv_next_blood_date" : task === "MEDICATION" ? "cnv_next_med_date" : ["DOCTOR", "ARV"].includes(task) ? "cnv_next_doctor_date" : "cnv_next_other_date");
  }
  if (includesPrep(details.visitWorkflow)) {
    for (const code of details.prepPurposes) prep.add(code === "1" ? "pv_next_blood_date" : code === "3" ? "pv_next_med_date" : "pv_next_doctor_date");
    if (!prep.size) prep.add("pv_next_appointment_date");
  }
  return { clinic_visit: Object.fromEntries([...clinic].map(field => [field, date])), prep_visit: Object.fromEntries([...prep].map(field => [field, date])) };
}

export async function rescheduleQueueEntry(id: string, date: string, user: User) {
  const previous = pending.get(id) ?? Promise.resolve();
  const job = previous.catch(() => undefined).then(() => reschedule(id, date, user));
  pending.set(id, job);
  try { return await job; } finally { if (pending.get(id) === job) pending.delete(id); }
}
async function reschedule(id: string, date: string, user: User) {
  const entry = await db.clinicQueueEntry.findUniqueOrThrow({ where: { id } });
  if (!validDate(date) || date < mauritiusToday() || date <= entry.queueDate) throw new QueueNoShowError("Choose a valid date after the original appointment, from today onward.", 400);
  if (!entry.recordId || entry.visitWorkflow === "SCREENING") throw new QueueNoShowError("Only enrolled Clinic or PrEP appointments can be rescheduled.");
  if (entry.status !== "EXPECTED" && !(entry.status === "DONE" && entry.noShow)) throw new QueueNoShowError("Only expected appointments can be rescheduled.");
  const events = await db.clinicQueueEvent.findMany({ where: { queueEntryId: id, action: "RESCHEDULE_PLANNED" }, orderBy: { createdAt: "asc" } });
  let plan: Plan | undefined = events[0]?.details ? JSON.parse(events[0].details) : undefined;
  if (plan && plan.date !== date) throw new QueueNoShowError("This appointment already has a reschedule in progress. Retry with its original new date.");
  const tasks = parseStringArray(entry.tasks), sources = parseStringArray(entry.appointmentSources);
  const details = queueVisitDetails({ ...entry, tasks, appointmentSources: sources });
  const fields = rescheduleFields({ ...entry, tasks, appointmentSources: sources }, date);
  if (!Object.keys(fields.clinic_visit).length && !Object.keys(fields.prep_visit).length) throw new QueueNoShowError("No appointment services could be identified.");
  // Check the destination before marking the original as missed.
  const target = await db.clinicQueueEntry.findUnique({ where: { recordId_queueDate: { recordId: entry.recordId, queueDate: date } } });
  if (target && !plan) throw new QueueNoShowError("This client already has a queue entry on that date. Choose another date.");
  // Existing no-show logic reserves and verifies its own REDCap instance.
  const original = await setQueueNoShow(id, true, user);
  const rows = await read(entry.recordId);
  if (!plan) {
    plan = await db.$transaction(async tx => {
      const reservations = await tx.clinicQueueEvent.findMany({ where: { action: "RESCHEDULE_PLANNED", entry: { recordId: entry.recordId } } });
      const existing = reservations.find(event => event.queueEntryId === id);
      if (existing?.details) {
        const saved: Plan = JSON.parse(existing.details);
        if (saved.date !== date) throw new QueueNoShowError("This appointment already has a reschedule in progress. Retry with its original new date.");
        return saved;
      }
      const reservedRows: Row[] = reservations.flatMap(event => event.details ? (JSON.parse(event.details) as Plan).records : []);
      const reservedNoShow = await tx.clinicQueueEntry.aggregate({ where: { recordId: entry.recordId }, _max: { noShowInstance: true } });
      const records = Object.entries(fields).filter(([, values]) => Object.keys(values).length).map(([form, values]) => ({ uic_ori: entry.recordId!, redcap_repeat_instrument: form, redcap_repeat_instance: String(Math.max(form === "clinic_visit" ? reservedNoShow._max.noShowInstance ?? 0 : 0, ...[...rows, ...reservedRows].filter(row => row.redcap_repeat_instrument === form).map(row => Number(row.redcap_repeat_instance) || 0), 0) + 1), ...values }));
      const saved: Plan = { date, records };
      await tx.clinicQueueEvent.create({ data: { queueEntryId: id, actorId: user.id, actorName: user.name, action: "RESCHEDULE_PLANNED", details: JSON.stringify(saved) } });
      return saved;
    });
  }
  // A durable plan makes retries reuse the same repeat instances after a lost response.
  for (const record of plan.records) {
    const current = rows.find(row => row.redcap_repeat_instrument === record.redcap_repeat_instrument && String(row.redcap_repeat_instance) === record.redcap_repeat_instance);
    if (current && Object.entries(record).some(([field, value]) => field !== "redcap_repeat_instance" && current[field] !== value)) throw new QueueNoShowError("The reserved appointment has changed in REDCap. Review it before retrying.");
  }
  await redcap({ content: "record", action: "import", type: "flat", overwriteBehavior: "normal", forceAutoNumber: "false", dateFormat: "YMD", returnContent: "count", data: JSON.stringify(plan.records) });
  const verified = await read(entry.recordId);
  for (const record of plan.records) {
    const current = verified.find(row => row.redcap_repeat_instrument === record.redcap_repeat_instrument && String(row.redcap_repeat_instance) === record.redcap_repeat_instance);
    if (!current || Object.entries(record).some(([field, value]) => String(current[field]) !== value)) throw new QueueNoShowError("The new appointment could not be verified. Retry with the same date.", 502);
  }
  const copy = await createQueueEntry({ queueDate: date, recordId: entry.recordId, displayName: entry.displayName, alias: entry.alias ?? undefined, patientCode: entry.patientCode ?? undefined, phone: entry.phone ?? undefined, ...details, tasks: tasks.length ? tasks : purposeTasks(details.clinicPurposes, details.prepPurposes), appointmentSources: sources, notes: entry.notes ?? undefined, source: "SCHEDULED", status: "EXPECTED", currentStation: "RECEPTION" }, user);
  await recordRedcapActivity({ user, workflow: "clinic", recordId: entry.recordId, staffName: user.name, serviceDate: date, instrumentInstances: plan.records.map(row => ({ instrument: row.redcap_repeat_instrument, instance: Number(row.redcap_repeat_instance) })), submittedData: plan.records });
  return { ...original, rescheduledDate: date, rescheduledEntryId: copy.id };
}
