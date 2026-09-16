import type { Metadata } from "next";
import AppHeader from "@/components/AppHeader";
import Dashboard from "@/components/Dashboard";

export const metadata: Metadata = {
  title: "Dashboard | PILS",
  description: "Aggregate outreach testing dashboard by reporting period and key population.",
};

export default function DashboardPage() {
  return <div className="flex flex-1 flex-col"><a className="pils-skip-link" href="#dashboard">Skip to dashboard</a><AppHeader current="dashboard" /><main id="dashboard" className="w-full flex-1 py-6 sm:py-10"><Dashboard /></main></div>;
}
