"use client";
import { prepAppointmentDateFields } from "@/lib/clinic-appointment-fields";
import { prepNextAppointment } from "@/lib/prep-followup";
import definitions from "@/lib/instrument-forms.json";
import { Input } from "@/components/ui/input";

export default function PrepAppointmentDates({ values, set }: { values: Record<string, string>; set: (name: string, value: string) => void }) {
  const nextDate = prepNextAppointment(values);
  return <section className="grid gap-4 rounded-2xl border p-4" aria-labelledby="prep-next-appointments">
    <h3 id="prep-next-appointments" className="font-bold">Next appointments</h3>
    <div className="grid gap-4 sm:grid-cols-2">{prepAppointmentDateFields.map(name => <label key={name} className="grid gap-2 text-sm font-medium" htmlFor={name}>
      {definitions.prep_visit.find(field => field.name === name)!.label}
      <Input id={name} type="date" value={values[name] ?? ""} onChange={event => set(name, event.target.value)} />
    </label>)}</div>
    <dl className="rounded-xl bg-muted p-3"><dt className="text-sm font-semibold">Next appointment date</dt><dd className="mt-1"><output aria-live="polite">{nextDate ? <time dateTime={nextDate}>{nextDate.split("-").reverse().join("/")}</time> : "—"}</output></dd></dl>
  </section>;
}
