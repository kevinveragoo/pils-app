import type { Metadata } from "next";
import AppHeader from "@/components/AppHeader";
import PrepWorkflow from "@/components/PrepWorkflow";
import { requireAnyRole } from "@/lib/auth";

export const metadata: Metadata = {
  title: "PrEP Workflow | PILS",
  description: "Client PrEP enrollment, treatment profile, and visit workflow.",
};

export default async function PrepPage({ searchParams }: { searchParams: Promise<{ uic?: string; queueId?: string; new?: string }> }) {
  const user = await requireAnyRole(["HEALTHCARE_ASSISTANT", "ADMIN"]);
  const query = await searchParams;
  return <div className="flex flex-1 flex-col"><a className="pils-skip-link" href="#prep">Skip to PrEP workflow</a><AppHeader current="prep" /><main id="prep" className="w-full flex-1 py-6 sm:py-10"><PrepWorkflow staffName={user.name} initialUic={query.uic} queueId={query.queueId} initialNew={query.new === "1"} /></main></div>;
}
