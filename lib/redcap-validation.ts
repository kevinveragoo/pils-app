import definitions from "./redcap-field-rules.json";

type Rule = { label: string; type: string; required?: boolean; min?: number; max?: number; choices?: string[] };
// Snapshot of the configured project's metadata, audited 2026-09-23.
const rules: Record<string, Rule> = definitions;

export function isRequiredField(key: string) {
  return rules[key]?.required === true;
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
  for (const key of fields) {
    const rule = rules[key];
    if (!rule) continue;
    const value = values[key]?.trim() ?? "";
    if (!value) {
      if (rule.required) return `${rule.label} is required.`;
      continue;
    }
    if (rule.choices) {
      const selected = rule.type === "checkbox" ? value.split(",") : [value];
      if (selected.some((code) => !rule.choices!.includes(code))) return `${rule.label}: choose a valid option.`;
    }
    if (rule.type.startsWith("date_") && !validDate(value)) return `${rule.label}: enter a valid date.`;
    if (rule.type === "integer" || rule.type === "number") {
      const numeric = rule.type === "integer" ? /^-?\d+$/.test(value) : /^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value);
      const number = Number(value);
      if (!numeric || !Number.isFinite(number) || (rule.type === "integer" && !Number.isSafeInteger(number))) return `${rule.label}: enter a valid ${rule.type === "integer" ? "whole number" : "number"}.`;
      if (rule.min !== undefined && number < rule.min) return `${rule.label}: minimum ${rule.min}.`;
      if (rule.max !== undefined && number > rule.max) return `${rule.label}: maximum ${rule.max}.`;
    }
    if (rule.type === "phone" && !/^\(?\d{3}\)?[-. ]?\d{3}[-. ]?\d{4}$/.test(value)) return `${rule.label}: enter a 10-digit phone number (REDCap phone format).`;
  }
  return null;
}
