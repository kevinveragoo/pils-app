// Elisa Kevin Veragoo + ChatGPT
import { instrumentFields, retiredClinicEnrollmentFields, instrumentCheckboxes, visibleInstrumentValues } from "@/lib/instrument-forms";
import { clinicNextAppointment } from "@/lib/clinic-followup";
import { prepNextAppointment } from "@/lib/prep-followup";
import { validWorkflow, includesClinic, includesPrep } from "@/lib/visit-workflow";
import { hivStatusChoices, prepStatusChoices } from "@/lib/treatment-status";
import { latestStatus, hasProgramme, statusChangeError, statusOnlyRow } from "@/lib/status-history";
import { clientKpType, visibleClinicEnrollment } from "@/lib/clinic-enrollment";
import { NextResponse } from "next/server";
import { getCurrentUser, hasRole } from "@/lib/auth";
import { recordRedcapActivity } from "@/lib/redcap-activity";
import { validateFields } from "@/lib/redcap-validation";
import { completeQueueEntry } from "@/lib/clinic-queue";
import { generateUic } from "@/lib/uic";

const REDCAP_API_URL = process.env.REDCAP_API_URL;
const REDCAP_API_TOKEN = process.env.REDCAP_API_TOKEN;
type Values = Record<string, string>;
type Submission = { includeRiskAssessment?: unknown; riskAssessment?: unknown; includeViolenceDisclosure?: unknown; violenceDisclosure?: unknown; visitWorkflow?: unknown; includeClinicVisit?: unknown; statusChanges?: unknown; mode?: unknown; recordId?: unknown; enrollment?: unknown; clinicEnrollment?: unknown; clientStatus?: unknown; profile?: unknown; visit?: unknown; prepVisit?: unknown; monitoring?: unknown; includeClinicEnrollment?: unknown; includeClientStatus?: unknown; includeProfile?: unknown; includePrepVisit?: unknown; includeMonitoring?: unknown; queueId?: unknown };

const enrollmentFields = ["ce_active","ce_vital_status","ce_date","ce_implementing_partner","ce_district","ce_hotspot","ce_outreach_worker","ce_nid","ce_nationality","ce_last_name","ce_first_name","ce_middle_name_1","ce_middle_name_2","ce_middle_name_3","ce_alias","ce_dob","ce_gender_identity","ce_sex_assigned_birth","ce_mobility","ce_vision","ce_kp_type","ce_tel_primary","ce_contact_address"];
const clientStatusFields = ["ce_active","ce_vital_status","ce_exit_date","ce_exit_reason"];
const clinicEnrollmentFields = instrumentFields("clinic_enrollment");
const profileFields = ["htp_effective_date","htp_change_reason","htp_diagnosis_date","htp_prev_ltfu","htp_art_reg_date","htp_art_reg_place","htp_started_abroad","htp_art_start_date","htp_art_regimen","htp_art_regimen_other","htp_additional_medications","htp_art_adherence","htp_notes"];
const visitFields = instrumentFields("clinic_visit");
const prepVisitFields = instrumentFields("prep_visit");
const riskFields=instrumentFields("risk_assessment"),violenceFields=instrumentFields("violence_disclosure");
const monitoringFields = ["htm_date","htm_is_baseline","htm_art_status","htm_cd4_date","htm_cd4_level","htm_vl_date","htm_viral_load_detectable","htm_vl_level","htm_notes"];

