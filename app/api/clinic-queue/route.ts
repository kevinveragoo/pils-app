//
//  route.ts
//  pils-app
//
//  Created by Elisa Kevin Veragoo + ChatGPT on 23/10/2026.
//
import { validWorkflow, includesClinic, includesPrep, purposeCodes, purposeTasks, clinicVisitPurposes, prepVisitPurposes } from "@/lib/visit-workflow";
import { NextResponse } from "next/server";
import { getCurrentUser, hasAnyRole } from "@/lib/auth";
import { createQueueEntry, mauritiusToday, queueForDate, QUEUE_STATIONS, QUEUE_TASKS } from "@/lib/clinic-queue";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!hasAnyRole(user, ["FACILITY_STAFF", "HEALTHCARE_ASSISTANT", "ADMIN"])) return NextResponse.json({ error: "Facility Staff or Healthcare Assistant access is required." }, { status: 403 });
  const date = new URL(request.url).searchParams.get("date") || mauritiusToday();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Invalid queue date." }, { status: 400 });
  try { return NextResponse.json(await queueForDate(date)); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load the clinic queue." }, { status: 502 }); }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!hasAnyRole(user, ["FACILITY_STAFF", "HEALTHCARE_ASSISTANT", "ADMIN"])) return NextResponse.json({ error: "Facility Staff or Healthcare Assistant access is required." }, { status: 403 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const recordId = typeof body.recordId === "string" ? body.recordId.trim().toUpperCase() : "";
    if (body.isNewClient === true || !recordId) return NextResponse.json({ error: "Enroll the client first, then select an existing client." }, { status: 400 });
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
    const queueDate = typeof body.queueDate === "string" ? body.queueDate : mauritiusToday();
    const tasks = Array.isArray(body.tasks) ? body.tasks.filter((task): task is string => typeof task === "string" && (QUEUE_TASKS as readonly string[]).includes(task)) : [];
    if (!displayName || (!tasks.length && !validWorkflow(body.visitWorkflow)) || !/^\d{4}-\d{2}-\d{2}$/.test(queueDate)) return NextResponse.json({ error: "Name, date, and at least one service are required." }, { status: 400 });
    const visitWorkflow = validWorkflow(body.visitWorkflow) ? body.visitWorkflow : undefined;
    const clinicPurposes = purposeCodes(body.clinicPurposes), prepPurposes = purposeCodes(body.prepPurposes);
    if (body.source !== "SCHEDULED" && !visitWorkflow) return NextResponse.json({ error: "Choose a visit workflow." }, { status: 400 });
    if (visitWorkflow && ((body.source !== "SCHEDULED" && includesClinic(visitWorkflow) && !clinicPurposes.length) || (body.source !== "SCHEDULED" && includesPrep(visitWorkflow) && !prepPurposes.length) || (!includesClinic(visitWorkflow) && clinicPurposes.length) || (!includesPrep(visitWorkflow) && prepPurposes.length) || clinicPurposes.some(code => !clinicVisitPurposes.some(([value]) => value === code)) || prepPurposes.some(code => !prepVisitPurposes.some(([value]) => value === code)))) return NextResponse.json({ error: "Choose valid purposes for each selected visit workflow." }, { status: 400 });
    const waitingStation = typeof body.currentStation === "string" && ["BLOOD_TEST", "DOCTOR", "MEDICATION"].includes(body.currentStation) && (QUEUE_STATIONS as readonly string[]).includes(body.currentStation) ? body.currentStation : undefined;
    const scheduledArrival = body.source === "SCHEDULED" && body.status === "WAITING" && body.currentStation === "FILE_RETRIEVAL";
    const entry = await createQueueEntry({ queueDate, recordId, displayName, alias: typeof body.alias === "string" ? body.alias : undefined, patientCode: typeof body.patientCode === "string" ? body.patientCode : undefined, phone: typeof body.phone === "string" ? body.phone : undefined, source: body.source === "SCHEDULED" ? "SCHEDULED" : "WALK_IN", appointmentSources: Array.isArray(body.appointmentSources) ? body.appointmentSources.filter((item): item is string => typeof item === "string") : [], isNewClient: false, status: scheduledArrival || waitingStation ? "WAITING" : "EXPECTED", currentStation: scheduledArrival ? "FILE_RETRIEVAL" : waitingStation, visitWorkflow, clinicPurposes, prepPurposes, tasks: visitWorkflow && body.source !== "SCHEDULED" ? purposeTasks(clinicPurposes, prepPurposes) : tasks, notes: typeof body.notes === "string" ? body.notes : undefined }, user);
    return NextResponse.json(entry, { status: entry.alreadyQueued ? 200 : 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to add the queue entry." }, { status: 500 }); }
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!hasAnyRole(user, ["FACILITY_STAFF", "HEALTHCARE_ASSISTANT", "ADMIN"])) return NextResponse.json({ error: "Facility Staff or Healthcare Assistant access is required." }, { status: 403 });
  const date = new URL(request.url).searchParams.get("date") || mauritiusToday();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Invalid queue date." }, { status: 400 });
  try {
    const { db } = await import("@/lib/db");
    const result = await db.clinicQueueEntry.deleteMany({ where: { queueDate: date } });
    return NextResponse.json({ success: true, deleted: result.count, date });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to reset the clinic queue." }, { status: 500 });
  }
}
