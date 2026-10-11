"use client";

import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PatientSummary } from "@/components/PatientSummary";
import { sortLookupRows, type LookupSort, type LookupSection } from "@/lib/record-lookup";

type Patient = { uic: string; display_name: string; first_name: string; middle_name: string; last_name: string; alias: string; patient_code: string; phone: string };
type RecordView = { uic: string; sections: LookupSection[] };

export default function RecordLookup() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Patient | null>(null);
  const [record, setRecord] = useState<RecordView | null>(null);
  const [loadingClients, setLoadingClients] = useState(true);
  const [loadingRecord, setLoadingRecord] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/redcap/patients", { signal: controller.signal, cache: "no-store" }).then(async response => {
      const data = await response.json(); if (!response.ok) throw Error("Unable to load clients.");
      setPatients(data);
    }).catch(reason => { if (reason.name !== "AbortError") setError("Unable to load clients."); })
      .finally(() => { if (!controller.signal.aborted) setLoadingClients(false); });
    return () => controller.abort();
  }, [retry]);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    fetch(`/api/redcap/lookup?uic=${encodeURIComponent(selected.uic)}`, { signal: controller.signal, cache: "no-store" }).then(async response => {
      const data = await response.json(); if (!response.ok) throw Error(data.error || "Unable to load the record from REDCap.");
      if (!controller.signal.aborted) setRecord(data);
    }).catch(reason => { if (reason.name !== "AbortError") setError(reason.message); })
      .finally(() => { if (!controller.signal.aborted) setLoadingRecord(false); });
    return () => controller.abort();
  }, [selected, retry]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return patients.filter(patient => [patient.uic, patient.display_name, patient.alias, patient.patient_code, `${patient.first_name} ${patient.middle_name} ${patient.last_name}`].some(value => value?.toLowerCase().includes(q))).slice(0, 20);
  }, [patients, query]);
  return <div className="outreach-page mx-auto grid w-full max-w-6xl gap-5 px-4 sm:px-6">
    <div><h1 className="text-3xl font-bold">Lookup</h1><p className="mt-2 text-muted-foreground">Search for a client to view their complete REDCap record.</p></div>
    <section className="outreach-card">
      <h2 className="text-xl font-bold">Choose a client</h2>
      <label className="mt-5 grid max-w-xl gap-2 font-semibold">Search by UIC, name, or patient code
        <Input autoComplete="off" placeholder="Enter UIC, name, or patient code" value={query} onChange={event => { setQuery(event.target.value); setSelected(null); setRecord(null); setLoadingRecord(false); setError(""); }} />
      </label>
      {loadingClients ? <p role="status" className="mt-3 text-sm text-muted-foreground">Loading clients…</p> : query.trim() && !selected && <div className="mt-3 max-h-64 max-w-xl overflow-y-auto rounded-xl border">
        {matches.length ? <ul aria-label="Matching REDCap clients" className="divide-y">{matches.map(patient => <li key={patient.uic}><button type="button" className="w-full p-3 text-left hover:bg-secondary focus-visible:bg-secondary" onClick={() => { setSelected(patient); setQuery(patient.uic); setRecord(null); setError(""); setLoadingRecord(true); }}><strong className="block">{patient.uic}</strong><span className="block text-sm text-muted-foreground">{patient.display_name}{patient.alias ? ` · ${patient.alias}` : ""}</span>{patient.patient_code && <span className="block text-sm">Patient code: {patient.patient_code}</span>}</button></li>)}</ul> : <p role="status" className="p-3 text-sm text-muted-foreground">No matching client. Try another UIC, name, or patient code.</p>}
      </div>}
      {selected && <PatientSummary className="mt-5" patient={{ uic: selected.uic, firstName: selected.first_name, lastName: selected.last_name, alias: selected.alias, phone: selected.phone }} />}
    </section>
    {error && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}<Button variant="outline" className="ml-3" onClick={() => { setError(""); setRecord(null); if (selected) setLoadingRecord(true); else setLoadingClients(true); setRetry(value => value + 1); }}>Retry</Button></div>}
    {loadingRecord && <p role="status" className="p-4">Loading record…</p>}
    {record && record.uic === selected?.uic && <>
      <p className="text-sm text-muted-foreground">Read only · Data grouped by instrument</p>
      {record.sections.filter(section => !section.repeating).map(section => <details key={`${record.uic}-${section.name}`} open={section.hasData} className="outreach-card">
        <summary className="cursor-pointer text-xl font-bold">{section.label}</summary>
        {section.rows.map((row, index) => <div key={`${row.event}-${index}`} className="mt-5">{row.event && <p className="mb-3 font-semibold">{row.event}</p>}<dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{section.columns.map((field, fieldIndex) => <div key={field.name} className="min-w-0 rounded-xl bg-muted p-3"><dt className="text-sm font-semibold" title={field.name}>{field.label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm">{row.values[fieldIndex] || "—"}</dd></div>)}</dl></div>)}
      </details>)}
      <h2 className="mt-3 text-2xl font-bold">Repeating instruments</h2>
      {record.sections.filter(section => section.repeating).map(section => <RepeatTable key={`${record.uic}-${section.name}`} section={section} />)}
    </>}
  </div>;
}

function RepeatTable({ section }: { section: LookupSection }) {
  const [sort, setSort] = useState<LookupSort>({ column: "instance", direction: "ascending" });
  const rows = useMemo(() => sortLookupRows(section, sort), [section, sort]);
  const hasEvent = section.rows.some(row => row.event);
  function header(name: string, label: string) {
    const active = sort.column === name;
    return <th key={name} scope="col" aria-sort={active ? sort.direction : "none"} title={name} className="min-w-32 max-w-72 p-3 align-top">
      <button type="button" className="flex w-full items-start gap-2 rounded text-left font-semibold hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary" onClick={() => setSort(current => ({ column: name, direction: current.column === name && current.direction === "ascending" ? "descending" : "ascending" }))}>
        <span>{label}</span><span aria-hidden="true">{active ? sort.direction === "ascending" ? "↑" : "↓" : "↕"}</span>
        <span className="sr-only">{active && sort.direction === "ascending" ? "Sort descending" : "Sort ascending"}</span>
      </button>
    </th>;
  }
  return <details open={section.hasData} className="outreach-card min-w-0">
    <summary className="cursor-pointer text-xl font-bold">{section.label} <span className="text-sm font-normal text-muted-foreground">({section.rows.length})</span></summary>
    {rows.length ? <>
      <p className="mt-4 text-sm text-muted-foreground">Select a column heading to sort; select it again to reverse the order.</p>
      <div role="region" aria-label={section.label} tabIndex={0} className="mt-3 max-h-[36rem] overflow-auto rounded-xl border">
        <table className="w-full text-left text-sm"><caption className="sr-only">{section.label}</caption>
          <thead className="sticky top-0 bg-secondary"><tr>{header("instance", "Instance")}{hasEvent && header("event", "Event")}{section.columns.map(field => header(field.name, field.label))}</tr></thead>
          <tbody className="divide-y">{rows.map(row => <tr key={`${row.event}-${row.instance}`}>
            <th scope="row" className="p-3 align-top">{row.instance}</th>{hasEvent && <td className="p-3 align-top">{row.event || "—"}</td>}
            {row.values.map((value, index) => <td key={section.columns[index].name} className="min-w-48 max-w-72 whitespace-pre-wrap break-words p-3 align-top">{value || "—"}</td>)}
          </tr>)}</tbody>
        </table>
      </div>
    </> : <p className="mt-4 text-sm text-muted-foreground">No recorded instances.</p>}
  </details>;
}