function values(value: unknown): Values | null { if (!value || typeof value !== "object" || Array.isArray(value)) return null; const entries = Object.entries(value); return entries.every(([, item]) => typeof item === "string") ? Object.fromEntries(entries) as Values : null; }
const checkboxFields = ["ce_kp_type","cne_msm_sex_type","cne_sti_symp_6m","cne_sti_diagnosed","cne_sti_treat_location","cne_contraception_type","cne_violence_type","cne_comorbidities","cne_violence_perpetrator","cne_violence_help_source","cne_hiv_disclosure_recipient","htp_art_regimen","cnv_visit_purpose","cnv_medication_supplied","cnv_sti_syndrome","cnv_lab_tests","pv_visit_purpose",...instrumentCheckboxes("clinic_visit"),...instrumentCheckboxes("prep_visit"),...instrumentCheckboxes("risk_assessment"),...instrumentCheckboxes("violence_disclosure")];
function copyAllowed(source: Values, allowed: string[]) { if(allowed===riskFields)source=visibleInstrumentValues("risk_assessment",source);if(allowed===violenceFields)source=visibleInstrumentValues("violence_disclosure",source); if(allowed===visitFields)source=visibleInstrumentValues("clinic_visit",source);if(allowed===prepVisitFields)source=visibleInstrumentValues("prep_visit",source); const row:Values={}; for(const key of allowed)if(source[key]!==undefined&&source[key]!=="")row[key]=source[key].trim(); for(const key of checkboxFields){if(!allowed.includes(key)||!source[key])continue;for(const code of source[key].split(",").filter(item=>/^\d+$/.test(item)))row[`${key}___${code}`]="1";delete row[key];} return row; }
async function redcap(params: Record<string,string>) { if(!REDCAP_API_URL||!REDCAP_API_TOKEN)throw new Error("REDCap API configuration is missing."); const response=await fetch(REDCAP_API_URL,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({token:REDCAP_API_TOKEN,...params}),cache:"no-store"}); const text=await response.text();let result:unknown=text;try{result=JSON.parse(text)}catch{}if(!response.ok||(result&&typeof result==="object"&&"error" in result))throw new Error(result&&typeof result==="object"&&"error" in result?String((result as {error:unknown}).error):text||`REDCap returned HTTP ${response.status}.`);return result; }
async function exportRecord(recordId:string){const result=await redcap({content:"record",action:"export",format:"json",type:"flat",rawOrLabel:"raw",rawOrLabelHeaders:"raw",returnFormat:"json","records[0]":recordId,"forms[0]":"client_enrollment","forms[1]":"hiv_treatment_profile","forms[2]":"clinic_visit","forms[3]":"hiv_clinical_monitoring","forms[4]":"prep_visit","forms[5]":"clinic_enrollment","forms[6]":"prep_treatment_profile","forms[7]":"hiv_care_support","forms[8]":"risk_assessment","forms[9]":"violence_disclosure"});return Array.isArray(result)?result as Values[]:[];}
function latestProfile(rows:Values[]){const profiles=rows.filter(row=>row.redcap_repeat_instrument==="hiv_treatment_profile").sort((a,b)=>Number(b.redcap_repeat_instance||0)-Number(a.redcap_repeat_instance||0));const latest=profiles[0];return latest?Object.fromEntries(profileFields.map(field=>[field,latest[field]??""])):null;}


