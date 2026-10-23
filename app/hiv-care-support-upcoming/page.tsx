//
//  page.tsx
//  pils-app
//
//  Created by Elisa Kevin Veragoo + ChatGPT on 23/10/2026.
//
import type { Metadata } from "next";
import AppHeader from "@/components/AppHeader";
import { requireAnyRole } from "@/lib/auth";
import { loadUpcomingHcs } from "@/lib/hcs-upcoming-data";

export const metadata: Metadata = { title: "Healthcare Navigator Queue | PILS", description: "Upcoming planned HIV care and support follow-ups." };
const displayDate = (value: string) => value ? value.split("-").reverse().join("/") : "—";

export default async function HcsUpcomingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAnyRole(["HEALTHCARE_NAVIGATOR", "ADMIN"]);
  const params = await searchParams;
  const query = (Array.isArray(params.q) ? params.q[0] : params.q) ?? "";
  const dateParam = (value: string | string[] | undefined) => {
    const date = (Array.isArray(value) ? value[0] : value) ?? "";
    return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date ? date : "";
  };
  const start = dateParam(params.start), end = dateParam(params.end);
  const invalidRange = Boolean(start && end && start > end);
  let entries: Awaited<ReturnType<typeof loadUpcomingHcs>> = [];
  let error = false;
  try { entries = await loadUpcomingHcs(); } catch { error = true; }
  const search = query.trim().toLocaleLowerCase();
  const filtered = entries.filter(entry => !invalidRange && (!start || entry.followupDate >= start) && (!end || entry.followupDate <= end) && (!search || [entry.uic, entry.firstName, entry.surname, entry.alias].some(value => value.toLocaleLowerCase().includes(search))));
  return <div className="flex flex-1 flex-col">
    <a className="pils-skip-link" href="#hcs-upcoming">Skip to Healthcare Navigator Queue</a>
    <AppHeader current="hcs-upcoming" />
    <main id="hcs-upcoming" className="logs-page">
      <div className="admin-heading"><div><h1>Healthcare Navigator Queue</h1><p>All care contacts with future follow-up dates, soonest first. Today’s appointments are excluded.</p></div></div>
      <form className="flex flex-wrap items-end gap-3"><label className="grid gap-2 text-sm font-semibold">Start date<input className="rounded-xl border bg-card px-3 py-2" type="date" name="start" defaultValue={start} max={end || undefined} /></label><label className="grid gap-2 text-sm font-semibold">End date<input className="rounded-xl border bg-card px-3 py-2" type="date" name="end" defaultValue={end} min={start || undefined} /></label><label className="grid min-w-64 flex-1 gap-2 text-sm font-semibold">Search<input className="rounded-xl border bg-card px-3 py-2" name="q" defaultValue={query} placeholder="UIC, first name, surname or alias" /></label><button className="auth-button" type="submit">Apply filters</button></form>
      {invalidRange && <p role="alert" className="auth-message auth-error">Start date must be on or before end date.</p>}
      {error ? <p role="alert" className="auth-message auth-error">Unable to load upcoming HIV care follow-ups.</p> : <>
        <p className="text-sm"><span>Upcoming follow-ups:</span> {filtered.length}</p>
        <section className="logs-card"><div className="logs-table-wrap"><table className="logs-table"><thead><tr><th>UIC</th><th>First name</th><th>Surname</th><th>Alias</th><th aria-sort="ascending">Planned follow-up date</th><th>Navigator notes</th><th className="text-muted-foreground">Healthcare navigator</th><th className="text-muted-foreground">Driver</th><th className="text-muted-foreground">Last visit</th></tr></thead><tbody>
          {filtered.map(entry => <tr key={entry.id}><td>{entry.uic}</td><td>{entry.firstName || "—"}</td><td>{entry.surname || "—"}</td><td>{entry.alias || "—"}</td><td><time dateTime={entry.followupDate}>{displayDate(entry.followupDate)}</time></td><td className="min-w-64 whitespace-pre-wrap break-words">{entry.notes || "—"}</td><td className="text-muted-foreground">{entry.navigator || "—"}</td><td className="text-muted-foreground">{entry.driver || "—"}</td><td className="text-muted-foreground">{entry.lastVisit ? <time dateTime={entry.lastVisit}>{displayDate(entry.lastVisit)}</time> : "—"}</td></tr>)}
          {!filtered.length && <tr><td colSpan={9}>No upcoming follow-ups found.</td></tr>}
        </tbody></table></div></section>
      </>}
    </main>
  </div>;
}
