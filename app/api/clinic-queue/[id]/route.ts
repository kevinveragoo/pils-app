import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { QUEUE_STATUSES, QUEUE_STATIONS, QUEUE_TASKS, updateQueueEntry } from "@/lib/clinic-queue";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    const { id } = await params;
    const body = await request.json() as Record<string, unknown>;
    const status = typeof body.status === "string" && (QUEUE_STATUSES as readonly string[]).includes(body.status) ? body.status : undefined;
    const currentStation = typeof body.currentStation === "string" && (QUEUE_STATIONS as readonly string[]).includes(body.currentStation) ? body.currentStation : undefined;
    const tasks = Array.isArray(body.tasks) ? body.tasks.filter((task): task is string => typeof task === "string" && (QUEUE_TASKS as readonly string[]).includes(task)) : undefined;
    return NextResponse.json(await updateQueueEntry(id, { status, currentStation, tasks, notes: typeof body.notes === "string" ? body.notes : undefined }, user));
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update the queue entry." }, { status: 400 }); }
}
