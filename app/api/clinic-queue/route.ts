import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createQueueEntry, mauritiusToday, queueForDate, QUEUE_STATIONS, QUEUE_TASKS } from "@/lib/clinic-queue";

export async function GET(request: Request) {
  if (!await getCurrentUser()) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const date = new URL(request.url).searchParams.get("date") || mauritiusToday();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Invalid queue date." }, { status: 400 });
  try { return NextResponse.json(await queueForDate(date)); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load the clinic queue." }, { status: 502 }); }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
    const queueDate = typeof body.queueDate === "string" ? body.queueDate : mauritiusToday();
    const tasks = Array.isArray(body.tasks) ? body.tasks.filter((task): task is string => typeof task === "string" && (QUEUE_TASKS as readonly string[]).includes(task)) : [];
    if (!displayName || !tasks.length || !/^\d{4}-\d{2}-\d{2}$/.test(queueDate)) return NextResponse.json({ error: "Name, date, and at least one service are required." }, { status: 400 });
    const waitingStation = typeof body.currentStation === "string" && ["BLOOD_TEST", "DOCTOR", "MEDICATION"].includes(body.currentStation) && (QUEUE_STATIONS as readonly string[]).includes(body.currentStation) ? body.currentStation : undefined;
    const entry = await createQueueEntry({ queueDate, recordId: typeof body.recordId === "string" ? body.recordId.trim().toUpperCase() : undefined, displayName, alias: typeof body.alias === "string" ? body.alias : undefined, patientCode: typeof body.patientCode === "string" ? body.patientCode : undefined, phone: typeof body.phone === "string" ? body.phone : undefined, source: body.source === "SCHEDULED" ? "SCHEDULED" : "WALK_IN", appointmentSources: Array.isArray(body.appointmentSources) ? body.appointmentSources.filter((item): item is string => typeof item === "string") : [], isNewClient: body.isNewClient === true, status: waitingStation ? "WAITING" : "EXPECTED", currentStation: waitingStation, tasks, notes: typeof body.notes === "string" ? body.notes : undefined }, user);
    return NextResponse.json(entry, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to add the queue entry." }, { status: 500 }); }
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
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
