"use client";

import { WorkflowClientChoice } from "@/components/WorkflowClientChoice";

import { DobInput } from "@/components/DobInput";

import { validateFields, numericAttributes } from "@/lib/redcap-validation";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

type Values = Record<string, string>;
type Patient = { record_id: string; uic: string; display_name: string; first_name: string; middle_name: string; last_name: string; alias: string; kp_types: string[] };
type Mode = "new" | "existing";

const today = () => new Date().toISOString().slice(0, 10);
const cleanLetters = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/gi, "").toUpperCase();

function normaliseDate(value: string) {
  const match = value.trim().match(/^(?:(\d{4})-(\d{2})-(\d{2})|(\d{2})[/-](\d{2})[/-](\d{4})|(\d{2})(\d{2})(\d{4}))$/);
  if (!match) return "";
  const year = Number(match[1] ?? match[6] ?? match[9]);
  const month = Number(match[2] ?? match[5] ?? match[8]);
  const day = Number(match[3] ?? match[4] ?? match[7]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}` : "";
}

const displayDate = (value: string) => {
  const date = normaliseDate(value);
  return date ? `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}` : value;
};

function makeUic(v: Values) {
  const gender = ({ "1": "M", "2": "F", "3": "T", "4": "T", "5": "O", "9": "R" } as Record<string, string>)[v.client_gender_identity] ?? "";
  const dob = (v.client_dob ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const first = cleanLetters(v.client_first_name ?? "").slice(0, 1);
  const middles = (v.client_middle_name ?? "").trim().split(/\s+/).filter(Boolean).map((name) => cleanLetters(name).slice(0, 1)).join("");
  const surname = cleanLetters(v.client_last_name ?? "");
  return gender && dob && first && surname ? `${gender}${dob[3]}${dob[2]}${dob[1]}${first}${middles}_${surname[0]}${surname.at(-1)}` : "";
}

const Field = ({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) => (
  <label className="outreach-field"><span className={required ? "outreach-required" : ""}>{label}</span>{children}</label>
);

const Select = ({ value, onChange, children, required }: { value: string; onChange: (value: string) => void; children: React.ReactNode; required?: boolean }) => (
  <select value={value} onChange={(event) => onChange(event.target.value)} required={required}><option value="">Choose…</option>{children}</select>
);

const YesNo = ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
  <Select value={value} onChange={onChange}><option value="1">Yes</option><option value="0">No</option></Select>
);

const DateInput = ({ value, onChange }: { value: string; onChange: (value: string) => void }) => {
  const sync = (raw: string) => onChange(normaliseDate(raw) || raw);
  return <Input inputMode="numeric" autoComplete="off" placeholder="DD/MM/YYYY" value={displayDate(value)} onChange={(event) => sync(event.target.value)} onBlur={(event) => sync(event.currentTarget.value)} />;
};

const ChoiceChecks = ({ values, onChange, options }: { values: string; onChange: (value: string) => void; options: [string, string][] }) => {
  const selected = new Set(values.split(",").filter(Boolean));
  return <div className="grid gap-2 sm:grid-cols-2">{options.map(([code, label]) => <label key={code} className="flex min-h-11 items-center gap-3 rounded-xl border px-3 py-2 text-sm"><Checkbox checked={selected.has(code)} onCheckedChange={(checked) => { if (checked) selected.add(code); else selected.delete(code); onChange([...selected].join(",")); }} />{label}</label>)}</div>;
};

const initialEnrollment = (): Values => ({ enrollment_date_11a07b: today(), implementing_partner_41a2cd: "PILS", district_979c1b: "", hotspot: "1", client_active: "1", district_other_f71f90: "", client_outreach_worker: "", client_last_name: "", client_first_name: "", client_middle_name: "", client_alias: "", client_dob: "", client_gender_identity: "", client_kp_type: "", phone_primary: "", preferred_contact_method: "", risk_drug_alcohol_sex: "", risk_violence_month: "", sw_age_started: "", sw_sex_acts_week: "", sw_condom_intimate: "", msm_age_first_anal: "", msm_receptive_anal_week: "", msm_condom_anal: "", pwid_age_first_inject: "", pwid_injections_24h_b12f8a: "", pwid_injections_week: "", pwid_shared_24h: "", pwid_shared_week: "" });
const initialCare = (): Values => ({ hiv_care_navigator: "", hiv_care_navigator_2: "", hiv_care_navigator_3: "", hiv_care_date: today(), hiv_currently_art: "", hiv_art_status_code: "", hiv_care_type: "", hiv_care_region: "", hiv_adherence_counsel: "", hiv_psychosocial: "", hiv_comprehensive_ref: "", hiv_male_condoms: "", hiv_female_condoms: "", hiv_lube: "", hiv_needles: "", hc_followup_needed: "", hc_followup_date: "", hc_notes: "" });
const initialMonitoring = (): Values => ({ hiv_monitor_date: today(), art_status: "", viral_load_detectable: "", cd4_date: "", cd4_level: "", vl_date: "", vl_level: "", hiv_monitor_notes: "" });

export default function HealthcareNavWorkflow() {
  const [mode, setMode] = useState<Mode | null>(null);
  const [step, setStep] = useState(1);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Patient | null>(null);
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [uicResult, setUicResult] = useState<{ uic: string; attempt: number; status: "available" | "exists" | "error" } | null>(null);
  const [uicAttempt, setUicAttempt] = useState(0);
  const [enrollment, setEnrollment] = useState<Values>(initialEnrollment);
  const [care, setCare] = useState<Values>(initialCare);
  const [monitoring, setMonitoring] = useState<Values>(initialMonitoring);
  const [newCd4, setNewCd4] = useState(false);
  const [newVl, setNewVl] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState("");

  const uic = mode === "new" ? makeUic(enrollment) : selected?.uic ?? "";
  const uicCheck = uicResult?.uic === uic && uicResult.attempt === uicAttempt ? uicResult.status : "idle";
  const setE = (key: string, value: string) => { setError("");  setEnrollment((current) => ({ ...current, [key]: value })); };
  const setC = (key: string, value: string) => { setError(""); setCare((current) => ({ ...current, [key]: value })); };
  const setM = (key: string, value: string) => { setError(""); setMonitoring((current) => ({ ...current, [key]: value })); };

  useEffect(() => { fetch("/api/redcap/patients").then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error); setPatients(data); }).catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load clients.")).finally(() => setLoadingPatients(false)); }, []);
  useEffect(() => {
    if (mode !== "new" || !uic) return;
    const controller = new AbortController();
    fetch(`/api/redcap/healthcare-nav?uic=${encodeURIComponent(uic)}`, { signal: controller.signal }).then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error); if (!controller.signal.aborted) setUicResult({ uic, attempt: uicAttempt, status: data.exists ? "exists" : "available" }); }).catch((reason: unknown) => { if ((reason as { name?: string }).name !== "AbortError") setUicResult({ uic, attempt: uicAttempt, status: "error" }); });
    return () => controller.abort();
  }, [mode, uic, uicAttempt]);

  const matches = useMemo(() => { const q = query.trim().toLowerCase(); if (!q) return []; return patients.filter((patient) => patient.uic.toLowerCase().startsWith(q) || patient.first_name.toLowerCase().includes(q) || patient.last_name.toLowerCase().includes(q) || patient.alias.toLowerCase().includes(q)).slice(0, 12); }, [patients, query]);
  const kp = new Set(enrollment.client_kp_type.split(",").filter(Boolean));

  function validateCurrent() {
    setError("");
    if (step === 1 && mode !== "new" && (mode !== "existing" || !selected)) return setError("Select a client from the results or choose New client."), false;
    if (step === 2 && mode === "existing" && !selected) return setError("Select an existing client."), false;
    if (step === 2 && mode === "new") {
      const required: [string, string][] = [["enrollment_date_11a07b", "Enrollment date"], ["client_outreach_worker", "Outreach worker"], ["client_first_name", "First name"], ["client_last_name", "Surname"], ["client_dob", "Date of birth"], ["client_gender_identity", "Gender identity"], ["district_979c1b", "District"], ["client_kp_type", "Key population"]];
      const missing = required.filter(([key]) => !enrollment[key]?.trim()).map(([, label]) => label);
      if (missing.length) return setError(`Still required: ${missing.join(", ")}.`), false;
      if (!normaliseDate(enrollment.client_dob) || !makeUic(enrollment)) return setError("The supplied identity details cannot generate a UIC."), false;
      if (uicCheck === "exists") return setError("This UIC already exists. Use Existing client."), false;
      if (uicCheck !== "available") return setError("Wait for the UIC availability check, then try again."), false;
    }
    if (step === 3) {
      const required: [string, string][] = [["hiv_care_navigator", "Healthcare navigator"], ["hiv_care_date", "Date of contact"], ["hiv_currently_art", "Currently on ART"], ["hiv_art_status_code", "HIV/ART status"]];
      const missing = required.filter(([key]) => !care[key]?.trim()).map(([, label]) => label);
      if (missing.length) return setError(`Still required: ${missing.join(", ")}.`), false;
    }
    if (step === 4 && (newCd4 || newVl)) {
      const missing = [!monitoring.hiv_monitor_date && "Monitoring date"].filter(Boolean);
      if (missing.length) return setError(`Still required: ${missing.join(", ")}.`), false;
    }
    return true;
  }

  function goForward() {
    if (!validateCurrent()) return;
    if (step === 2 && mode === "new" && enrollment.client_outreach_worker && !care.hiv_care_navigator) setC("hiv_care_navigator", enrollment.client_outreach_worker);
    setStep((current) => current === 1 && mode === "existing" ? 3 : current + 1);
  }

  async function submit() {
    const validationError = (mode === "new" ? validateFields(enrollment) : null) || validateFields(care) || (newCd4 || newVl ? validateFields(monitoring) : null);
    if (validationError) { setError(validationError); return; }
    setSubmitting(true); setError("");
    try {
      const response = await fetch("/api/redcap/healthcare-nav", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, recordId: uic, enrollment: mode === "new" ? enrollment : undefined, care, includeMonitoring: newCd4 || newVl, newCd4, newVl, monitoring }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to save the healthcare navigation workflow.");
      setSuccess(`Healthcare navigation saved for ${uic}.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save the healthcare navigation workflow."); }
    finally { setSubmitting(false); }
  }

  if (success) return <div className="outreach-page mx-auto w-full max-w-3xl px-4 sm:px-6"><section className="outreach-card py-12 text-center"><Check className="mx-auto mb-4 size-12 text-green-700" /><h1 className="text-3xl font-bold">Workflow saved</h1><p className="mt-2 text-muted-foreground">{success}</p><Button className="mt-6" onClick={() => location.reload()}>Start another workflow</Button></section></div>;

  return <div className="outreach-page mx-auto w-full max-w-4xl px-4 sm:px-6">
    <div className="mb-6"><p className="text-sm font-bold uppercase tracking-widest text-primary">Field workflow</p><h1 className="mt-1 text-3xl font-bold sm:text-4xl">Healthcare Nav Workflow</h1><p className="mt-2 max-w-2xl text-muted-foreground">Enroll or find a client, document HIV care support, add new clinical monitoring data when available, and review before saving.</p></div>
    <ol className="mb-6 flex items-center gap-2 overflow-x-auto pb-1" aria-label="Progress">{[{label: "Client", id: 1}, ...(mode === "existing" ? [] : [{label: "Enrollment", id: 2}]), {label: "HIV care", id: 3}, {label: "Monitoring", id: 4}, {label: "Review", id: 5}].map(({label, id}, index) => <li key={label} className={`flex items-center gap-2 whitespace-nowrap text-sm font-bold ${step === id ? "text-primary" : "text-muted-foreground"}`}><span className="outreach-step">{index + 1}</span>{label}{id < 5 && <span aria-hidden className="mx-1 h-px w-5 bg-border" />}</li>)}</ol>
    {error && <div role="alert" className="mb-4 flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertCircle className="mt-0.5 size-5 shrink-0" />{error}</div>}
    {step === 1 && <WorkflowClientChoice mode={mode} query={query} loading={loadingPatients} matches={matches} selected={selected} onQuery={(value) => { setQuery(value); setSelected(null); setMode(null); setError(""); }} onSelect={(patient) => { setSelected(patient); setQuery(patient.uic); setMode("existing"); setError(""); }} onNew={() => { setMode("new"); setSelected(null); setQuery(""); setError(""); }} />}
    {step === 2 && mode === "new" && <Enrollment values={enrollment} set={setE} uic={uic} kp={kp} />}
    {step === 3 && <CareSupport values={care} set={setC} patient={selected} />}
    {step === 4 && <Monitoring values={monitoring} set={setM} newCd4={newCd4} setNewCd4={setNewCd4} newVl={newVl} setNewVl={setNewVl} />}
    {step === 5 && <Review mode={mode!} uic={uic} patient={selected} enrollment={enrollment} care={care} monitoring={monitoring} includeMonitoring={newCd4 || newVl} newCd4={newCd4} newVl={newVl} />}
    {step === 2 && mode === "new" && uicCheck === "exists" && <div role="alert" className="mt-5 flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertCircle className="mt-0.5 size-5 shrink-0" />This UIC already exists. Use Existing client instead.</div>}
    {step === 2 && mode === "new" && <div role="status" className="mt-4 rounded-xl bg-secondary p-3 text-sm">
      {!uic ? "Complete the identity fields to generate a UIC." : uicCheck === "available" ? "UIC is available. You can continue." : uicCheck === "exists" ? "This UIC already exists. Go back and select the existing client." : uicCheck === "error" ? "Unable to check this UIC in REDCap." : "Checking UIC availability in REDCap…"}
      {uicCheck === "error" && <Button variant="outline" className="ml-3" onClick={() => { setError(""); setUicAttempt(attempt => attempt + 1); }}>Retry check</Button>}
    </div>}
    <div className="mt-5 flex justify-between gap-3"><Button variant="outline" disabled={step === 1 || submitting} onClick={() => { setError(""); setStep((current) => current === 3 && mode === "existing" ? 1 : current - 1); }}><ArrowLeft />Back</Button>{step < 5 ? <Button disabled={(step === 1 && mode !== "new" && !selected) || (step === 2 && mode === "new" && uicCheck !== "available")} onClick={goForward}>Continue<ArrowRight /></Button> : <Button disabled={submitting} onClick={submit}>{submitting ? "Saving…" : "Submit to REDCap"}<Check /></Button>}</div>
  </div>;
}

function Enrollment({ values: v, set, uic, kp }: { values: Values; set: (key: string, value: string) => void; uic: string; kp: Set<string> }) {
  const updateKp = (value: string) => { const selected = new Set(value.split(",").filter(Boolean)); set("client_kp_type", value); if (!selected.has("1")) for (const key of ["sw_age_started", "sw_sex_acts_week", "sw_condom_intimate"]) set(key, ""); if (!selected.has("2") && !selected.has("5")) for (const key of ["msm_age_first_anal", "msm_receptive_anal_week", "msm_condom_anal"]) set(key, ""); if (!selected.has("3") && !selected.has("4")) for (const key of ["pwid_age_first_inject", "pwid_injections_24h_b12f8a", "pwid_injections_week", "pwid_shared_24h", "pwid_shared_week"]) set(key, ""); };
  return <section className="outreach-card grid gap-6"><div><h2 className="text-xl font-bold">Client enrollment</h2><p className="text-sm text-muted-foreground">Required identity, contact, and initial risk information.</p></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Enrollment date" required><DateInput value={v.enrollment_date_11a07b} onChange={(value) => set("enrollment_date_11a07b", value)} /></Field><Field label="Outreach worker" required><Input value={v.client_outreach_worker} onChange={(event) => set("client_outreach_worker", event.target.value)} /></Field><Field label="First name" required><Input value={v.client_first_name} onChange={(event) => set("client_first_name", event.target.value)} /></Field><Field label="Middle name(s)"><Input value={v.client_middle_name} onChange={(event) => set("client_middle_name", event.target.value)} /></Field><Field label="Surname" required><Input value={v.client_last_name} onChange={(event) => set("client_last_name", event.target.value)} /></Field><Field label="Alias"><Input value={v.client_alias} onChange={(event) => set("client_alias", event.target.value)} /></Field><Field label="Date of birth" required><DobInput value={v.client_dob} onChange={(value) => set("client_dob", value)} /></Field><Field label="Gender identity" required><Select value={v.client_gender_identity} onChange={(value) => set("client_gender_identity", value)}><option value="1">Man</option><option value="2">Woman</option><option value="3">Transgender man</option><option value="4">Transgender woman</option><option value="5">Other</option><option value="9">Refuse to answer</option></Select></Field><Field label="District" required><Select value={v.district_979c1b} onChange={(value) => set("district_979c1b", value)}>{["Port Louis", "Pamplemousses", "Rivière du Rempart", "Flacq", "Grand Port", "Savanne", "Plaines Wilhems", "Moka", "Black River"].map((label, index) => <option key={label} value={String(index + 1)}>{label}</option>)}<option value="99">Other</option></Select></Field>{v.district_979c1b === "99" && <Field label="Other district"><Input value={v.district_other_f71f90} onChange={(event) => set("district_other_f71f90", event.target.value)} /></Field>}<Field label="Primary phone"><Input type="tel" value={v.phone_primary} onChange={(event) => set("phone_primary", event.target.value)} /></Field></div><Field label="Key population" required><ChoiceChecks values={v.client_kp_type} onChange={updateKp} options={[["1", "Sex worker"], ["2", "MSM"], ["3", "PWID"], ["4", "PPWID"], ["5", "Transgender"], ["6", "Former PWID"], ["7", "General"]]} /></Field>{uic && <div className="rounded-2xl bg-secondary p-4"><span className="text-xs font-bold uppercase tracking-wider text-secondary-foreground">Generated UIC</span><strong className="mt-1 block text-xl tracking-wide">{uic}</strong></div>}<details className="rounded-2xl border p-4"><summary className="cursor-pointer font-bold">Initial risk snapshot</summary><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="Drugs/alcohol during sex last week"><YesNo value={v.risk_drug_alcohol_sex} onChange={(value) => set("risk_drug_alcohol_sex", value)} /></Field><Field label="Violence in the last month"><YesNo value={v.risk_violence_month} onChange={(value) => set("risk_violence_month", value)} /></Field>{kp.has("1") && <><Field label="Age when sex work began"><Input type="number" {...numericAttributes("sw_age_started")} value={v.sw_age_started} onChange={(event) => set("sw_age_started", event.target.value)} /></Field><Field label="Sex acts last week"><Input type="number" {...numericAttributes("sw_sex_acts_week")} value={v.sw_sex_acts_week} onChange={(event) => set("sw_sex_acts_week", event.target.value)} /></Field><Field label="Condom every time with intimate partner"><YesNo value={v.sw_condom_intimate} onChange={(value) => set("sw_condom_intimate", value)} /></Field></>}{(kp.has("2") || kp.has("5")) && <><Field label="Age at first anal sex"><Input type="number" {...numericAttributes("msm_age_first_anal")} value={v.msm_age_first_anal} onChange={(event) => set("msm_age_first_anal", event.target.value)} /></Field><Field label="Receptive anal sex acts last week"><Input type="number" {...numericAttributes("msm_receptive_anal_week")} value={v.msm_receptive_anal_week} onChange={(event) => set("msm_receptive_anal_week", event.target.value)} /></Field><Field label="Condom every time during anal sex"><YesNo value={v.msm_condom_anal} onChange={(value) => set("msm_condom_anal", value)} /></Field></>}{(kp.has("3") || kp.has("4")) && <><Field label="Age at first injection"><Input type="number" {...numericAttributes("pwid_age_first_inject")} value={v.pwid_age_first_inject} onChange={(event) => set("pwid_age_first_inject", event.target.value)} /></Field><Field label="Injections in the last 24 hours"><Input type="number" {...numericAttributes("pwid_injections_24h_b12f8a")} value={v.pwid_injections_24h_b12f8a} onChange={(event) => set("pwid_injections_24h_b12f8a", event.target.value)} /></Field><Field label="Injections last week"><Input type="number" {...numericAttributes("pwid_injections_week")} value={v.pwid_injections_week} onChange={(event) => set("pwid_injections_week", event.target.value)} /></Field><Field label="Shared equipment in the last 24 hours"><Input type="number" {...numericAttributes("pwid_shared_24h")} value={v.pwid_shared_24h} onChange={(event) => set("pwid_shared_24h", event.target.value)} /></Field><Field label="Shared equipment last week"><Input type="number" {...numericAttributes("pwid_shared_week")} value={v.pwid_shared_week} onChange={(event) => set("pwid_shared_week", event.target.value)} /></Field></>}</div></details></section>;
}

function CareSupport({ values: v, set, patient }: { values: Values; set: (key: string, value: string) => void; patient: Patient | null }) {
  return <section className="outreach-card grid gap-5"><div><h2 className="text-xl font-bold">HIV Care Support</h2>{patient && <p className="text-sm text-muted-foreground">For {patient.display_name} · {patient.uic}</p>}</div><details open className="rounded-2xl border p-4"><summary className="cursor-pointer font-bold">HIV CARE &amp; SUPPORT DETAILS</summary><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="Healthcare navigator" required><Input value={v.hiv_care_navigator} onChange={(event) => set("hiv_care_navigator", event.target.value)} /></Field><Field label="Healthcare navigator 2"><Input value={v.hiv_care_navigator_2} onChange={(event) => set("hiv_care_navigator_2", event.target.value)} /></Field><Field label="Healthcare navigator / driver"><Input value={v.hiv_care_navigator_3} onChange={(event) => set("hiv_care_navigator_3", event.target.value)} /></Field><Field label="Date of contact" required><DateInput value={v.hiv_care_date} onChange={(value) => set("hiv_care_date", value)} /></Field><Field label="Currently on ART?" required><YesNo value={v.hiv_currently_art} onChange={(value) => set("hiv_currently_art", value)} /></Field><Field label="HIV/ART status" required><Select value={v.hiv_art_status_code} onChange={(value) => set("hiv_art_status_code", value)}><option value="1">Newly diagnosed</option><option value="2">Known HIV positive</option><option value="3">Lost to follow-up</option></Select></Field></div></details><details open className="rounded-2xl border p-4"><summary className="cursor-pointer font-bold">ACCOMPANIMENT DETAILS</summary><div className="mt-4 grid gap-4"><Field label="Accompaniment type"><ChoiceChecks values={v.hiv_care_type} onChange={(value) => set("hiv_care_type", value)} options={[["1", "Social Security Board"], ["2", "Eye Hospital"], ["3", "Orthopaedic Hospital"], ["4", "DCCI"], ["5", "Banian"], ["6", "Methadone Centre"], ["7", "Hospital visit"], ["8", "Home visit"], ["9", "4BAZ"]]} /></Field><Field label="Accompaniment region"><Select value={v.hiv_care_region} onChange={(value) => set("hiv_care_region", value)}><option value="1">Jeetoo</option><option value="3">Candos</option><option value="4">SSRN</option><option value="5">Flacq</option><option value="6">Beau Bassin</option><option value="7">Port Louis</option></Select></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="ART adherence counselling provided?"><YesNo value={v.hiv_adherence_counsel} onChange={(value) => set("hiv_adherence_counsel", value)} /></Field><Field label="Psychosocial support/referrals provided?"><YesNo value={v.hiv_psychosocial} onChange={(value) => set("hiv_psychosocial", value)} /></Field><Field label="Referral made to comprehensive HIV care?"><YesNo value={v.hiv_comprehensive_ref} onChange={(value) => set("hiv_comprehensive_ref", value)} /></Field></div></div></details><details className="rounded-2xl border p-4"><summary className="cursor-pointer font-bold">COMMODITIES PROVIDED</summary><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="Male condoms"><Input type="number" {...numericAttributes("hiv_male_condoms")} value={v.hiv_male_condoms} onChange={(event) => set("hiv_male_condoms", event.target.value)} /></Field><Field label="Female condoms"><Input type="number" {...numericAttributes("hiv_female_condoms")} value={v.hiv_female_condoms} onChange={(event) => set("hiv_female_condoms", event.target.value)} /></Field><Field label="Lubricant"><Input type="number" {...numericAttributes("hiv_lube")} value={v.hiv_lube} onChange={(event) => set("hiv_lube", event.target.value)} /></Field><Field label="Needles/syringes"><Input type="number" {...numericAttributes("hiv_needles")} value={v.hiv_needles} onChange={(event) => set("hiv_needles", event.target.value)} /></Field></div></details><details open className="rounded-2xl border p-4"><summary className="cursor-pointer font-bold">FOLLOW-UP</summary><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="Follow-up required?"><YesNo value={v.hc_followup_needed} onChange={(value) => set("hc_followup_needed", value)} /></Field><Field label="Planned follow-up date"><DateInput value={v.hc_followup_date} onChange={(value) => set("hc_followup_date", value)} /></Field></div><div className="mt-4"><Field label="Healthcare navigator notes"><textarea value={v.hc_notes} onChange={(event) => set("hc_notes", event.target.value)} /></Field></div></details></section>;
}

function Monitoring({ values: v, set, newCd4, setNewCd4, newVl, setNewVl }: { values: Values; set: (key: string, value: string) => void; newCd4: boolean; setNewCd4: (value: boolean) => void; newVl: boolean; setNewVl: (value: boolean) => void }) {
  const included = newCd4 || newVl;
  return <section className="outreach-card grid gap-5"><div><h2 className="text-xl font-bold">New clinical monitoring data</h2><p className="text-sm text-muted-foreground">Is there a new CD4 or viral-load result to record from this contact?</p></div><div className="grid gap-3 sm:grid-cols-2"><label className={`flex min-h-16 items-center gap-3 rounded-2xl border p-4 ${newCd4 ? "border-primary bg-secondary" : ""}`}><Checkbox checked={newCd4} onCheckedChange={(checked) => { setNewCd4(checked === true); if (!checked) { set("cd4_date", ""); set("cd4_level", ""); } }} /><strong>New CD4 data</strong></label><label className={`flex min-h-16 items-center gap-3 rounded-2xl border p-4 ${newVl ? "border-primary bg-secondary" : ""}`}><Checkbox checked={newVl} onCheckedChange={(checked) => { setNewVl(checked === true); if (!checked) { set("vl_date", ""); set("vl_level", ""); } }} /><strong>New viral-load data</strong></label></div>{!included && <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">Leave both options unselected when there is no new laboratory data. No HIV Treatment Monitoring instance will be created.</p>}{included && <div className="grid gap-5"><details open className="rounded-2xl border p-4"><summary className="cursor-pointer font-bold">HIV CLINICAL MONITORING</summary><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="Monitoring date" required><DateInput value={v.hiv_monitor_date} onChange={(value) => set("hiv_monitor_date", value)} /></Field><Field label="Viral load status"><Select value={v.viral_load_detectable} onChange={(value) => set("viral_load_detectable", value)}><option value="1">Detectable</option><option value="2">Undetectable</option><option value="3">Indeterminate</option><option value="4">Invalid</option></Select></Field><Field label="ART status"><Select value={v.art_status} onChange={(value) => set("art_status", value)}><option value="1">Active</option><option value="2">Stopped</option><option value="3">LTFU</option><option value="4">Transfer in</option><option value="5">Transfer out</option></Select></Field></div></details>{newCd4 && <details open className="rounded-2xl border p-4"><summary className="cursor-pointer font-bold">CD4</summary><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="CD4 test date"><DateInput value={v.cd4_date} onChange={(value) => set("cd4_date", value)} /></Field><Field label="CD4 level"><Input type="number" {...numericAttributes("cd4_level")} value={v.cd4_level} onChange={(event) => set("cd4_level", event.target.value)} /></Field></div></details>}{newVl && <details open className="rounded-2xl border p-4"><summary className="cursor-pointer font-bold">VIRAL LOAD</summary><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="Viral-load test date"><DateInput value={v.vl_date} onChange={(value) => set("vl_date", value)} /></Field><Field label="Viral-load level (copies/mL)"><Input type="number" {...numericAttributes("vl_level")} value={v.vl_level} onChange={(event) => set("vl_level", event.target.value)} /></Field></div></details>}<Field label="Monitoring notes"><textarea value={v.hiv_monitor_notes} onChange={(event) => set("hiv_monitor_notes", event.target.value)} /></Field></div>}</section>;
}

function Review({ mode, uic, patient, enrollment, care, monitoring, includeMonitoring, newCd4, newVl }: { mode: Mode; uic: string; patient: Patient | null; enrollment: Values; care: Values; monitoring: Values; includeMonitoring: boolean; newCd4: boolean; newVl: boolean }) {
  const client = mode === "new" ? `${enrollment.client_first_name} ${enrollment.client_last_name}`.trim() : patient?.display_name;
  const rows: [string, string][] = [["Client", client ?? ""], ["UIC", uic], ["Care contact date", displayDate(care.hiv_care_date)], ["Healthcare navigator", care.hiv_care_navigator], ["Healthcare navigator 2", care.hiv_care_navigator_2], ["Healthcare navigator / driver", care.hiv_care_navigator_3], ["Currently on ART", care.hiv_currently_art === "1" ? "Yes" : "No"], ["HIV/ART status", ({ "1": "Newly diagnosed", "2": "Known HIV positive", "3": "Lost to follow-up" } as Values)[care.hiv_art_status_code] ?? ""], ["Follow-up", care.hc_followup_needed === "1" ? displayDate(care.hc_followup_date) : "Not required"], ["Treatment monitoring", includeMonitoring ? [newCd4 && "CD4", newVl && "Viral load"].filter(Boolean).join(" and ") : "No new laboratory data"]];
  if (includeMonitoring) rows.push(["Monitoring date", displayDate(monitoring.hiv_monitor_date)], ["ART status", ({ "1": "Active", "2": "Stopped", "3": "LTFU", "4": "Transfer in", "5": "Transfer out" } as Values)[monitoring.art_status] ?? "Not recorded"]);
  if (newCd4) rows.push(["CD4 result", `${monitoring.cd4_level} · ${displayDate(monitoring.cd4_date)}`]);
  if (newVl) rows.push(["Viral-load result", `${monitoring.vl_level} copies/mL · ${displayDate(monitoring.vl_date)}`]);
  return <section className="outreach-card"><p className="text-sm font-bold uppercase tracking-widest text-primary">Final check</p><h2 className="mt-1 text-2xl font-bold">Review before submitting</h2><dl className="mt-5 grid gap-3 sm:grid-cols-2">{rows.map(([label, value]) => <div key={label} className="rounded-2xl bg-muted p-4"><dt className="text-xs font-bold uppercase text-muted-foreground">{label}</dt><dd className="mt-1 font-semibold">{value || "Not recorded"}</dd></div>)}</dl><p className="mt-5 text-sm text-muted-foreground">Submitting will save all included instruments to REDCap in one request.</p></section>;
}
