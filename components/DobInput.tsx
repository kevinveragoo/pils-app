"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { parseDob, validDate } from "@/lib/redcap-validation";

export function DobInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const display = validDate(value) ? `${value.slice(8)}/${value.slice(5, 7)}/${value.slice(0, 4)}` : value;
  return <Input
    type="text"
    inputMode="numeric"
    placeholder="DD/MM/YYYY"
    value={draft ?? display}
    onFocus={() => setDraft(display)}
    onChange={(event) => {
      const raw = event.target.value;
      setDraft(raw);
      // Do not expand "19" while the user is still typing "1979".
      onChange(parseDob(raw, false) || raw);
    }}
    onBlur={(event) => {
      const raw = event.target.value;
      onChange(parseDob(raw) || raw);
      setDraft(null);
    }}
  />;
}
