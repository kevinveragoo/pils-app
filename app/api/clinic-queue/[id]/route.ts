import { setQueueNoShow, QueueNoShowError } from "@/lib/queue-no-show";
import { db } from "@/lib/db";
import { saveQueuePatientCode, PatientCodeError } from "@/lib/queue-patient-code";
import { NextResponse } from "next/server";
import { getCurrentUser, hasAnyRole } from "@/lib/auth";
import { QUEUE_STATUSES, QUEUE_STATIONS, QUEUE_TASKS, updateQueueEntry } from "@/lib/clinic-queue";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!hasAnyRole(user, ["FACILITY_STAFF", "HEALTHCARE_ASSISTANT", "ADMIN"])) return NextResponse.json({ error: "Facility Staff or Healthcare Assistant access is required." }, { status: 403 });
  try {
    const { id } = await params;
    const body = await request.json() as Record<string, unknown>;
    const status = typeof body.status === "string" && (QUEUE_STATUSES as readonly string[]).includes(body.status) ? body.status : undefined;
    const currentStation = typeof body.currentStation === "string" && (QUEUE_STATIONS as readonly string[]).includes(body.currentStation) ? body.currentStation : undefined;
    const tasks = Array.isArray(body.tasks) ? body.tasks.filter((task): task is string => typeof task === "string" && (QUEUE_TASKS as readonly string[]).includes(task)) : undefined;
    const entry = await db.clinicQueueEntry.findUnique({ where: { id } });
    if (!entry) return NextResponse.json({ error: "Queue entry no longer exists." }, { status: 404 });
    if (body.noShow !== undefined && body.noShow !== true) return NextResponse.json({ error: "Return the entry to Expected to remove a no-show." }, { status: 400 });
    if (body.noShow === true) return NextResponse.json(await setQueueNoShow(id, true, user));
    if (status === "EXPECTED" && (entry.noShow || entry.noShowInstance) && ["DONE", "EXPECTED"].includes(entry.status)) return NextResponse.json(await setQueueNoShow(id, false, user));
    if (entry.noShow && (status && status !== "DONE" || currentStation && currentStation !== entry.currentStation)) return NextResponse.json({ error: "Return the no-show to Expected before moving it." }, { status: 409 });
    let patientCode: string | undefined;
    if (entry.currentStation === "FILE_RETRIEVAL" && currentStation && ["DOCTOR", "BLOOD_TEST", "MEDICATION", "CLINICIAN"].includes(currentStation) && status !== "EXPECTED") {
      const submitted = typeof body.patientCode === "string" ? body.patientCode.trim() : undefined;
      if (entry.recordId) patientCode = await saveQueuePatientCode(entry.recordId, submitted);
      else {
        patientCode = submitted || entry.patientCode?.trim() || "";
        if (!patientCode) return NextResponse.json({ error: "Enter a patient code before leaving file retrieval." }, { status: 400 });
        if (patientCode.length > 100) return NextResponse.json({ error: "Patient code is too long." }, { status: 400 });
      }
    }
    return NextResponse.json(await updateQueueEntry(id, { status, currentStation, tasks, patientCode, notes: typeof body.notes === "string" ? body.notes : undefined }, user));
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update the queue entry." }, { status: (error instanceof PatientCodeError || error instanceof QueueNoShowError) ? error.status : 400 }); }
}
