import type { Metadata } from "next";
import AppHeader from "@/components/AppHeader";
import ClientEnrollmentWorkflow from "@/components/ClientEnrollmentWorkflow";
import { requireAnyRole } from "@/lib/auth";
export const metadata: Metadata = { title: "Client Enrollment | PILS", description: "Register a new REDCap client." };
export default async function ClientEnrollmentPage() {
  const user = await requireAnyRole(["FACILITY_STAFF", "ADMIN"]);
  return <div className="flex flex-1 flex-col"><a className="pils-skip-link" href="#client-enrollment">Skip to client enrollment</a><AppHeader current="client-enrollment" /><main id="client-enrollment" className="w-full flex-1 py-6 sm:py-10"><ClientEnrollmentWorkflow staffName={user.name} /></main></div>;
}
