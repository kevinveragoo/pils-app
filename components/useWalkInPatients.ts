"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type WalkInPatient = { record_id: string; uic: string; display_name: string; first_name: string; last_name: string; alias: string; phone: string; patient_code?: string };

export function useWalkInPatients(active: boolean) {
  const [patients, setPatients] = useState<WalkInPatient[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const current = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    current.current?.abort();
    const controller = new AbortController();
    current.current = controller;
    setLoading(true); setError(""); setPatients([]);
    try {
      const response = await fetch("/api/redcap/patients", { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("Unable to load clients. Refresh the client list to try again.");
      const data: unknown = await response.json();
      if (!Array.isArray(data) || data.some(patient => !patient || typeof patient.uic !== "string" || typeof patient.display_name !== "string" || typeof patient.alias !== "string")) throw new Error("Unable to load clients. Refresh the client list to try again.");
      if (!controller.signal.aborted) setPatients(data);
    } catch {
      if (!controller.signal.aborted) setError("Unable to load clients. Refresh the client list to try again.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (!active) return;
    const initial = window.setTimeout(() => void refresh(), 0);
    const visibleRefresh = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", visibleRefresh);
    document.addEventListener("visibilitychange", visibleRefresh);
    const timer = window.setInterval(visibleRefresh, 60000);
    return () => {
      window.clearTimeout(initial); window.clearInterval(timer);
      window.removeEventListener("focus", visibleRefresh);
      document.removeEventListener("visibilitychange", visibleRefresh);
      current.current?.abort();
    };
  }, [active, refresh]);
  return { patients, loading, error, refresh };
}
