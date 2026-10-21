import { fieldVisible } from "./instrument-forms";
import definitions from "./redcap-field-rules.json";

type Rule = { label: string; type: string; required?: boolean; min?: number; max?: number; choices?: string[]; branch?: string; minExpression?: string; maxExpression?: string };
// Snapshot of the configured project's metadata, audited 2026-10-18.
const rules: Record<string, Rule> = definitions;

export function isRequiredField(key: string, values: Record<string, string> = {}) {
  const rule = rules[key];
  if (!rule?.required) return false;
  if (!rule.branch) return true;
  return fieldVisible(rule.branch,values);
}

export function numericAttributes(key: string) {
  const rule = rules[key];
  return rule && (rule.type === "integer" || rule.type === "number")
    ? { min: rule.min, max: rule.max, step: rule.type === "integer" ? 1 : "any" }
    : {};
}

export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseDob(value: string, allowShortYear = true, now = new Date()) {
  const text = value.trim();
  if (validDate(text)) return text;
  const match = text.match(/^(\d{2})([/.\-])(\d{2})\2(\d{4}|\d{2})$/)
    ?? text.match(/^(\d{2})()(\d{2})(\d{4})$/);
  if (!match || (match[4].length === 2 && !allowShortYear)) return "";
  let year = Number(match[4]);
  // Resolve short years within the hundred-year window ending this year.
  if (match[4].length === 2) {
    const currentYear = now.getUTCFullYear();
    year += Math.floor(currentYear / 100) * 100;
    if (year > currentYear) year -= 100;
  }
  const iso = `${String(year).padStart(4, "0")}-${match[3]}-${match[1]}`;
  return validDate(iso) ? iso : "";
}

export function completedAge(dob: string, now = new Date()) {
  if (!validDate(dob)) return "—";
  const birthday = dob.slice(5);
  const today = now.toISOString().slice(0, 10);
  return Math.max(0, Number(today.slice(0, 4)) - Number(dob.slice(0, 4)) - (today.slice(5) < birthday ? 1 : 0));
}

export function validateFields(values: Record<string, string>, fields = Object.keys(values)): string | null {
  if (Object.keys(values).some(key => key.startsWith("pv_") && !rules[key] && values[key]?.trim())) return "The PrEP form is out of date. Reload it before saving.";
  if (fields.includes("oc_prep_interested") && values.oc_prep_interested === "0" && !values.oc_prep_no_reason?.trim()) {
    return "Reason not interested in PrEP is required.";
  }
  if (fields.includes("cne_sti_diagnosed") || fields.includes("cnv_sti_diagnosed")) {
    const diagnoses = (fields.includes("cnv_sti_diagnosed")?values.cnv_sti_diagnosed:values.cne_sti_diagnosed)?.split(",").filter(Boolean) ?? [];
    if (diagnoses.length > 1 && diagnoses.some(code => ["0", "98"].includes(code))) return "Select None diagnosed or Unknown on its own.";
  }
  for (const key of fields) {
    const rule = rules[key];
    if (!rule) continue;
    const value = values[key]?.trim() ?? "";
    if (!value) {
      if (isRequiredField(key, values)) return `${rule.label} is required.`;
      continue;
    }
    if (rule.choices) {
      const selected = rule.type === "checkbox" ? value.split(",") : [value];
      if (selected.some((code) => !rule.choices!.includes(code))) return `${rule.label}: choose a valid option.`;
    }
    if (rule.type.startsWith("date_") && !validDate(value)) return `${rule.label}: enter a valid date.`;
    if (rule.type.startsWith("datetime_")) {
      const parts = value.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
      if (!parts || !validDate(parts[1]) || Number(parts[2]) > 23 || Number(parts[3]) > 59 || Number(parts[4] ?? 0) > 59) return `${rule.label}: enter a valid date and time.`;
    }
    if (rule.type === "integer" || rule.type === "number") {
      const numeric = rule.type === "integer" ? /^-?\d+$/.test(value) : /^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value);
      const number = Number(value);
      if (!numeric || !Number.isFinite(number) || (rule.type === "integer" && !Number.isSafeInteger(number))) return `${rule.label}: enter a valid ${rule.type === "integer" ? "whole number" : "number"}.`;
      for (const bound of ["min", "max"] as const) {
        let limit = rule[bound];
        const expression = rule[`${bound}Expression`]?.match(/^\[([a-zA-Z0-9_]+)\]$/);
        if (limit === undefined && expression && values[expression[1]]?.trim() && Number.isFinite(Number(values[expression[1]]))) limit = Number(values[expression[1]]);
        if (limit !== undefined && (bound === "min" ? number < limit : number > limit)) return `${rule.label}: ${bound === "min" ? "minimum" : "maximum"} ${limit}.`;
      }
    }
    if (rule.type === "phone" && !/^\(?\d{3}\)?[-. ]?\d{3}[-. ]?\d{4}$/.test(value)) return `${rule.label}: enter a 10-digit phone number (REDCap phone format).`;
  }
  return null;
}
