import type { Metadata } from "next";
import AppHeader from "@/components/AppHeader";
import ClientEnrollmentWorkflow from "@/components/ClientEnrollmentWorkflow";

export const metadata: Metadata = {
  title: "Client Enrolment | PILS",
  description: "Create or update a PILS client enrollment in REDCap.",
};

export default function EnrollmentPage() {
  return <div className="flex flex-1 flex-col"><a className="pils-skip-link" href="#enrollment">Skip to enrollment form</a><AppHeader current="enrollment" /><main id="enrollment" className="w-full flex-1 py-6 sm:py-10"><ClientEnrollmentWorkflow /></main></div>;
}
