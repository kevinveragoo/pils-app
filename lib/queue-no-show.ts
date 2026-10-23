//
//  queue-no-show.ts
//  pils-app
//
//  Created by Elisa Kevin Veragoo + ChatGPT on 23/10/2026.
//
import type { User } from "@prisma/client";
import { db } from "@/lib/db";
import { updateQueueEntry } from "@/lib/clinic-queue";
import { recordRedcapActivity } from "@/lib/redcap-activity";
import definitions from "@/lib/instrument-forms.json";

type Row = Record<string, string>;
export class QueueNoShowError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}
async function redcap(params: Record<string, string>) {
  const url = process.env.REDCAP_API_URL, token = process.env.REDCAP_API_TOKEN;
  if (!url || !token) throw new QueueNoShowError("REDCap API configuration is missing.", 502);
  const response = await fetch(url, { method: "POST", cache: "no-store", signal: AbortSignal.timeout(30000), body: new URLSearchParams({ token, format: "json", returnFormat: "json", ...params }) });
  const result = await response.json();
  if (!response.ok || result?.error) throw new QueueNoShowError("Unable to update the no-show in REDCap. The queue has not been moved.", 502);
  return result;
}
async function readVisits(recordId: string): Promise<Row[]> {
  const rows = await redcap({ content: "record", action: "export", type: "flat", rawOrLabel: "raw", "records[0]": recordId, "forms[0]": "clinic_visit", "fields[0]": "uic_ori" });
  if (!Array.isArray(rows)) throw new QueueNoShowError("Unable to verify the client in REDCap.", 502);
  return rows;
}

// Serialise double clicks and undo requests for the same entry in this server.
const pending = new Map<string, Promise<unknown>>();
export async function setQueueNoShow(id: string, noShow: boolean, user: User) {
  const previous = pending.get(id) ?? Promise.resolve();
  const job = previous.catch(() => undefined).then(() => changeNoShow(id, noShow, user));
  pending.set(id, job);
  try { return await job; } finally { if (pending.get(id) === job) pending.delete(id); }
}

async function changeNoShow(id: string, noShow: boolean, user: User) {
  let entry = await db.clinicQueueEntry.findUniqueOrThrow({ where: { id } });
  if (!entry.recordId) throw new QueueNoShowError("Select an enrolled client before recording a no-show.");
  if (noShow && entry.status !== "EXPECTED" && !(entry.status === "DONE" && entry.noShow)) throw new QueueNoShowError("Only expected clients can be marked as a no-show.");
  if (!noShow && !["EXPECTED", "DONE"].includes(entry.status)) throw new QueueNoShowError("Return the completed no-show to Expected first.");
  const rows = await readVisits(entry.recordId);
  if (!rows.some(row => row.uic_ori === entry.recordId)) throw new QueueNoShowError("The client no longer exists in REDCap.");
  if (!entry.noShowInstance && noShow) {
    const remoteMax = Math.max(0, ...rows.filter(row => row.redcap_repeat_instrument === "clinic_visit").map(row => Number(row.redcap_repeat_instance) || 0));
    // Persist the reservation before the remote write: a failed response or local
    // update can then be retried using the same instance, without duplicate CNVs.
    entry = await db.$transaction(async tx => {
      const current = await tx.clinicQueueEntry.findUniqueOrThrow({ where: { id } });
      if (current.noShowInstance) return current;
      if (current.status !== "EXPECTED" || current.recordId !== entry.recordId) throw new QueueNoShowError("The queue entry changed. Reload before continuing.");
      const reserved = await tx.clinicQueueEntry.aggregate({ where: { recordId: current.recordId }, _max: { noShowInstance: true } });
      return tx.clinicQueueEntry.update({ where: { id }, data: { noShowInstance: Math.max(remoteMax, reserved._max.noShowInstance ?? 0) + 1 } });
    });
  }
  if (!entry.noShowInstance) throw new QueueNoShowError("This entry has no linked no-show to remove.");
  const instance = entry.noShowInstance;
  const latestRows = await readVisits(entry.recordId!);
  const existing = latestRows.find(row => row.redcap_repeat_instrument === "clinic_visit" && Number(row.redcap_repeat_instance) === instance);
  if (existing) {
    const writable = new Set(["cnv_date", "cnv_worker_1", "cnv_no_show"]);
    const clinical = definitions.clinic_visit.filter(f => !writable.has(f.name) && !["descriptive", "calc", "file"].includes(f.kind) && !/@CALC/.test(f.annotation));
    if (clinical.some(f => f.kind === "checkbox" ? Object.entries(existing).some(([key, value]) => key.startsWith(`${f.name}___`) && value === "1") : Boolean(existing[f.name]?.trim())) ||
      (existing.cnv_date && existing.cnv_date !== entry.queueDate) ||
      (existing.cnv_no_show && existing.cnv_no_show !== "1")) {
      throw new QueueNoShowError("The linked visit contains other clinical data. Review it in REDCap before changing this no-show.");
    }
  }
  if (noShow && !entry.noShow) {
    entry = await db.$transaction(async tx => {
      const current = await tx.clinicQueueEntry.findUniqueOrThrow({ where: { id } });
      if (current.status !== "EXPECTED" || current.recordId !== entry.recordId) throw new QueueNoShowError("The queue entry changed. Reload before continuing.");
      return tx.clinicQueueEntry.update({ where: { id }, data: { noShow: true } });
    });
  }
  const record: Row = { uic_ori: entry.recordId!, redcap_repeat_instrument: "clinic_visit", redcap_repeat_instance: String(instance), cnv_date: noShow ? entry.queueDate : "", cnv_worker_1: noShow ? user.name : "", cnv_no_show: noShow ? "1" : "" };
  await redcap({ content: "record", action: "import", type: "flat", overwriteBehavior: "overwrite", forceAutoNumber: "false", dateFormat: "YMD", returnContent: "count", data: JSON.stringify([record]) });
  const verified = (await readVisits(entry.recordId!)).find(row => row.redcap_repeat_instrument === "clinic_visit" && Number(row.redcap_repeat_instance) === instance);
  if (noShow ? !verified || ["cnv_date", "cnv_worker_1", "cnv_no_show"].some(key => verified[key] !== record[key]) : verified && ["cnv_date", "cnv_worker_1", "cnv_no_show"].some(key => Boolean(verified[key]))) throw new QueueNoShowError("The no-show could not be verified in REDCap. Retry before moving the queue entry.", 502);
  await recordRedcapActivity({ user, workflow: "clinic", recordId: entry.recordId!, staffName: user.name, serviceDate: entry.queueDate, instrumentInstances: [{ instrument: "clinic_visit", instance }], submittedData: [record] });
  return updateQueueEntry(id, { status: noShow ? "DONE" : "EXPECTED", currentStation: "RECEPTION", noShow }, user);
}
