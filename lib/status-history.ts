import { hivStatusChoices, prepStatusChoices } from "./treatment-status";
export type StatusValues = Record<string,string>;
export type Programme = "prep" | "hiv";
export const prepHistoryFields=["pv_status_at_visit","pv_status_date","pv_status_reason","pv_status_date_unknown","pv_status_only","pv_status_source"];
export const hivHistoryFields=["hcs_care_status","hcs_status_date","hcs_status_reason","hcs_status_date_unknown","hcs_status_only","hcs_status_source"];
export function statusDate(row:StatusValues, programme:Programme) {
  const prefix=programme==="prep"?"pv":"hcs";
  if(row[`${prefix}_status_date_unknown`]==="1")return "";
  return row[`${prefix}_status_date`] || row[programme==="prep"?"pv_visit_date":"hcs_date"] || "";
}
export function latestStatus(rows:StatusValues[], programme:Programme) {
  const prep=programme==="prep", form=prep?"prep_visit":"hiv_care_support", field=prep?"pv_status_at_visit":"hcs_care_status";
  const history=rows.filter(row=>row.redcap_repeat_instrument===form&&row[field]);
  history.sort((a,b)=>statusDate(b,programme).localeCompare(statusDate(a,programme))||Number(b.redcap_repeat_instance||0)-Number(a.redcap_repeat_instance||0));
  if(history[0])return {status:history[0][field],date:statusDate(history[0],programme),instance:history[0].redcap_repeat_instance||"",source:"history"};
  const profiles=rows.filter(row=>(!row.redcap_repeat_instrument||row.redcap_repeat_instrument===(prep?"prep_treatment_profile":"hiv_treatment_profile"))&&row[prep?"ptp_status":"htp_care_status"]);
  profiles.sort((a,b)=>(b[prep?"ptp_effective_date":"htp_effective_date"]||"").localeCompare(a[prep?"ptp_effective_date":"htp_effective_date"]||"")||Number(b.redcap_repeat_instance||0)-Number(a.redcap_repeat_instance||0));
  return {status:profiles[0]?.[prep?"ptp_status":"htp_care_status"]||"",date:profiles[0]?.[prep?"ptp_effective_date":"htp_effective_date"]||"",instance:profiles[0]?.redcap_repeat_instance||"",source:"profile"};
}
export function hasProgramme(rows:StatusValues[], programme:Programme) {
  const prep=programme==="prep", profile=prep?"prep_treatment_profile":"hiv_treatment_profile", history=prep?"prep_visit":"hiv_care_support", field=prep?"pv_status_at_visit":"hcs_care_status", prefix=prep?"ptp_":"htp_";
  return rows.some(row=>(row.redcap_repeat_instrument===profile||!row.redcap_repeat_instrument)&&Object.entries(row).some(([key,value])=>key.startsWith(prefix)&&Boolean(value))||row.redcap_repeat_instrument===history&&Boolean(row[field]));
}
export function statusChangeError(rows:StatusValues[], programme:Programme, status:string, original?:string) {
  const choices=programme==="prep"?prepStatusChoices:hivStatusChoices;
  if(!choices.some(([code])=>code===status))return "Choose a valid programme status.";
  if(!hasProgramme(rows,programme))return "This client is not enrolled in that programme.";
  if(original!==undefined && original!==latestStatus(rows,programme).status)return "The programme status changed since this client was loaded. Reload before saving.";
  return null;
}
export function statusOnlyRow(programme:Programme, status:string, date:string, worker:string, reason=""):StatusValues {
  return programme==="prep"?{redcap_repeat_instrument:"prep_visit",pv_visit_date:date,pv_worker_1:worker,pv_visit_purpose___4:"1",pv_status_at_visit:status,pv_status_date:date,pv_status_reason:reason,pv_status_only:"1",pv_status_date_unknown:"0"}:{redcap_repeat_instrument:"hiv_care_support",hcs_date:date,hcs_navigator_1:worker,hcs_care_status:status,hcs_status_date:date,hcs_status_reason:reason,hcs_status_only:"1",hcs_status_date_unknown:"0"};
}
