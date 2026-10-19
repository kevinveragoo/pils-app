"use client";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Enrollment } from "@/components/OutreachWorkflow";
import { Button } from "@/components/ui/button";
import { initialClientEnrollment, requiredEnrollmentFields } from "@/lib/client-enrollment";
import { generateUic } from "@/lib/uic";
import { validateFields } from "@/lib/redcap-validation";
export default function ClientEnrollmentWorkflow({ staffName }: { staffName: string }) {
  const [values, setValues] = useState(() => initialClientEnrollment(staffName));
  const [review, setReview] = useState(false), [error, setError] = useState(""), [saving, setSaving] = useState(false), [saved, setSaved] = useState("");
  const [availability, setAvailability] = useState<{ uic: string; status: "available" | "exists" | "error" } | null>(null), [retry, setRetry] = useState(0);
  const uic = generateUic(values), status = availability?.uic === uic ? availability.status : "checking";
  useEffect(() => {
    if (!uic) return;
    const controller = new AbortController();
    fetch(`/api/redcap/client-enrollment?uic=${encodeURIComponent(uic)}`, { signal: controller.signal, cache: "no-store" }).then(async response => {
      const data = await response.json(); if (!response.ok) throw Error(data.error);
      if (!controller.signal.aborted) setAvailability({ uic, status: data.exists ? "exists" : "available" });
    }).catch(error => { if (error.name !== "AbortError") setAvailability({ uic, status: "error" }); });
    return () => controller.abort();
  }, [uic, retry]);
  const validate = () => {
    if (!requiredEnrollmentFields.every(field => values[field]?.trim())) { setError("Complete all required enrollment fields."); return false; }
    const message = validateFields(values);
    if (message) { setError(message); return false; }
    if (!uic || status !== "available") { setError(status === "exists" ? "This UIC already exists. Check the identity details." : "Wait for a successful UIC availability check."); return false; }
    setError(""); return true;
  };
  async function submit() {
    if (!validate()) return;
    setSaving(true);
    try {
      const response = await fetch("/api/redcap/client-enrollment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recordId: uic, enrollment: values }) });
      const data = await response.json(); if (!response.ok) throw Error(data.error || "Unable to save client enrollment."); setSaved(data.recordId);
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to save enrollment."); }
    finally { setSaving(false); }
  }
  if (saved) return <div className="outreach-page mx-auto w-full max-w-3xl px-4"><section className="outreach-card py-12 text-center"><Check className="mx-auto mb-4 size-12 text-green-700" /><h1 className="text-3xl font-bold">Client enrolled</h1><p className="mt-2">Enrollment saved for {saved}.</p><Button className="mt-6" onClick={() => location.reload()}>Enroll another client</Button></section></div>;
  return <div className="outreach-page mx-auto grid w-full max-w-4xl gap-5 px-4 sm:px-6"><header><h1 className="text-3xl font-bold">Client Enrollment Workflow</h1><p className="mt-2 text-muted-foreground">Register a new client, review their details, and save to REDCap.</p></header><ol aria-label="Progress" className="flex gap-4 text-sm font-bold"><li aria-current={!review ? "step" : undefined} className={!review ? "text-primary" : "text-muted-foreground"}>1 · Enrollment</li><li aria-current={review ? "step" : undefined} className={review ? "text-primary" : "text-muted-foreground"}>2 · Review</li></ol>{error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}{review && <p className="rounded-xl bg-secondary p-3 text-sm">Review the details below. Only Client Enrollment will be saved.</p>}<fieldset disabled={review || saving}><Enrollment values={values} set={(key, value) => { setError(""); setValues(current => ({ ...current, [key]: value })); }} uic={uic} kp={new Set(values.ce_kp_type.split(","))} /></fieldset>{uic && <div role="status" className="rounded-xl bg-secondary p-3 text-sm">{status === "available" ? "UIC is available." : status === "exists" ? "This UIC already exists. Check the identity details before continuing." : status === "error" ? "Unable to check UIC availability." : "Checking UIC availability…"}{status === "error" && <Button variant="outline" className="ml-3" onClick={() => setRetry(value => value + 1)}>Retry</Button>}</div>}<div className="flex justify-between">{review ? <><Button variant="outline" disabled={saving} onClick={() => { setError(""); setReview(false); }}>Back to enrollment</Button><Button disabled={saving || status !== "available"} onClick={() => void submit()}>{saving ? "Saving…" : "Save client enrollment"}</Button></> : <Button className="ml-auto" onClick={() => { if (validate()) setReview(true); }}>Review enrollment</Button>}</div></div>;
}