function hasClinicEnrollment(rows:Values[]){return rows.some(row=>clinicEnrollmentFields.some(field=>field!=="cne_patient_code"&&Boolean(row[field]?.trim()))||["1","2"].includes(row.clinic_enrollment_complete?.trim()??""));}
export async function GET(request:Request){const user=await getCurrentUser();if(!user)return NextResponse.json({error:"Authentication required."},{status:401});if(!hasRole(user,"HEALTHCARE_ASSISTANT"))return NextResponse.json({error:"Healthcare Assistant access is required."},{status:403});const uic=new URL(request.url).searchParams.get("uic")?.trim().toUpperCase()??"";if(!uic)return NextResponse.json({error:"A UIC is required."},{status:400});try{const rows=await exportRecord(uic),main=rows.find(row=>!row.redcap_repeat_instrument);return NextResponse.json({exists:rows.some(row=>row.uic_ori===uic),hasClinicEnrollment:hasClinicEnrollment(rows),patientCode:main?.cne_patient_code??"",hasRiskAssessment:rows.some(row=>row.redcap_repeat_instrument==="risk_assessment"&&Boolean(row.ra_date)),clientStatus:main?Object.fromEntries(clientStatusFields.map(field=>[field,main[field]??""])):null,clientIdentity:main?{ce_kp_type:clientKpType(main),ce_sex_assigned_birth:main.ce_sex_assigned_birth??"",ce_dob:main.ce_dob??"",ce_gender_identity:main.ce_gender_identity??""}:null,latestProfile:latestProfile(rows),programmeStatus:{prep:latestStatus(rows,"prep"),hiv:latestStatus(rows,"hiv")},programmes:{prep:hasProgramme(rows,"prep"),hiv:hasProgramme(rows,"hiv")}});}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Unable to load the client from REDCap."},{status:502});}}

export async function POST(request:Request){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:"Authentication required."},{status:401});if(!hasRole(user,"HEALTHCARE_ASSISTANT"))return NextResponse.json({error:"Healthcare Assistant access is required."},{status:403});
  let input:Submission;try{input=await request.json() as Submission}catch{return NextResponse.json({error:"The request body must be valid JSON."},{status:400})}
  // A missed appointment is a standalone CNV entry, without encounter data.
  if(values(input.visit)?.cnv_no_show === "1") {
    const visit = values(input.visit)!;
    const recordId = typeof input.recordId === "string" ? input.recordId.trim().toUpperCase() : "";
    if(input.mode !== "existing" || !recordId || (input.visitWorkflow !== undefined && input.visitWorkflow !== "CLINIC") || input.includeClinicVisit === false)
      return NextResponse.json({error:"Record a no-show using the Clinic visit workflow for an existing client."},{status:400});
    const error = validateFields(visit,["cnv_date","cnv_worker_1","cnv_no_show"]);
    if(error)return NextResponse.json({error},{status:400});
    try {
      const existing = await exportRecord(recordId);
      if(!existing.some(row=>row.uic_ori===recordId))return NextResponse.json({error:"The selected client no longer exists in REDCap."},{status:409});
      const instance = Math.max(0,...existing.filter(row=>row.redcap_repeat_instrument==="clinic_visit").map(row=>Number(row.redcap_repeat_instance)||0))+1;
      const record = {uic_ori:recordId,redcap_repeat_instrument:"clinic_visit",redcap_repeat_instance:String(instance),cnv_date:visit.cnv_date.trim(),cnv_worker_1:visit.cnv_worker_1.trim(),cnv_no_show:"1"};
      const result=await redcap({content:"record",action:"import",format:"json",type:"flat",overwriteBehavior:"normal",forceAutoNumber:"false",dateFormat:"YMD",data:JSON.stringify([record]),returnContent:"count",returnFormat:"json"});
      const activityLogged=await recordRedcapActivity({user,workflow:"clinic",recordId,staffName:record.cnv_worker_1,serviceDate:record.cnv_date,instrumentInstances:[{instrument:"clinic_visit",instance}],submittedData:[record]});
      return NextResponse.json({success:true,recordId,savedRows:1,activityLogged,queueCompleted:false,result});
    } catch(error) {
      return NextResponse.json({error:error instanceof Error?error.message:"Unable to save the no-show."},{status:502});
    }
  }
  if(values(input.enrollment)?.ce_patient_code?.trim())return NextResponse.json({error:"Patient code has moved to Clinic Enrollment. Keep your unsaved answers, reload, and enter the code there."},{status:409});
  const includeRisk=input.includeRiskAssessment===true,includeViolence=input.includeViolenceDisclosure===true,risk=values(input.riskAssessment),violence=values(input.violenceDisclosure);
  if((includeRisk&&!risk)||(includeViolence&&!violence))return NextResponse.json({error:"Invalid assessment submission."},{status:400});
  const mode=input.mode,recordId=typeof input.recordId==="string"?input.recordId.trim().toUpperCase():"",enrollment=values(input.enrollment),clinicEnrollment=values(input.clinicEnrollment),clientStatus=values(input.clientStatus),statusChanges=values(input.statusChanges),profile=values(input.profile),visit=values(input.visit)??{},prepVisit=values(input.prepVisit),monitoring=values(input.monitoring);const includeClinicEnrollment=mode==="new"||input.includeClinicEnrollment===true,includeClientStatus=input.includeClientStatus===true,includeProfile=input.includeProfile===true,includePrepVisit=validWorkflow(input.visitWorkflow)?includesPrep(input.visitWorkflow):input.includePrepVisit===true,includeMonitoring=input.includeMonitoring===true;
  if(includeClinicEnrollment&&clinicEnrollment&&retiredClinicEnrollmentFields.some(name=>Boolean(clinicEnrollment[name]?.trim())))return NextResponse.json({error:"Clinic Enrollment has changed. No data was saved. Keep your unsaved answers before reloading, then enter them in Risk Assessment, Clinic Visit or Violence Disclosure."},{status:409});
  if(input.visitWorkflow!==undefined&&!validWorkflow(input.visitWorkflow))return NextResponse.json({error:"Choose a valid visit workflow."},{status:400});
  const includeClinicVisit=validWorkflow(input.visitWorkflow)?includesClinic(input.visitWorkflow):input.includeClinicVisit!==false;
  if(!includeClinicVisit&&!includePrepVisit)return NextResponse.json({error:"Select at least one visit instrument."},{status:400});
  if(!includeClinicVisit&&(includeProfile||includeMonitoring))return NextResponse.json({error:"ART profile and HIV monitoring updates require the Clinic visit workflow."},{status:400});
  const encounterDate=includeClinicVisit?visit.cnv_date:prepVisit?.pv_visit_date??"",encounterWorker=includeClinicVisit?visit.cnv_worker_1:prepVisit?.pv_worker_1||user.name;
  if((mode!=="new"&&mode!=="existing")||!recordId||(includeClinicVisit&&!values(input.visit))||(includeClinicEnrollment&&!clinicEnrollment)||(includeClientStatus&&!clientStatus)||(includeProfile&&!profile)||(includePrepVisit&&!prepVisit)||(includeMonitoring&&!monitoring))return NextResponse.json({error:"Invalid Clinic workflow submission."},{status:400});
  if(includeClinicVisit)visit.cnv_next_appointment_date=clinicNextAppointment({...visibleInstrumentValues("clinic_visit",visit),cnv_legacy_next_date:visit.cnv_legacy_next_date});
  if(includeClinicVisit)visit.cnv_is_new_client=mode==="new"?"1":"0";
  if(includeClinicVisit&&(!visit.cnv_worker_1||!visit.cnv_date||!visit.cnv_visit_purpose))return NextResponse.json({error:"Clinic worker, visit date, and reason for visit are required."},{status:400});
  if(includePrepVisit&&(!prepVisit?.pv_visit_date))return NextResponse.json({error:"PrEP visit date is required when PrEP is selected."},{status:400});
  if(includePrepVisit&&prepVisit){prepVisit.pv_profile_updated="0";prepVisit.pv_next_appointment_date=prepNextAppointment(prepVisit);}

  if(includeClinicVisit&&visibleInstrumentValues("clinic_visit",visit).cnv_hiv_lab_test_done==="1"&&!visit.cnv_hiv_lab_test_date)return NextResponse.json({error:"HIV laboratory test date is required when an HIV laboratory test was performed."},{status:400});
  if(mode==="new"){const required=["ce_date","ce_district","ce_outreach_worker","ce_last_name","ce_first_name","ce_dob","ce_gender_identity","ce_kp_type"];if(!enrollment||!required.every(key=>enrollment[key]?.trim()))return NextResponse.json({error:"Complete all required enrollment fields."},{status:400});if(generateUic(enrollment)!==recordId)return NextResponse.json({error:"The generated UIC does not match the enrollment details."},{status:400});}
  if(includeClinicEnrollment&&!clinicEnrollment?.cne_date)return NextResponse.json({error:"Clinic enrollment date is required."},{status:400});
  if(includeProfile&&(!profile?.htp_effective_date||!profile.htp_art_start_date))return NextResponse.json({error:"Profile effective date and ART start date are required for a treatment profile."},{status:400});
  if(includeMonitoring&&!monitoring?.htm_date)return NextResponse.json({error:"Monitoring date is required when adding clinical monitoring."},{status:400});
  if(includeClientStatus&&clientStatus?.ce_vital_status==="2"&&(!clientStatus.ce_exit_date||clientStatus.ce_active!=="0"))return NextResponse.json({error:"A deceased client requires an exit date and inactive status."},{status:400});
  const validationError=(mode==="new"&&enrollment?validateFields(enrollment,enrollmentFields):null)||(includeClinicEnrollment&&clinicEnrollment?validateFields(clinicEnrollment,clinicEnrollmentFields):null)||(includeClientStatus&&clientStatus?validateFields(clientStatus,clientStatusFields):null)||(includeProfile&&profile?validateFields(profile,profileFields):null)||(includeClinicVisit?validateFields(visibleInstrumentValues("clinic_visit",visit),visitFields):null)||(includePrepVisit&&prepVisit?validateFields(prepVisit,prepVisitFields):null)||(includeMonitoring&&monitoring?validateFields(monitoring,monitoringFields):null);if(validationError)return NextResponse.json({error:validationError},{status:400});
  try{
    const existing=await exportRecord(recordId),exists=existing.some(row=>row.uic_ori===recordId);if(mode==="new"&&exists)return NextResponse.json({error:`UIC ${recordId} already exists. Use Existing client.`},{status:409});if(mode==="existing"&&!exists)return NextResponse.json({error:"The selected client no longer exists in REDCap."},{status:409});if(mode==="existing"&&includeClinicEnrollment&&hasClinicEnrollment(existing))return NextResponse.json({error:"Clinic Enrollment was added by another user. Reload this workflow to avoid overwriting it."},{status:409});
    const main=existing.find(row=>!row.redcap_repeat_instrument);
    if(includeClinicEnrollment&&main?.cne_patient_code&&clinicEnrollment?.cne_patient_code?.trim()&&main.cne_patient_code!==clinicEnrollment.cne_patient_code.trim())return NextResponse.json({error:"This client already has a different patient code. Reload the workflow to preserve the saved code."},{status:409});
    const sexAssignedBirth=mode==="new"?enrollment?.ce_sex_assigned_birth??"":main?.ce_sex_assigned_birth??"";
    if(includeClinicEnrollment&&sexAssignedBirth&&!['1','2','3','9'].includes(sexAssignedBirth))return NextResponse.json({error:"Choose a valid sex assigned at birth."},{status:400});
    const riskContext=risk?{...risk,ce_kp_type:mode==="new"?enrollment?.ce_kp_type??"":clientKpType(main)}:null;
    if(includeRisk&&riskContext){const error=validateFields(riskContext,riskFields);if(error)return NextResponse.json({error},{status:400});}
    if(includeViolence&&violence){
      if(violence.vd_entry_type==="1"&&!["0","1","9"].includes(violence.vd_violence_3m))return NextResponse.json({error:"Record the violence screening response."},{status:400});
      const visible=visibleInstrumentValues("violence_disclosure",violence),error=validateFields(visible,violenceFields);if(error)return NextResponse.json({error},{status:400});
    }
    const visibleEnrollment=clinicEnrollment?visibleClinicEnrollment(clinicEnrollment,sexAssignedBirth,mode==="new"?enrollment?.ce_kp_type??"":clientKpType(main)):null;
    const statusRows:Values[]=[];
    for(const programme of ["prep","hiv"] as const){
      const status=statusChanges?.[programme];if(!status)continue;
      const statusError=programme==="prep"&&includePrepVisit&&!hasProgramme(existing,"prep")?(prepStatusChoices.some(([code])=>code===status)?null:"Choose a valid programme status."):mode==="new"&&programme==="hiv"&&includeProfile?(hivStatusChoices.some(([code])=>code===status)?null:"Choose a valid programme status."):statusChangeError(existing,programme,status,statusChanges?.[`${programme}Original`]);
      if(statusError)return NextResponse.json({error:statusError},{status:409});
      const current=latestStatus(existing,programme);
      if(current.status===status)continue;
      if(programme==="prep"&&includePrepVisit&&prepVisit){prepVisit.ptp_status=status;}
      else statusRows.push(statusOnlyRow(programme,status,encounterDate,encounterWorker,statusChanges?.reason));
    }
    if(mode==="new"&&includeProfile&&!statusRows.some(row=>row.redcap_repeat_instrument==="hiv_care_support"))statusRows.push(statusOnlyRow("hiv","1",encounterDate,encounterWorker,"Initial programme status"));

    const maximum=new Map<string,number>();for(const row of existing){const form=row.redcap_repeat_instrument,instance=Number(row.redcap_repeat_instance);if(form&&Number.isInteger(instance))maximum.set(form,Math.max(maximum.get(form)??0,instance));}const next=(form:string)=>String((maximum.get(form)??0)+1);
    const records:Values[]=[],base:Values={uic_ori:recordId};for(const statusRow of statusRows)records.push({uic_ori:recordId,redcap_repeat_instance:next(statusRow.redcap_repeat_instrument),...statusRow});if(mode==="new"&&enrollment)Object.assign(base,copyAllowed(enrollment,enrollmentFields),visibleEnrollment?copyAllowed(visibleEnrollment,clinicEnrollmentFields):{});else if(includeClinicEnrollment&&clinicEnrollment)Object.assign(base,copyAllowed(visibleEnrollment!,clinicEnrollmentFields));if(includeClientStatus&&clientStatus)Object.assign(base,copyAllowed(clientStatus,clientStatusFields));if(Object.keys(base).length>1)records.push(base);if(includeProfile&&profile)records.push({uic_ori:recordId,redcap_repeat_instrument:"hiv_treatment_profile",redcap_repeat_instance:next("hiv_treatment_profile"),...copyAllowed(profile,profileFields)});if(includeClinicVisit)records.push({uic_ori:recordId,redcap_repeat_instrument:"clinic_visit",redcap_repeat_instance:next("clinic_visit"),...copyAllowed(visit,visitFields)});if(includePrepVisit&&prepVisit)records.push({uic_ori:recordId,redcap_repeat_instrument:"prep_visit",redcap_repeat_instance:next("prep_visit"),...copyAllowed(prepVisit,prepVisitFields)});if(includeMonitoring&&monitoring)records.push({uic_ori:recordId,redcap_repeat_instrument:"hiv_clinical_monitoring",redcap_repeat_instance:next("hiv_clinical_monitoring"),...copyAllowed(monitoring,monitoringFields)});
    if(includeRisk&&riskContext)records.push({uic_ori:recordId,redcap_repeat_instrument:"risk_assessment",redcap_repeat_instance:next("risk_assessment"),...copyAllowed(riskContext,riskFields)});
    if(includeViolence&&violence)records.push({uic_ori:recordId,redcap_repeat_instrument:"violence_disclosure",redcap_repeat_instance:next("violence_disclosure"),...copyAllowed(violence,violenceFields)});
    const result=await redcap({content:"record",action:"import",format:"json",type:"flat",overwriteBehavior:"normal",forceAutoNumber:"false",dateFormat:"YMD",data:JSON.stringify(records),returnContent:"count",returnFormat:"json"});const activityLogged=await recordRedcapActivity({user,workflow:"clinic",recordId,staffName:encounterWorker,serviceDate:encounterDate,instrumentInstances:records.filter(row=>row.redcap_repeat_instrument).map(row=>({instrument:row.redcap_repeat_instrument,instance:Number(row.redcap_repeat_instance)})),submittedData:records});const queueCompleted=await completeQueueEntry(typeof input.queueId==="string"?input.queueId:undefined,recordId,user);return NextResponse.json({success:true,recordId,savedRows:records.length,activityLogged,queueCompleted,result});
  }catch(error){console.error("REDCap Clinic workflow import error:",error);return NextResponse.json({error:error instanceof Error?error.message:"Unable to save the Clinic workflow to REDCap."},{status:502});}
}
