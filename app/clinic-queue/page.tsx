import type { Metadata } from "next";
import AppHeader from "@/components/AppHeader";
import ClinicQueueBoard from "@/components/ClinicQueueBoard";
import { requireAnyRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Clinic Queue | PILS", description: "Manage arrivals, clinic stations, and completed visits." };

export default async function ClinicQueuePage() {
  await requireAnyRole(["HEALTHCARE_ASSISTANT", "ADMIN"]);
  return <div className="flex flex-1 flex-col"><a className="pils-skip-link" href="#clinic-queue">Skip to clinic queue</a><AppHeader current="clinic-queue" /><main id="clinic-queue" className="w-full flex-1 py-6 sm:py-10"><ClinicQueueBoard /></main></div>;
}
