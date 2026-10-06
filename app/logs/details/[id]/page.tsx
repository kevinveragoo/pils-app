import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { requireLogsAccess } from "@/lib/auth";
import { loadActivities } from "@/lib/redcap-logs";

export const metadata: Metadata = { title: "Activity Details | PILS", description: "Details of a REDCap activity entry." };

function param(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] ?? "" : value ?? ""; }
function formatTime(value: string) { const date = new Date(value); return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Indian/Mauritius" }).format(date) : value; }

export default async function LogDetailsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireLogsAccess();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const from = param(query.from);
  const to = param(query.to);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) notFound();
  const { entries } = await loadActivities({ from, to });
  const entry = entries.find(item => item.id === decodeURIComponent(id));
  if (!entry) notFound();
  const listQuery = new URLSearchParams({ from, to, ...(param(query.workflow) ? { workflow: param(query.workflow) } : {}), ...(param(query.q) ? { q: param(query.q) } : {}) });

  return <div className="flex flex-1 flex-col"><a className="pils-skip-link" href="#log-details">Skip to entry details</a><AppHeader current="logs" /><main id="log-details" className="logs-page">
    <div className="logs-detail-heading"><Link className="auth-button auth-button-secondary" href={`/logs?${listQuery}`}>← Back to logs</Link></div>
    <section className="logs-card logs-detail"><div><p className="pils-eyebrow">Entry details</p><h1>{entry.workflow} · {entry.recordId}</h1><p>{formatTime(entry.timestamp)} · {entry.enteredBy}</p>{entry.staffName && <p>Worker / navigator: {entry.staffName}</p>}{entry.serviceDate && <p>Service date: {entry.serviceDate}</p>}{entry.instances && <p>REDCap instances: {entry.instances}</p>}</div><dl>{entry.fields.map((field, index) => <div key={`${field.name}-${index}`}><dt>{field.label}</dt><dd>{field.value || "—"}</dd></div>)}</dl></section>
  </main></div>;
}
