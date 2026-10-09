"use client";

import { useEffect, useMemo, useState } from "react";
import { generateUic } from "@/lib/uic";
import { AlertCircle, ArrowLeft, ArrowRight, Check } from "lucide-react";
import { WorkflowClientChoice } from "@/components/WorkflowClientChoice";
import { DobInput } from "@/components/DobInput";
import { validateFields } from "@/lib/redcap-validation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { PatientSummary, type PatientSummaryDetails } from "@/components/PatientSummary";

type Values = Record<string, string>;
type Patient = { record_id: string; uic: string; display_name: string; first_name: string; middle_name: string; last_name: string; alias: string; phone: string; kp_types: string[] };
type Mode = "new" | "existing";
type Stage = "client" | "enrollment" | "profile" | "visit" | "review";

const today = () => new Date().toISOString().slice(0, 10);
const Field = ({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) => <label className="outreach-field"><span className={required ? "outreach-required" : ""}>{label}</span>{children}</label>;
const Select = ({ value, onChange, children }: { value: string; onChange: (value: string) => void; children: React.ReactNode }) => <select value={value} onChange={(event) => onChange(event.target.value)}><option value="">Choose…</option>{children}</select>;
const YesNo = ({ value, onChange }: { value: string; onChange: (value: string) => void }) => <Select value={value} onChange={onChange}><option value="1">Yes</option><option value="0">No</option></Select>;

function normaliseDate(value: string) {
  const text = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{2})[/.\-](\d{2})[/.\-](\d{4})$/);
  if (!match) return "";
  return `${match[3]}-${match[2]}-${match[1]}`;
}

const DateInput = ({ value, onChange }: { value: string; onChange: (value: string) => void }) => <Input inputMode="numeric" placeholder="DD/MM/YYYY" value={value && /^\d{4}-/.test(value) ? `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}` : value} onChange={(event) => onChange(normaliseDate(event.target.value) || event.target.value)} />;

const ChoiceChecks = ({ values, onChange, options }: { values: string; onChange: (value: string) => void; options: [string, string][] }) => {
  const selected = new Set(values.split(",").filter(Boolean));
  return <div className="grid gap-2 sm:grid-cols-2">{options.map(([code, label]) => <label key={code} className="flex min-h-11 items-center gap-3 rounded-xl border px-3 py-2 text-sm"><Checkbox checked={selected.has(code)} onCheckedChange={(checked) => { if (checked) selected.add(code); else selected.delete(code); onChange([...selected].join(",")); }} />{label}</label>)}</div>;
};

const initialEnrollment = (staff: string): Values => ({ ce_date: today(), ce_implementing_partner: "PILS", ce_district: "", ce_hotspot: "1", ce_active: "1", ce_outreach_worker: staff, ce_last_name: "", ce_first_name: "", ce_middle_name_1: "", ce_middle_name_2: "", ce_middle_name_3: "", ce_alias: "", ce_dob: "", ce_gender_identity: "", ce_vision: "", ce_kp_type: "", ce_tel_primary: "", ce_contact_method: "", ce_risk_drug_alcohol_sex: "", ce_risk_violence_1m: "", ce_sw_age_started: "", ce_sw_sex_acts_1w: "", ce_sw_condom_use_1w: "", ce_msm_age_first_anal: "", ce_msm_receptive_anal_1w: "", ce_msm_condom_anal_1w: "", ce_pwid_age_first_inject: "", ce_pwid_injections_24h: "", ce_pwid_injections_1w: "", ce_pwid_shared_24h: "", ce_pwid_shared_1w: "" });
const initialProfile = (staff: string): Values => ({ ptp_start_date: today(), ptp_primary_reason: "", ptp_previous_use: "", ptp_previous_provider: "", ptp_medication: "", ptp_other_medication: "", ptp_regimen_notes: "", ptp_status: "1", ptp_ltfu: "0", ptp_effective_date: today(), ptp_recorded_by: staff, ptp_change_reason: "" });
const initialVisit = (staff: string): Values => ({ pv_visit_date: today(), pv_visit_purpose: "", pv_recorded_by: staff, pv_next_appointment_date: "", pv_followup_stage: "", pv_blood_draw_date: "", pv_tests_collected: "", pv_other_test_collected: "", pv_sample_reference: "", pv_blood_draw_notes: "", pv_hiv_result: "", pv_syphilis_result: "", pv_creatinine_result: "", pv_hbsag_result: "", pv_hcv_result: "", pv_sti_reported: "", pv_side_effects: "", pv_medication: "", pv_other_medication: "", pv_lot_number: "", pv_medication_dispensed: "", pv_prescription_months: "", pv_next_collection_date: "", pv_no_medication_reason: "", pv_physician: "", pv_physician_comments: "", pv_blood_test_date: "", pv_doctor_review_date: "", pv_syphilis_referral: "", pv_hcv_referral: "", pv_hbv_vaccination_status: "", pv_other_referral: "", pv_status_at_visit: "", pv_profile_updated: "" });

