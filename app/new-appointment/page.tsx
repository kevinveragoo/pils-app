//
//  page.tsx
//  pils-app
//
//  Created by Elisa Kevin Veragoo + ChatGPT on 21/10/2026.
//
import type { Metadata } from "next";
import AppHeader from "@/components/AppHeader";
import RecordLookup from "@/components/RecordLookup";
import { requireAnyRole } from "@/lib/auth";
import { appointmentRoles } from "@/lib/clinic-appointments";

export const metadata: Metadata = { title: "New Clinic Appointment | PILS", description: "Review a client record and book a clinic appointment." };
export default async function NewAppointmentPage() {
  await requireAnyRole([...appointmentRoles]);
  return <div className="flex flex-1 flex-col"><a className="pils-skip-link" href="#new-appointment">Skip to new appointment</a><AppHeader current="new-appointment" /><main id="new-appointment" className="w-full flex-1 py-6 sm:py-10"><RecordLookup appointment /></main></div>;
}
