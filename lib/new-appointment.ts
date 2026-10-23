//
//  new-appointment.ts
//  pils-app
//
//  Created by Elisa Kevin Veragoo + ChatGPT on 23/10/2026.
//
import type { User } from "@prisma/client";
import { appointmentTypes, countAppointments } from "@/lib/clinic-appointments";
import { validDate } from "@/lib/redcap-validation";
import { mauritiusToday } from "@/lib/clinic-queue";
import { recordRedcapActivity } from "@/lib/redcap-activity";
import { db } from "@/lib/db";

type Row = Record<string, string>;
export class AppointmentError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
async function redcap(params: Record<string, string>, failureMessage = "Unable to save the appointment in REDCap.") {
  const url = process.env.REDCAP_API_URL, token = process.env.REDCAP_API_TOKEN;
  if (!url || !token) throw new AppointmentError("REDCap API configuration is missing.", 502);
  const response = await fetch(url, { method: "POST", cache: "no-store", signal: AbortSignal.timeout(60000), body: new URLSearchParams({ token, format: "json", returnFormat: "json", ...params }) });
  const result = await response.json();
  if (!response.ok || result?.error) throw new AppointmentError(failureMessage, 502);
  return result;
}
async function read(recordId: string): Promise<Row[]> {
  const result = await redcap({ content: "record", action: "export", type: "flat", rawOrLabel: "raw", "records[0]": recordId, "fields[0]": "uic_ori", "forms[0]": "client_enrollment", "forms[1]": "clinic_visit" });
  if (!Array.isArray(result)) throw new AppointmentError("Unable to verify the client in REDCap.", 502);
  return result.filter(row => row.uic_ori === recordId);
}
export async function getAppointmentCounts(date: string) {
  if (!validDate(date)) throw new AppointmentError("Choose a valid appointment date.");
  const fields = ["uic_ori", "cnv_no_show", ...appointmentTypes.map(type => type.field), "pv_next_doctor_date", "pv_next_blood_date", "pv_next_med_date"];
  const rows = await redcap({ content: "record", action: "export", type: "flat", rawOrLabel: "raw", ...Object.fromEntries(fields.map((field, index) => [`fields[${index}]`, field])) }, "Unable to load appointment counts.");
  if (!Array.isArray(rows)) throw new AppointmentError("Unable to load appointment counts.", 502);
  return countAppointments(rows, date);
}
const pending = new Map<string, Promise<unknown>>();
export async function createAppointment(recordId: string, type: string, date: string, user: User) {
  const option = appointmentTypes.find(option => option.value === type);
  const today = mauritiusToday();
  if (!recordId || !option || !validDate(date) || date < today) throw new AppointmentError("Select a client, appointment type, and a date from today onward.");
  const previous = pending.get(recordId) ?? Promise.resolve();
  const job = previous.catch(() => undefined).then(async () => {
    const rows = await read(recordId);
    if (!rows.length) throw new AppointmentError("The selected client was not found in REDCap.", 404);
    const existing = rows.find(row => row.redcap_repeat_instrument === "clinic_visit" && row.cnv_no_show !== "1" && row[option.field] === date);
    if (existing) return { success: true, alreadyScheduled: true, instance: Number(existing.redcap_repeat_instance) };
    const reserved = await db.clinicQueueEntry.aggregate({ where: { recordId }, _max: { noShowInstance: true } });
    const instance = Math.max(reserved._max.noShowInstance ?? 0, ...rows.filter(row => row.redcap_repeat_instrument === "clinic_visit").map(row => Number(row.redcap_repeat_instance) || 0), 0) + 1;
    const record = { uic_ori: recordId, redcap_repeat_instrument: "clinic_visit", redcap_repeat_instance: String(instance), cnv_date: today, [option.field]: date };
    await redcap({ content: "record", action: "import", type: "flat", overwriteBehavior: "normal", forceAutoNumber: "false", dateFormat: "YMD", returnContent: "count", data: JSON.stringify([record]) });
    const verified = (await read(recordId)).find(row => row.redcap_repeat_instrument === "clinic_visit" && Number(row.redcap_repeat_instance) === instance);
    if (!verified || verified.cnv_date !== today || verified[option.field] !== date) throw new AppointmentError("The appointment could not be verified. Retry to check whether it was saved.", 502);
    const activityLogged = await recordRedcapActivity({ user, workflow: "clinic", recordId, staffName: user.name, serviceDate: today, instrumentInstances: [{ instrument: "clinic_visit", instance }], submittedData: [record] });
    return { success: true, alreadyScheduled: false, instance, activityLogged };
  });
  pending.set(recordId, job);
  try { return await job; } finally { if (pending.get(recordId) === job) pending.delete(recordId); }
}
