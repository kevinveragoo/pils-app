"use client";
import { useEffect, useRef, useState } from "react";
import { choicePairs, type EditField } from "@/lib/lookup-edit";
import { fieldVisible } from "@/lib/instrument-forms";
import { plainLabel } from "@/lib/record-lookup";
import { useLocalization } from "@/components/Localization";
import { Button } from "@/components/ui/button";
export type EditIdentity = { uic: string; form: string; instance: string; event: string; label: string };
type Entry = { fields: EditField[]; values: Record<string, string>; version: string };
export default function LookupEntryEditor({ identity, onClose, onSaved }: { identity: EditIdentity; onClose: () => void; onSaved: () => void }) {
  const { t } = useLocalization();
  const dialog = useRef<HTMLDialogElement>(null);
  const [entry, setEntry] = useState<Entry | null>(null), [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState(""), [saving, setSaving] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
    const controller = new AbortController();
    fetch(`/api/redcap/lookup/edit?${new URLSearchParams({ uic: identity.uic, form: identity.form, instance: identity.instance, event: identity.event })}`, { cache: "no-store", signal: controller.signal }).then(async response => {
      const result = await response.json();if (!response.ok) throw Error(result.error);
      if (!controller.signal.aborted) { setEntry(result);setValues(result.values); }
    }).catch(reason => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [identity]);
  async function save(event: React.FormEvent) {
    event.preventDefault();if (!entry || saving) return;
    setSaving(true);setError("");
    try {
      const changes = Object.fromEntries(entry.fields.filter(field => fieldVisible(field.branching_logic ?? "", values) && values[field.field_name] !== entry.values[field.field_name]).map(field => [field.field_name, values[field.field_name]]));
      const response = await fetch("/api/redcap/lookup/edit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identity, version: entry.version, values: changes }) });
      const result = await response.json();if (!response.ok) throw Error(result.error);
      onSaved();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save changes."); }
    finally { setSaving(false); }
  }
  return <dialog ref={dialog} aria-labelledby="edit-entry-title" onCancel={event => { if (saving) event.preventDefault(); else onClose(); }} className="m-auto max-h-[90dvh] w-[min(60rem,95vw)] overflow-y-auto rounded-2xl border bg-background p-5 text-foreground shadow-xl backdrop:bg-black/40">
    <form onSubmit={save}>
      <h2 id="edit-entry-title" className="text-xl font-bold">{t(identity.form === "client_enrollment" ? "Edit client details" : "Edit entry")}: {t(identity.label)}</h2>
      <p className="mt-2 break-all text-sm text-muted-foreground">{identity.uic}{identity.instance ? ` · ${t("Instance")} ${identity.instance}` : ""}{identity.event ? ` · ${identity.event}` : ""}</p>
      <p className="mt-2 text-sm text-muted-foreground">{t("Changes update this existing entry. Identifiers and calculated fields cannot be edited.")}</p>
      {error && <p role="alert" className="my-4 text-red-700">{t(error)}</p>}
      {!entry && !error && <p role="status" className="my-4">{t("Loading entry…")}</p>}
      <fieldset disabled={saving} className="my-5 grid gap-5 sm:grid-cols-2">{entry?.fields.filter(field => fieldVisible(field.branching_logic ?? "", values)).map(field => {
        const value = values[field.field_name] ?? "", pairs = choicePairs(field), id = `lookup-edit-${field.field_name}`;
        const set = (value: string) => setValues(current => ({ ...current, [field.field_name]: value }));
        const type = field.text_validation_type_or_show_slider_number ?? "";
        return <div key={field.field_name} className="grid content-start gap-2"><label htmlFor={id} className="text-sm font-semibold">{t(plainLabel(field.field_label))}{field.required_field === "y" ? " *" : ""}</label>
          {field.field_type === "checkbox" ? <fieldset id={id} aria-label={t(plainLabel(field.field_label))} className="grid gap-2">{pairs.map(([code, label]) => <label key={code} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value.split(",").includes(code)} onChange={event => set(event.target.checked ? [...value.split(",").filter(Boolean), code].join(",") : value.split(",").filter(item => item !== code).join(","))} />{t(label)}</label>)}</fieldset>
            : pairs.length ? <select id={id} value={value} className="rounded-lg border bg-background p-2" onChange={event => set(event.target.value)}><option value="">{t("Choose…")}</option>{value && !pairs.some(([code]) => code === value) && <option value={value}>{value}</option>}{pairs.map(([code, label]) => <option key={code} value={code}>{t(label)}</option>)}</select>
            : field.field_type === "notes" ? <textarea id={id} value={value} className="min-h-24 rounded-lg border bg-background p-2" onChange={event => set(event.target.value)} />
            : <input id={id} value={value} type={type.startsWith("date_") ? "date" : /^(integer|number)/.test(type) ? "number" : "text"} step={type === "integer" ? "1" : "any"} className="min-w-0 rounded-lg border bg-background p-2" onChange={event => set(event.target.value)} />}
          <code className="break-all text-xs text-muted-foreground">{field.field_name}</code>
        </div>;
      })}</fieldset>
      <div className="sticky bottom-0 flex justify-end gap-3 border-t bg-background py-3"><Button type="button" variant="outline" disabled={saving} onClick={onClose}>{t("Cancel")}</Button><Button type="submit" disabled={!entry || saving}>{t(saving ? "Saving…" : "Save changes")}</Button></div>
    </form>
  </dialog>;
}