export default function PrepWorkflow({ staffName, initialUic, queueId, initialNew = false }: { staffName: string; initialUic?: string; queueId?: string; initialNew?: boolean }) {
  const [mode, setMode] = useState<Mode | null>(initialNew ? "new" : null);
  const [stage, setStage] = useState<Stage>("client");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [enrollment, setEnrollment] = useState<Values>(() => initialEnrollment(staffName));
  const [profile, setProfile] = useState<Values>(() => initialProfile(staffName));
  const [visit, setVisit] = useState<Values>(() => initialVisit(staffName));
  const [updateProfile, setUpdateProfile] = useState(false);
  const [uicResult, setUicResult] = useState<{ uic: string; status: "available" | "exists" | "error" } | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState("");
  const uic = mode === "new" ? generateUic(enrollment) : selected?.uic ?? "";
  const uicStatus = !uic ? "idle" : uicResult?.uic === uic ? uicResult.status : "checking";
  const setE = (key: string, value: string) => { setError(""); setEnrollment((current) => ({ ...current, [key]: value })); };
  const setP = (key: string, value: string) => { setError(""); setProfile((current) => ({ ...current, [key]: value, ...(key === "ptp_status" ? { ptp_ltfu: value === "2" ? "1" : "0" } : {}) })); };
  const setV = (key: string, value: string) => { setError(""); setVisit((current) => ({ ...current, [key]: value })); };

  useEffect(() => { fetch("/api/redcap/patients").then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error); setPatients(data); }).catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load clients.")).finally(() => setLoading(false)); }, []);
  useEffect(() => { if (!initialUic || !patients.length || selected) return; const patient = patients.find(item => item.uic === initialUic.toUpperCase()); if (patient) Promise.resolve().then(() => selectPatient(patient)); }, [initialUic, patients, selected]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (mode !== "new" || !uic) return;
    const controller = new AbortController();
    fetch(`/api/redcap/prep?uic=${encodeURIComponent(uic)}`, { signal: controller.signal }).then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error); if (!controller.signal.aborted) setUicResult({ uic, status: data.exists ? "exists" : "available" }); }).catch((reason: unknown) => { if ((reason as { name?: string }).name !== "AbortError") setUicResult({ uic, status: "error" }); });
    return () => controller.abort();
  }, [mode, uic]);

  const matches = useMemo(() => { const q = query.trim().toLowerCase(); return q ? patients.filter((patient) => patient.uic.toLowerCase().startsWith(q) || patient.first_name.toLowerCase().includes(q) || patient.last_name.toLowerCase().includes(q) || patient.alias.toLowerCase().includes(q)).slice(0, 12) : []; }, [patients, query]);
  const stages: Stage[] = mode === "new" ? ["client", "enrollment", "profile", "visit", "review"] : ["client", "visit", ...(updateProfile ? ["profile" as Stage] : []), "review"];

  async function selectPatient(patient: Patient) {
    setSelected(patient); setQuery(patient.uic); setMode("existing"); setError("");
    try {
      const response = await fetch(`/api/redcap/prep?uic=${encodeURIComponent(patient.uic)}`); const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setProfile({ ...initialProfile(staffName), ...(data.latestProfile ?? {}), ptp_effective_date: today(), ptp_recorded_by: staffName, ptp_change_reason: "" });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load the latest PrEP profile."); }
  }

  function validateStage() {
    setError("");
    if (stage === "client" && mode !== "new" && !selected) return setError("Select a client from the results or choose New client."), false;
    if (stage === "enrollment") {
      const required: [string, string][] = [["ce_date", "Enrollment date"], ["ce_outreach_worker", "Outreach worker"], ["ce_first_name", "First name"], ["ce_last_name", "Surname"], ["ce_dob", "Date of birth"], ["ce_gender_identity", "Gender identity"], ["ce_district", "District"], ["ce_kp_type", "Key population"]];
      const missing = required.filter(([key]) => !enrollment[key]?.trim()).map(([, label]) => label);
      if (missing.length) return setError(`Still required: ${missing.join(", ")}.`), false;
      if (!uic || uicStatus !== "available") return setError(uicStatus === "exists" ? "This UIC already exists. Use Existing client." : "Wait for the UIC availability check."), false;
    }
    if (stage === "profile") {
      const required: [string, string][] = [["ptp_effective_date", "Profile effective date"], ["ptp_recorded_by", "Profile recorded by"], ["ptp_start_date", "PrEP start date"], ["ptp_status", "Current programme status"]];
      const missing = required.filter(([key]) => !profile[key]?.trim()).map(([, label]) => label);
      if (missing.length) return setError(`Still required: ${missing.join(", ")}.`), false;
    }
    if (stage === "visit") {
      const missing = [["pv_visit_date", "Visit date"], ["pv_visit_purpose", "Visit purpose"], ["pv_recorded_by", "Visit recorded by"]].filter(([key]) => !visit[key]).map(([, label]) => label);
      if (missing.length) return setError(`Still required: ${missing.join(", ")}.`), false;
      const purposes = new Set(visit.pv_visit_purpose.split(","));
      if (purposes.has("1") && (!visit.pv_blood_draw_date || !visit.pv_tests_collected)) return setError("Blood draw date and tests collected are required."), false;
      if (purposes.has("2") && (!visit.pv_doctor_review_date || !visit.pv_physician)) return setError("Doctor review date and physician are required."), false;
      if (purposes.has("3") && !visit.pv_medication_dispensed && !visit.pv_no_medication_reason) return setError("Enter medication dispensed or the reason no medication was supplied."), false;
    }
    return true;
  }

  function move(direction: 1 | -1) {
    if (direction === 1 && !validateStage()) return;
    const index = stages.indexOf(stage);
    setStage(stages[Math.max(0, Math.min(stages.length - 1, index + direction))]);
  }

  async function submit() {
    const validationError = (mode === "new" ? validateFields(enrollment) : null) || validateFields(visit) || ((mode === "new" || updateProfile) ? validateFields(profile) : null);
    if (validationError) { setError(validationError); return; }
    setSubmitting(true); setError("");
    try {
      const response = await fetch("/api/redcap/prep", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, recordId: uic, enrollment: mode === "new" ? enrollment : undefined, profile: mode === "new" || updateProfile ? profile : undefined, includeProfile: mode === "new" || updateProfile, visit, queueId }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Unable to save the PrEP workflow.");
      setSuccess(`PrEP workflow saved for ${uic}.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save the PrEP workflow."); }
    finally { setSubmitting(false); }
  }

  if (success) return <div className="outreach-page mx-auto w-full max-w-3xl px-4 sm:px-6"><section className="outreach-card py-12 text-center"><Check className="mx-auto mb-4 size-12 text-green-700" /><h1 className="text-3xl font-bold">Workflow saved</h1><p className="mt-2 text-muted-foreground">{success}</p><Button className="mt-6" onClick={() => location.reload()}>Start another workflow</Button></section></div>;

  return <div className="outreach-page mx-auto w-full max-w-4xl px-4 sm:px-6">
    <div className="mb-6"><p className="text-sm font-bold uppercase tracking-widest text-primary">Field workflow</p><h1 className="mt-1 text-3xl font-bold sm:text-4xl">PrEP Workflow</h1><p className="mt-2 max-w-2xl text-muted-foreground">Enroll or find a client, maintain a dated PrEP treatment profile, and record each PrEP visit.</p></div>
    <ol className="mb-6 flex items-center gap-2 overflow-x-auto pb-1" aria-label="Progress">{stages.map((item, index) => <li key={item} className={`flex items-center gap-2 whitespace-nowrap text-sm font-bold ${stage === item ? "text-primary" : "text-muted-foreground"}`}><span className="outreach-step">{index + 1}</span>{{client:"Client",enrollment:"Enrollment",profile:"Treatment profile",visit:"PrEP visit",review:"Review"}[item]}{index < stages.length - 1 && <span aria-hidden className="mx-1 h-px w-5 bg-border" />}</li>)}</ol>
    {error && <div role="alert" className="mb-4 flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertCircle className="mt-0.5 size-5 shrink-0" />{error}</div>}
    {stage === "client" && <WorkflowClientChoice mode={mode} query={query} loading={loading} matches={matches} selected={selected} onQuery={(value) => { setQuery(value); setSelected(null); setMode(null); setError(""); }} onSelect={selectPatient} onNew={() => { setMode("new"); setSelected(null); setQuery(""); setProfile(initialProfile(staffName)); setError(""); }} />}
    {stage === "enrollment" && <EnrollmentForm values={enrollment} set={setE} uic={uic} />}
    {stage === "profile" && <ProfileForm values={profile} set={setP} isUpdate={mode === "existing"} patient={mode === "existing" ? { alias: selected?.alias, firstName: selected?.first_name, lastName: selected?.last_name, phone: selected?.phone, uic } : { alias: enrollment.ce_alias, firstName: enrollment.ce_first_name, lastName: enrollment.ce_last_name, phone: enrollment.ce_tel_primary, uic }} />}
    {stage === "visit" && <><PrepVisitForm values={visit} set={setV} patient={mode === "existing" ? { alias: selected?.alias, firstName: selected?.first_name, lastName: selected?.last_name, phone: selected?.phone, uic } : { alias: enrollment.ce_alias, firstName: enrollment.ce_first_name, lastName: enrollment.ce_last_name, phone: enrollment.ce_tel_primary, uic }} />{mode === "existing" && <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border bg-card p-4"><Checkbox checked={updateProfile} onCheckedChange={(checked) => setUpdateProfile(Boolean(checked))} /><span><strong className="block">{visit.pv_visit_purpose.split(",").includes("2") ? "Did the doctor change the PrEP regimen or programme status?" : "Update PrEP Treatment Profile"}</strong><span className="text-sm text-muted-foreground">Create a new complete, dated profile snapshot with this visit.</span></span></label>}</>}
    {stage === "review" && <Review uic={uic} mode={mode!} patient={selected} enrollment={enrollment} profile={profile} visit={visit} includeProfile={mode === "new" || updateProfile} />}
    {stage === "enrollment" && <div role="status" className="mt-4 rounded-xl bg-secondary p-3 text-sm">{!uic ? "Complete the identity fields to generate a UIC." : uicStatus === "available" ? "UIC is available. You can continue." : uicStatus === "exists" ? "This UIC already exists. Go back and select the existing client." : uicStatus === "error" ? "Unable to check this UIC in REDCap." : "Checking UIC availability in REDCap…"}</div>}
    <div className="mt-5 flex justify-between gap-3"><Button variant="outline" disabled={stage === "client" || submitting} onClick={() => move(-1)}><ArrowLeft />Back</Button>{stage !== "review" ? <Button disabled={stage === "client" && mode !== "new" && !selected} onClick={() => move(1)}>Continue<ArrowRight /></Button> : <Button disabled={submitting} onClick={submit}>{submitting ? "Saving to REDCap…" : "Submit to REDCap"}<Check /></Button>}</div>
  </div>;
}

function EnrollmentForm({ values: v, set, uic }: { values: Values; set: (key: string, value: string) => void; uic: string }) {
  return <section className="outreach-card grid gap-6"><div><h2 className="text-xl font-bold">Client enrollment</h2><p className="text-sm text-muted-foreground">Required identity, contact, and initial risk information.</p></div><div className="grid gap-4 sm:grid-cols-2">
    <Field label="Enrollment date" required><DateInput value={v.ce_date} onChange={(value) => set("ce_date", value)} /></Field><Field label="Outreach worker" required><Input value={v.ce_outreach_worker} onChange={(event) => set("ce_outreach_worker", event.target.value)} /></Field>
    <Field label="First name" required><Input value={v.ce_first_name} onChange={(event) => set("ce_first_name", event.target.value)} /></Field><Field label="Middle name 1"><Input value={v.ce_middle_name_1} onChange={(event) => set("ce_middle_name_1", event.target.value)} /></Field><Field label="Middle name 2"><Input value={v.ce_middle_name_2} onChange={(event) => set("ce_middle_name_2", event.target.value)} /></Field><Field label="Middle name 3"><Input value={v.ce_middle_name_3} onChange={(event) => set("ce_middle_name_3", event.target.value)} /></Field><Field label="Surname" required><Input value={v.ce_last_name} onChange={(event) => set("ce_last_name", event.target.value)} /></Field>
    <Field label="Alias"><Input value={v.ce_alias} onChange={(event) => set("ce_alias", event.target.value)} /></Field><Field label="Date of birth" required><DobInput value={v.ce_dob} onChange={(value) => set("ce_dob", value)} /></Field>
    <Field label="Gender identity" required><Select value={v.ce_gender_identity} onChange={(value) => set("ce_gender_identity", value)}><option value="1">Man</option><option value="2">Woman</option><option value="3">Transgender man</option><option value="4">Transgender woman</option><option value="5">Other</option><option value="9">Refuse to answer</option></Select></Field>
    <Field label="District" required><Select value={v.ce_district} onChange={(value) => set("ce_district", value)}>{["Port Louis","Pamplemousses","Rivière du Rempart","Flacq","Grand Port","Savanne","Plaines Wilhems","Moka","Black River"].map((label,index)=><option key={label} value={String(index+1)}>{label}</option>)}</Select></Field>
    <Field label="Primary phone"><Input type="tel" value={v.ce_tel_primary} onChange={(event) => set("ce_tel_primary", event.target.value)} /></Field><Field label="Vision"><Select value={v.ce_vision} onChange={(value) => set("ce_vision", value)}><option value="1">No difficulty</option><option value="2">Some difficulty</option><option value="3">A lot of difficulty</option><option value="4">Cannot see at all</option></Select></Field>
  </div><Field label="Key population" required><ChoiceChecks values={v.ce_kp_type} onChange={(value) => set("ce_kp_type", value)} options={[["1","Sex worker"],["2","MSM"],["3","PWID"],["4","PPWID"],["5","Transgender"],["6","Former PWID"],["7","General"],["8","Former Incarcerated People (FIP)"]]} /></Field>
  {uic && <div className="rounded-2xl bg-secondary p-4"><span className="text-xs font-bold uppercase tracking-wider">Generated UIC</span><strong className="mt-1 block text-xl tracking-wide">{uic}</strong></div>}</section>;
}

function ProfileForm({ values: v, set, isUpdate, patient }: { values: Values; set: (key: string, value: string) => void; isUpdate: boolean; patient: PatientSummaryDetails }) {
  return <section className="outreach-card grid gap-6"><div><h2 className="text-xl font-bold">PrEP Treatment Profile</h2><p className="text-sm text-muted-foreground">{isUpdate ? "The latest profile has been copied. Saving creates a new historical snapshot." : "Create the client’s initial treatment profile."}</p></div><PatientSummary patient={patient} /><div className="grid gap-4 sm:grid-cols-2">
    <Field label="Profile effective date" required><DateInput value={v.ptp_effective_date} onChange={(value) => set("ptp_effective_date", value)} /></Field><Field label="Profile recorded by" required><Input value={v.ptp_recorded_by} onChange={(event) => set("ptp_recorded_by", event.target.value)} /></Field>
    <Field label="PrEP start date" required><DateInput value={v.ptp_start_date} onChange={(value) => set("ptp_start_date", value)} /></Field><Field label="Current programme status" required><Select value={v.ptp_status} onChange={(value) => set("ptp_status", value)}>{[["1","Active"],["2","Lost to follow-up"],["3","Not interested"],["4","On demand"],["5","Abroad"],["6","Transferred to NDCCI"],["7","HIV positive"]].map(([code,label])=><option key={code} value={code}>{label}</option>)}</Select></Field>
    <Field label="Ever received PrEP/nPEP before?"><YesNo value={v.ptp_previous_use} onChange={(value) => set("ptp_previous_use", value)} /></Field>{v.ptp_previous_use === "1" && <Field label="Previous PrEP/nPEP provider"><Input value={v.ptp_previous_provider} onChange={(event) => set("ptp_previous_provider", event.target.value)} /></Field>}
    <Field label="Current PrEP medication"><Select value={v.ptp_medication} onChange={(value) => set("ptp_medication", value)}><option value="1">Truvada</option><option value="2">Dolutegravir</option><option value="6">Descovy</option><option value="99">Other</option></Select></Field>{v.ptp_medication === "99" && <Field label="Other current PrEP medication"><Input value={v.ptp_other_medication} onChange={(event) => set("ptp_other_medication", event.target.value)} /></Field>}
  </div><Field label="Primary reason for taking PrEP"><textarea value={v.ptp_primary_reason} onChange={(event) => set("ptp_primary_reason", event.target.value)} /></Field><Field label="PrEP regimen notes"><textarea value={v.ptp_regimen_notes} onChange={(event) => set("ptp_regimen_notes", event.target.value)} /></Field>{isUpdate && <Field label="Reason for profile update"><textarea value={v.ptp_change_reason} onChange={(event) => set("ptp_change_reason", event.target.value)} /></Field>}</section>;
}

export function PrepVisitForm({ values: v, set, patient, embedded = false }: { values: Values; set: (key: string, value: string) => void; patient: PatientSummaryDetails; embedded?: boolean }) {
  const purposes = new Set(v.pv_visit_purpose.split(",").filter(Boolean));
  const tests = new Set(v.pv_tests_collected.split(",").filter(Boolean));
  const updatePurposes = (value: string) => {
    const next = new Set(value.split(",").filter(Boolean));
    if (next.has("1") && !v.pv_blood_draw_date) set("pv_blood_draw_date", v.pv_visit_date);
    if (next.has("2") && !v.pv_doctor_review_date) set("pv_doctor_review_date", v.pv_visit_date);
    if (!next.has("1")) for (const key of ["pv_blood_draw_date", "pv_tests_collected", "pv_other_test_collected", "pv_sample_reference", "pv_blood_draw_notes"]) set(key, "");
    if (!next.has("2")) for (const key of ["pv_doctor_review_date", "pv_physician", "pv_hiv_result", "pv_syphilis_result", "pv_creatinine_result", "pv_hbsag_result", "pv_hcv_result", "pv_sti_reported", "pv_side_effects", "pv_status_at_visit", "pv_syphilis_referral", "pv_hcv_referral", "pv_hbv_vaccination_status", "pv_other_referral"]) set(key, "");
    if (!next.has("3")) for (const key of ["pv_medication", "pv_other_medication", "pv_lot_number", "pv_medication_dispensed", "pv_prescription_months", "pv_next_collection_date", "pv_no_medication_reason"]) set(key, "");
    set("pv_visit_purpose", value);
  };
  const resultChoices = <><option value="1">Negative / normal</option><option value="2">Positive / abnormal</option><option value="3">Indeterminate</option><option value="4">Result unavailable</option><option value="5">Not requested</option></>;
  return <section className={embedded ? "grid gap-6" : "outreach-card grid gap-6"}>{!embedded && <><div><h2 className="text-xl font-bold">PrEP Visit</h2><p className="text-sm text-muted-foreground">Select every purpose that applies. The relevant sections will open below.</p></div><PatientSummary patient={patient} /></>}
    <div className="grid gap-4 sm:grid-cols-2"><Field label="Visit date" required><DateInput value={v.pv_visit_date} onChange={(value) => set("pv_visit_date", value)} /></Field><Field label="Visit recorded by" required><Input value={v.pv_recorded_by} onChange={(event) => set("pv_recorded_by", event.target.value)} /></Field><Field label="Follow-up stage"><Select value={v.pv_followup_stage} onChange={(value) => set("pv_followup_stage", value)}>{[["0","M0"],["1","M1"],["3","M3"],["6","M6"],["9","M9"],["12","M12"],["15","M15"],["18","M18"],["21","M21"],["24","M24"],["27","M27"],["30","M30"],["33","M33"],["36","M36"],["99","Other"]].map(([code,label])=><option key={code} value={code}>{label}</option>)}</Select></Field><Field label="Next appointment date"><DateInput value={v.pv_next_appointment_date} onChange={(value) => set("pv_next_appointment_date", value)} /></Field></div>
    <Field label="Visit purpose" required><ChoiceChecks values={v.pv_visit_purpose} onChange={updatePurposes} options={[["1","Blood draw"],["2","Doctor review"],["3","Medication collection"]]} /></Field>
    {purposes.has("1") && <section className="rounded-2xl border p-4"><h3 className="font-bold">Blood draw</h3><p className="mt-1 text-sm text-muted-foreground">Record samples collected today. Results are entered during a doctor review.</p><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="Blood draw date"><DateInput value={v.pv_blood_draw_date} onChange={(value) => set("pv_blood_draw_date", value)} /></Field><Field label="Sample reference"><Input value={v.pv_sample_reference} onChange={(event) => set("pv_sample_reference", event.target.value)} /></Field></div><div className="mt-4"><Field label="Tests collected"><ChoiceChecks values={v.pv_tests_collected} onChange={(value) => set("pv_tests_collected", value)} options={[["1","HIV"],["2","Creatinine"],["3","Syphilis"],["4","HBsAg"],["5","HCV"],["99","Other"]]} /></Field></div>{tests.has("99") && <div className="mt-4"><Field label="Other test collected"><Input value={v.pv_other_test_collected} onChange={(event) => set("pv_other_test_collected", event.target.value)} /></Field></div>}<div className="mt-4"><Field label="Blood draw notes"><textarea value={v.pv_blood_draw_notes} onChange={(event) => set("pv_blood_draw_notes", event.target.value)} /></Field></div></section>}
    {purposes.has("2") && <section className="rounded-2xl border p-4"><h3 className="font-bold">Doctor review</h3><p className="mt-1 text-sm text-muted-foreground">Record available laboratory results and the clinical review.</p><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="Doctor review date"><DateInput value={v.pv_doctor_review_date} onChange={(value) => set("pv_doctor_review_date", value)} /></Field><Field label="Physician"><Input value={v.pv_physician} onChange={(event) => set("pv_physician", event.target.value)} /></Field><Field label="HIV test result"><Select value={v.pv_hiv_result} onChange={(value) => set("pv_hiv_result", value)}>{resultChoices}</Select></Field><Field label="Creatinine result"><Input value={v.pv_creatinine_result} onChange={(event) => set("pv_creatinine_result", event.target.value)} /></Field><Field label="Syphilis result"><Input value={v.pv_syphilis_result} onChange={(event) => set("pv_syphilis_result", event.target.value)} /></Field><Field label="HBsAg result"><Input value={v.pv_hbsag_result} onChange={(event) => set("pv_hbsag_result", event.target.value)} /></Field><Field label="HCV test result"><Select value={v.pv_hcv_result} onChange={(value) => set("pv_hcv_result", value)}>{resultChoices}</Select></Field><Field label="STI or syndrome reported"><Input value={v.pv_sti_reported} onChange={(event) => set("pv_sti_reported", event.target.value)} /></Field><Field label="Side effects"><Input value={v.pv_side_effects} onChange={(event) => set("pv_side_effects", event.target.value)} /></Field><Field label="Status at this visit"><Select value={v.pv_status_at_visit} onChange={(value) => set("pv_status_at_visit", value)}>{[["1","Active"],["2","Lost to follow-up"],["3","Not interested"],["4","On demand"],["5","Abroad"],["6","Transferred to NDCCI"],["7","HIV positive"]].map(([code,label])=><option key={code} value={code}>{label}</option>)}</Select></Field><Field label="Syphilis referral"><Select value={v.pv_syphilis_referral} onChange={(value) => set("pv_syphilis_referral", value)}><option value="0">No</option><option value="1">Yes</option><option value="2">Referred abroad</option></Select></Field><Field label="Hepatitis C referral"><YesNo value={v.pv_hcv_referral} onChange={(value) => set("pv_hcv_referral", value)} /></Field><Field label="Hepatitis B vaccination status"><Select value={v.pv_hbv_vaccination_status} onChange={(value) => set("pv_hbv_vaccination_status", value)}>{[["0","Not started"],["1","Dose 1"],["2","Dose 2"],["3","Dose 3"],["4","Completed"]].map(([code,label])=><option key={code} value={code}>{label}</option>)}</Select></Field><Field label="Other referral"><Input value={v.pv_other_referral} onChange={(event) => set("pv_other_referral", event.target.value)} /></Field></div></section>}
    {purposes.has("3") && <section className="rounded-2xl border p-4"><h3 className="font-bold">Medication collection</h3><p className="mt-1 text-sm text-muted-foreground">Record medication supplied during this visit.</p><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="PrEP medication"><Select value={v.pv_medication} onChange={(value) => set("pv_medication", value)}><option value="1">Truvada</option><option value="2">Dolutegravir</option><option value="6">Descovy</option></Select></Field><Field label="Other medication"><Input value={v.pv_other_medication} onChange={(event) => set("pv_other_medication", event.target.value)} /></Field><Field label="Lot number"><Input value={v.pv_lot_number} onChange={(event) => set("pv_lot_number", event.target.value)} /></Field><Field label="Medication dispensed"><Input type="number" min="0" value={v.pv_medication_dispensed} onChange={(event) => set("pv_medication_dispensed", event.target.value)} /></Field><Field label="Prescription duration (months)"><Input type="number" min="0" value={v.pv_prescription_months} onChange={(event) => set("pv_prescription_months", event.target.value)} /></Field><Field label="Next medication collection date"><DateInput value={v.pv_next_collection_date} onChange={(value) => set("pv_next_collection_date", value)} /></Field><Field label="Reason no medication was prescribed"><Input value={v.pv_no_medication_reason} onChange={(event) => set("pv_no_medication_reason", event.target.value)} /></Field></div></section>}
    <Field label="Visit notes"><textarea value={v.pv_physician_comments} onChange={(event) => set("pv_physician_comments", event.target.value)} /></Field>
  </section>;
}

function Review({ uic, mode, patient, enrollment, profile, visit, includeProfile }: { uic: string; mode: Mode; patient: Patient | null; enrollment: Values; profile: Values; visit: Values; includeProfile: boolean }) {
  const rows = (values: Values) => Object.entries(values).filter(([,value])=>value).map(([key,value])=><div key={key} className="flex justify-between gap-4 border-b py-2 text-sm"><span className="text-muted-foreground">{key.replace(/^(ce|ptp|pv)_/,"").replaceAll("_"," ")}</span><strong className="text-right">{value}</strong></div>);
  const details = mode === "new" ? { alias: enrollment.ce_alias, firstName: enrollment.ce_first_name, lastName: enrollment.ce_last_name, phone: enrollment.ce_tel_primary, uic } : { alias: patient?.alias, firstName: patient?.first_name, lastName: patient?.last_name, phone: patient?.phone, uic };
  return <section className="outreach-card grid gap-5"><div><h2 className="text-xl font-bold">Review PrEP workflow</h2><p className="text-sm text-muted-foreground">{patient?.display_name ?? enrollment.ce_first_name} · {uic}</p></div><PatientSummary patient={details} />{mode === "new" && <details><summary className="cursor-pointer font-bold">Client enrollment</summary><div className="mt-2">{rows(enrollment)}</div></details>}{includeProfile && <details open><summary className="cursor-pointer font-bold">PrEP Treatment Profile</summary><div className="mt-2">{rows(profile)}</div></details>}<details open><summary className="cursor-pointer font-bold">PrEP Visit</summary><div className="mt-2">{rows(visit)}</div></details></section>;
}
