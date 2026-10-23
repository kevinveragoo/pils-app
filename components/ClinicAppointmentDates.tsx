"use client";
import { clinicAppointmentDateFields } from "@/lib/clinic-appointment-fields";
import { clinicNextAppointment } from "@/lib/clinic-followup";
import definitions from "@/lib/instrument-forms.json";
import { Input } from "@/components/ui/input";

export default function ClinicAppointmentDates({ values, set }: { values: Record<string, string>; set: (name: string, value: string) => void }) {
  if (values.cnv_no_show === "1") return null;
  const nextDate = clinicNextAppointment(values);
  return <section className="grid gap-4 rounded-2xl border p-4" aria-labelledby="clinic-next-appointments">
    <h3 id="clinic-next-appointments" className="font-bold">Next appointments</h3>
    <div className="grid gap-4 sm:grid-cols-2">{clinicAppointmentDateFields.map(name => <label key={name} className="grid gap-2 text-sm font-medium" htmlFor={name}>
      {definitions.clinic_visit.find(field => field.name === name)!.label}
      <Input id={name} type="date" value={values[name] ?? ""} onChange={event => set(name, event.target.value)} />
    </label>)}</div>
    <label className="grid gap-2 text-sm font-medium" htmlFor="cnv_next_reason">Reason for next appointment<Input id="cnv_next_reason" value={values.cnv_next_reason ?? ""} onChange={event => set("cnv_next_reason", event.target.value)} /></label>
    <dl className="rounded-xl bg-muted p-3"><dt className="text-sm font-semibold">Next appointment date</dt><dd className="mt-1"><output aria-live="polite">{nextDate ? <time dateTime={nextDate}>{nextDate.split("-").reverse().join("/")}</time> : "—"}</output></dd></dl>
  </section>;
}
