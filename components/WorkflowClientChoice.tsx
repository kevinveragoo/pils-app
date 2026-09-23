"use client";

import { Input } from "@/components/ui/input";

type Client = { uic: string; display_name: string; alias: string };

export function WorkflowClientChoice<T extends Client>({ mode, query, loading, matches, selected, onQuery, onSelect, onNew }: {
  mode: "new" | "existing" | null;
  query: string;
  loading: boolean;
  matches: T[];
  selected: T | null;
  onQuery: (value: string) => void;
  onSelect: (client: T) => void;
  onNew: () => void;
}) {
  return <section className="outreach-card">
    <h2 className="text-xl font-bold">Choose a client</h2>
    <div className="mt-5 grid items-start gap-5 sm:grid-cols-2">
      <div className="grid gap-3">
        <label className="grid gap-2 font-semibold">Search UIC
          <Input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search by UIC, name, or alias" autoComplete="off" />
        </label>
        {loading ? <p role="status" className="text-sm text-muted-foreground">Loading clients…</p> : query.trim() && !selected && <div className="max-h-64 overflow-y-auto rounded-xl border">
          {matches.length ? <ul aria-label="Matching REDCap clients" className="divide-y">{matches.map(client => <li key={client.uic}><button type="button" className="w-full p-3 text-left hover:bg-secondary focus-visible:bg-secondary" onClick={() => onSelect(client)}><strong className="block">{client.uic}</strong><span className="text-sm text-muted-foreground">{client.display_name}{client.alias ? ` · ${client.alias}` : ""}</span></button></li>)}</ul> : <p role="status" className="p-3 text-sm text-muted-foreground">No matching client. Search again or choose New client to enroll them.</p>}
        </div>}
        {mode === "existing" && selected && <p role="status" className="rounded-xl bg-secondary p-3 text-sm"><strong className="block">Selected: {selected.uic}</strong>{selected.display_name}</p>}
        <p className="text-sm text-muted-foreground">Select a client from the results to continue with an existing client.</p>
      </div>
      <button type="button" aria-pressed={mode === "new"} onClick={onNew} className={`rounded-2xl border p-5 text-left ${mode === "new" ? "border-primary bg-secondary" : ""}`}>
        <strong>New client</strong><span className="mt-1 block text-sm text-muted-foreground">Complete client enrollment and create a UIC.</span>
      </button>
    </div>
  </section>;
}
