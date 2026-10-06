import type { Metadata } from "next";
import AppHeader from "@/components/AppHeader";
import { ActivityLogTable } from "@/components/ActivityLogTable";
import { requireLogsAccess } from "@/lib/auth";
import { loadActivities } from "@/lib/redcap-logs";

export const metadata: Metadata = { title: "Activity Logs | PILS", description: "Recent REDCap and application activity." };

function isoDate(date: Date) { return date.toISOString().slice(0, 10); }
function param(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] ?? "" : value ?? ""; }
function formatTime(value: string) { const date = new Date(value); return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Indian/Mauritius" }).format(date) : value; }

export default async function LogsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireLogsAccess();
  const query = await searchParams;
  const now = new Date();
  const weekAgo = new Date(now); weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(param(query.from)) ? param(query.from) : isoDate(weekAgo);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(param(query.to)) ? param(query.to) : isoDate(now);
  const workflow = param(query.workflow);
  const search = param(query.q).trim().toLowerCase();
  let result: Awaited<ReturnType<typeof loadActivities>> = { entries: [], truncated: false };
  let error = "";
  try { result = await loadActivities({ from, to }); } catch (reason) { error = reason instanceof Error ? reason.message : "Unable to load REDCap activity."; }
  const entries = result.entries.filter(entry => (!workflow || entry.workflow === workflow) && (!search || [entry.recordId, entry.enteredBy, entry.staffName, entry.action].some(value => value.toLowerCase().includes(search))));
  const workflows = [...new Set(result.entries.map(entry => entry.workflow))].sort();
  const base = new URLSearchParams({ from, to, ...(workflow ? { workflow } : {}), ...(param(query.q) ? { q: param(query.q) } : {}) });

  return <div className="flex flex-1 flex-col"><a className="pils-skip-link" href="#logs">Skip to activity logs</a><AppHeader current="logs" /><main id="logs" className="logs-page">
    <div className="admin-heading"><div><p className="pils-eyebrow inline-block">Activity</p><h1>Activity logs</h1><p>Recent REDCap changes, augmented with the signed-in account for submissions made through this app.</p></div></div>
    <form className="logs-filters"><label>From<input type="date" name="from" defaultValue={from} /></label><label>To<input type="date" name="to" defaultValue={to} /></label><label>Workflow<select name="workflow" defaultValue={workflow}><option value="">All workflows</option>{workflows.map(value => <option key={value}>{value}</option>)}</select></label><label>Search<input name="q" defaultValue={param(query.q)} placeholder="UIC, staff or action" /></label><button className="auth-button" type="submit">Apply filters</button></form>
    {error && <p role="alert" className="auth-message auth-error">{error}</p>}
    {result.truncated && <p role="status" className="auth-message">REDCap returned its 10,000-row limit for this period. Use a shorter date range to see every entry.</p>}
    <section className="logs-card"><ActivityLogTable entries={entries.map(entry => ({ id: entry.id, timestampLabel: formatTime(entry.timestamp), workflow: entry.workflow, recordId: entry.recordId, enteredBy: entry.enteredBy, staffName: entry.staffName, serviceDate: entry.serviceDate, action: entry.action }))} query={base.toString()} /></section>
  </main></div>;
}
