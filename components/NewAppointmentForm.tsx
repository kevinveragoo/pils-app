"use client";
import { useEffect, useState } from "react";
import { appointmentTypes, type AppointmentCounts } from "@/lib/clinic-appointments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function NewAppointmentForm({ recordId, onSaved }: { recordId: string; onSaved: () => void }) {
  const [type, setType] = useState("");
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [countResult, setCountResult] = useState<{ date: string; counts: AppointmentCounts } | null>(null);
  const [countError, setCountError] = useState("");
  const [countRetry, setCountRetry] = useState(0);
  const counts = countResult?.date === date ? countResult.counts : null;
  const loadingCounts = Boolean(date && !counts && !countError);
  useEffect(() => {
    if (!date) return;
    const controller = new AbortController();
    fetch(`/api/redcap/appointments?date=${encodeURIComponent(date)}`, { cache: "no-store", signal: controller.signal }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "Unable to load appointment counts.");
      if (!controller.signal.aborted) setCountResult(result);
    }).catch(reason => { if (!controller.signal.aborted) setCountError(reason instanceof Error ? reason.message : "Unable to load appointment counts."); });
    return () => controller.abort();
  }, [date, countRetry]);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Indian/Mauritius", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!type || !date) { setError("Choose an appointment type and date."); return; }
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/redcap/appointments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recordId, appointmentType: type, appointmentDate: date }) });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "Unable to save the appointment.");
      setSaved(true); setCountResult(null); setCountRetry(value => value + 1); onSaved();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save the appointment."); }
    finally { setSaving(false); }
  }
  return <section className="outreach-card"><h2 className="text-xl font-bold">Book an appointment</h2><form className="mt-5 grid gap-5" onSubmit={submit}>
    <label className="grid max-w-sm gap-2 font-semibold">Appointment date<Input type="date" required min={today} value={date} disabled={saving || saved} onChange={event => { setDate(event.target.value); setType(""); setCountResult(null); setCountError(""); setError(""); }} /></label>
    <fieldset disabled={saving || saved || !date || !counts} aria-busy={loadingCounts}><legend className="mb-3 font-semibold">Appointment type</legend><div className="flex flex-wrap gap-2">{appointmentTypes.map(option => <Button key={option.value} type="button" variant={type === option.value ? "default" : "outline"} aria-pressed={type === option.value} onClick={() => { setType(option.value); setError(""); }}>{option.label}{date && <span className="appointment-count-badge">{counts ? counts[option.value] : "…"}</span>}</Button>)}</div></fieldset>
    {!date && <p className="text-sm text-muted-foreground">Choose a date to see appointment counts.</p>}
    {loadingCounts && <p role="status" className="text-sm text-muted-foreground">Loading appointment counts…</p>}
    {counts && <p className="text-sm text-muted-foreground">Counts show clients booked for this date, including clinic and PrEP appointments.</p>}
    {countError && <div role="alert" className="flex items-center gap-3 text-sm text-destructive"><p>{countError}</p><Button type="button" variant="outline" onClick={() => { setCountError(""); setCountRetry(value => value + 1); }}>Retry</Button></div>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {saved ? <div role="status" className="grid justify-items-start gap-3"><p>Appointment saved.</p><Button type="button" variant="outline" onClick={() => { setSaved(false); setType(""); setDate(""); setCountResult(null); setCountError(""); }}>Book another appointment</Button></div> : <div><Button type="submit" disabled={saving || !type || !date}>{saving ? "Saving…" : "Submit appointment"}</Button></div>}
  </form></section>;
}
