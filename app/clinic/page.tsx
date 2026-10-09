import type { Metadata } from "next";
import AppHeader from "@/components/AppHeader";
import ArvWorkflow from "@/components/ArvWorkflow";
import { requireAnyRole } from "@/lib/auth";

export const metadata:Metadata={title:"Clinic Workflow | PILS",description:"Clinic enrollment, visits, ART treatment profile, and HIV monitoring workflow."};
export default async function ClinicPage({searchParams}:{searchParams:Promise<{uic?:string;queueId?:string;new?:string}>}){const user=await requireAnyRole(["HEALTHCARE_ASSISTANT","ADMIN"]);const query=await searchParams;return <div className="flex flex-1 flex-col"><a className="pils-skip-link" href="#clinic">Skip to Clinic workflow</a><AppHeader current="clinic"/><main id="clinic" className="w-full flex-1 py-6 sm:py-10"><ArvWorkflow staffName={user.name} initialUic={query.uic} queueId={query.queueId} initialNew={query.new==="1"}/></main></div>}
