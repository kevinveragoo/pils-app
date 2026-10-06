import type { Metadata } from "next";
import AppHeader from "@/components/AppHeader";
import ArvWorkflow from "@/components/ArvWorkflow";
import { requireAnyRole } from "@/lib/auth";

export const metadata:Metadata={title:"ARV Workflow | PILS",description:"ART treatment profile, clinic visit, and HIV monitoring workflow."};
export default async function ArvPage({searchParams}:{searchParams:Promise<{uic?:string;queueId?:string;new?:string}>}){const user=await requireAnyRole(["HEALTHCARE_ASSISTANT","ADMIN"]);const query=await searchParams;return <div className="flex flex-1 flex-col"><a className="pils-skip-link" href="#arv">Skip to ARV workflow</a><AppHeader current="arv"/><main id="arv" className="w-full flex-1 py-6 sm:py-10"><ArvWorkflow staffName={user.name} initialUic={query.uic} queueId={query.queueId} initialNew={query.new==="1"}/></main></div>}
