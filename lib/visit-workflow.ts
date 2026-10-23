//
//  visit-workflow.ts
//  pils-app
//
//  Created by Elisa Kevin Veragoo + ChatGPT on 14/10/2026.
//
export const visitWorkflows = [["CLINIC", "Clinic visit"], ["PREP", "PrEP visit"], ["BOTH", "Clinic and PrEP visits"]] as const;
export type VisitWorkflow = typeof visitWorkflows[number][0];
export const clinicVisitPurposes: [string, string][] = [["2", "Positive HIV self-test"], ["11", "Blood sample collection"], ["3", "Laboratory results review"], ["4", "Doctor - ART review"], ["12", "Doctor - Pils"], ["8", "STI"], ["9", "Medication collection"], ["15", "Addictology"], ["16", "Commodities"], ["99", "Other services"]];
export const prepVisitPurposes: [string, string][] = [["1", "Blood sample collection"], ["2", "Doctor"], ["3", "Medication collection"]];
export const includesClinic = (workflow: VisitWorkflow) => workflow !== "PREP";
export const includesPrep = (workflow: VisitWorkflow) => workflow !== "CLINIC";
export const validWorkflow = (value: unknown): value is VisitWorkflow => visitWorkflows.some(([code]) => code === value);
export function purposeCodes(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  if (typeof value !== "string") return [];
  if (value.trim().startsWith("[")) { try { return purposeCodes(JSON.parse(value)); } catch { return []; } }
  return value.split(",").map(code => code.trim()).filter(Boolean);
}
export function purposeTasks(clinic: string[], prep: string[]) {
  const tasks = new Set<string>();
  for (const code of clinic) tasks.add(code === "11" ? "BLOOD_TEST" : ["9", "10"].includes(code) ? "MEDICATION" : code === "13" ? "OTHER" : "DOCTOR");
  for (const code of prep) tasks.add(code === "1" ? "BLOOD_TEST" : code === "2" ? "DOCTOR" : code === "3" ? "MEDICATION" : "OTHER");
  return [...tasks];
}
export function queueVisitDetails(entry: { visitWorkflow?: string | null; clinicPurposes?: unknown; prepPurposes?: unknown; tasks: string[]; appointmentSources: string[] }) {
  const sources = entry.appointmentSources;
  const prep = sources.some(source => source.startsWith("PrEP")) || entry.tasks.includes("PREP");
  const clinic = sources.some(source => source.startsWith("Clinic")) || entry.tasks.includes("ARV");
  const workflow: VisitWorkflow = validWorkflow(entry.visitWorkflow) ? entry.visitWorkflow : prep ? clinic ? "BOTH" : "PREP" : "CLINIC";
  let clinicPurposes = purposeCodes(entry.clinicPurposes), prepPurposes = purposeCodes(entry.prepPurposes);
  if (!validWorkflow(entry.visitWorkflow)) {
    if (includesClinic(workflow)) {
      if (sources.includes("Clinic blood test") || (!sources.length && entry.tasks.includes("BLOOD_TEST"))) clinicPurposes.push("11");
      if (sources.includes("Clinic doctor review") || (!sources.length && entry.tasks.includes("DOCTOR"))) clinicPurposes.push("12");
      if (sources.includes("Clinic other services")) clinicPurposes.push("99");
      if (sources.includes("Clinic laboratory results review")) clinicPurposes.push("3");
      if (sources.includes("Clinic addictologist review")) clinicPurposes.push("15");
      if (sources.includes("Clinic medication collection") || (!sources.length && entry.tasks.includes("MEDICATION"))) clinicPurposes.push("9");
      if (entry.tasks.includes("ARV")) clinicPurposes.push("4");
    }
    if (includesPrep(workflow)) {
      if (sources.includes("PrEP blood sample collection") || (!sources.length && entry.tasks.includes("BLOOD_TEST"))) prepPurposes.push("1");
      if (sources.includes("PrEP doctor review") || (!sources.length && entry.tasks.includes("DOCTOR"))) prepPurposes.push("2");
      if (sources.includes("PrEP medication collection") || (!sources.length && entry.tasks.includes("MEDICATION"))) prepPurposes.push("3");
    }
  }
  clinicPurposes = [...new Set(clinicPurposes)]; prepPurposes = [...new Set(prepPurposes)];
  return { visitWorkflow: workflow, clinicPurposes, prepPurposes };
}
