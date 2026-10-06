"use client";

import { useRouter } from "next/navigation";

type Entry = {
  id: string;
  timestampLabel: string;
  workflow: string;
  recordId: string;
  enteredBy: string;
  staffName: string;
  serviceDate: string;
  action: string;
};

export function ActivityLogTable({ entries, query }: { entries: Entry[]; query: string }) {
  const router = useRouter();
  function open(id: string) {
    const params = new URLSearchParams(query);
    router.push(`/logs/details/${encodeURIComponent(id)}?${params}`);
  }

  return <div className="logs-table-wrap"><table className="logs-table"><thead><tr><th>Time</th><th>Workflow</th><th>UIC</th><th>Entered by</th><th>Worker / navigator</th><th>Service date</th><th>Action</th></tr></thead><tbody>{entries.map(entry => <tr key={entry.id} tabIndex={0} role="link" aria-label={`Open ${entry.workflow} entry for ${entry.recordId}`} onClick={() => open(entry.id)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(entry.id); } }}><td><span className="logs-entry-link">{entry.timestampLabel}</span></td><td>{entry.workflow}</td><td>{entry.recordId}</td><td>{entry.enteredBy}</td><td>{entry.staffName || "—"}</td><td>{entry.serviceDate || "—"}</td><td>{entry.action}</td></tr>)}{!entries.length && <tr><td colSpan={7}>No activity found for these filters.</td></tr>}</tbody></table></div>;
}
