// Elisa Kevin Veragoo + ChatGPT
import { queueVisitDetails } from "@/lib/visit-workflow";
import { parseStringArray } from "@/lib/clinic-queue";
import type { Metadata } from "next";
import AppHeader from "@/components/AppHeader";
import ClinicWorkflow from "@/components/ClinicWorkflow";
import { db } from "@/lib/db";
import { requireAnyRole } from "@/lib/auth";

export const metadata:Metadata={title:"Clinic Workflow | PILS",description:"Clinic enrollment, visits, ART treatment profile, and HIV monitoring workflow."};
export default async function ClinicPage({searchParams}:{searchParams:Promise<{uic?:string;queueId?:string;new?:string;reason?:string}>}){const user=await requireAnyRole(["HEALTHCARE_ASSISTANT","ADMIN"]);const query=await searchParams;const queuedClient=query.queueId?await db.clinicQueueEntry.findUnique({where:{id:query.queueId}}):null;const initialVisit=queuedClient?queueVisitDetails({...queuedClient,tasks:parseStringArray(queuedClient.tasks),appointmentSources:parseStringArray(queuedClient.appointmentSources)}):undefined;const initialEnrollment=queuedClient?.isNewClient?{ce_first_name:queuedClient.firstName??"",ce_last_name:queuedClient.lastName??"",ce_nid:queuedClient.nationalId??"",cne_patient_code:queuedClient.patientCode??"",ce_tel_primary:queuedClient.phone??""}:undefined;return <div className="flex flex-1 flex-col"><a className="pils-skip-link" href="#clinic">Skip to Clinic workflow</a><AppHeader current="clinic"/><main id="clinic" className="w-full flex-1 py-6 sm:py-10"><ClinicWorkflow staffName={user.name} initialUic={query.uic} queueId={query.queueId} initialNew={query.new==="1"} initialReason={query.reason} initialEnrollment={initialEnrollment} initialWorkflow={initialVisit?.visitWorkflow} initialClinicPurposes={initialVisit?.clinicPurposes} initialPrepPurposes={initialVisit?.prepPurposes}/></main></div>}
