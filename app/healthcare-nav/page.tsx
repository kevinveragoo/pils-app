import type { Metadata } from "next";
import AppHeader from "@/components/AppHeader";
import HealthcareNavWorkflow from "@/components/HealthcareNavWorkflow";

export const metadata: Metadata = {
  title: "Healthcare Nav Workflow | PILS",
  description: "Guided HIV care support and treatment monitoring entry.",
};

export default function HealthcareNavPage() {
  return <div className="flex flex-1 flex-col"><a className="pils-skip-link" href="#healthcare-nav">Skip to healthcare navigation form</a><AppHeader current="healthcare-nav" /><main id="healthcare-nav" className="w-full flex-1 py-6 sm:py-10"><HealthcareNavWorkflow /></main></div>;
}
