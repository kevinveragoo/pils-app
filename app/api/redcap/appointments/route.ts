//
//  route.ts
//  pils-app
//
//  Created by Elisa Kevin Veragoo + ChatGPT on 23/10/2026.
//
import { getCurrentUser, hasAnyRole } from "@/lib/auth";
import { appointmentRoles } from "@/lib/clinic-appointments";
import { AppointmentError, createAppointment, getAppointmentCounts } from "@/lib/new-appointment";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (!hasAnyRole(user, [...appointmentRoles])) return Response.json({ error: "Appointment scheduling access is required." }, { status: 403 });
  const date = new URL(request.url).searchParams.get("date") ?? "";
  try {
    return Response.json({ date, counts: await getAppointmentCounts(date) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof AppointmentError ? error.message : "Unable to load appointment counts." }, { status: error instanceof AppointmentError ? error.status : 502 });
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (!hasAnyRole(user, [...appointmentRoles])) return Response.json({ error: "Appointment scheduling access is required." }, { status: 403 });
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "The request body must be valid JSON." }, { status: 400 }); }
  try {
    if (!body || typeof body.recordId !== "string" || typeof body.appointmentType !== "string" || typeof body.appointmentDate !== "string") return Response.json({ error: "Select a client, appointment type, and date." }, { status: 400 });
    return Response.json(await createAppointment(body.recordId.trim().toUpperCase(), body.appointmentType, body.appointmentDate, user));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to save the appointment." }, { status: error instanceof AppointmentError ? error.status : 502 });
  }
}
