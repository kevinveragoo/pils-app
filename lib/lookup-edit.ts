import { fieldVisible } from "./instrument-forms";
import { plainLabel } from "./record-lookup";

export type EditField = {
  field_name: string; form_name: string; field_label: string; field_type: string;
  select_choices_or_calculations: string; branching_logic?: string; field_annotation?: string;
  required_field?: string; text_validation_type_or_show_slider_number?: string;
  text_validation_min?: string; text_validation_max?: string;
};
export function editableField(field: EditField) {
  return field.field_name !== "uic_ori" && !field.field_name.startsWith("redcap_") &&
    ["text", "notes", "radio", "dropdown", "checkbox", "yesno", "truefalse"].includes(field.field_type) &&
    !/@(?:CALC|HIDDEN|READONLY|USERNAME|NOW|TODAY)\b/i.test(field.field_annotation ?? "") &&
    !/@CALCTEXT|@CALCDATE/i.test(field.field_annotation ?? "");
}
export function editValues(fields: EditField[], row: Record<string, string | number>) {
  return Object.fromEntries(fields.map(field => [field.field_name, field.field_type === "checkbox"
    ? choicePairs(field).filter(([code]) => String(row[`${field.field_name}___${code}`]) === "1").map(([code]) => code).join(",")
    : String(row[field.field_name] ?? "")]));
}
export function choicePairs(field: EditField): string[][] {
  if (field.field_type === "yesno") return [["0", "No"], ["1", "Yes"]];
  if (field.field_type === "truefalse") return [["0", "False"], ["1", "True"]];
  return field.select_choices_or_calculations.split("|").flatMap(part => {
    const i = part.indexOf(",");return i < 0 ? [] : [[part.slice(0, i).trim(), plainLabel(part.slice(i + 1))]];
  });
}
export function editPatch(fields: EditField[], before: Record<string, string>, values: Record<string, string>) {
  const patch: Record<string, string> = {};
  for (const key of Object.keys(values)) if (!fields.some(field => field.field_name === key && editableField(field))) throw Error("This field cannot be edited.");
  const combined = { ...before, ...values };
  for (const field of fields.filter(editableField)) {
    const name = field.field_name;
    if (!(name in values) || values[name] === before[name]) continue;
    if (!fieldVisible(field.branching_logic ?? "", combined)) throw Error("A hidden field cannot be changed. Reopen the entry and try again.");
    const value = values[name].trim();
    if (field.required_field === "y" && !value) throw Error(`${plainLabel(field.field_label)} is required.`);
    const pairs = choicePairs(field);
    if (pairs.length && value && (field.field_type === "checkbox" ? value.split(",") : [value]).some(code => !pairs.some(([option]) => code === option))) throw Error("Choose a valid option.");
    const type = field.text_validation_type_or_show_slider_number ?? "";
    if (value && type.startsWith("date_") && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) throw Error("Enter a valid date.");
    if (value && /^(integer|number)/.test(type)) {
      if (!(/^-?\d+(?:\.\d+)?$/.test(value)) || !Number.isFinite(Number(value)) || (type === "integer" && !Number.isSafeInteger(Number(value)))) throw Error("Enter a valid number.");
      for (const [bound, direction] of [[field.text_validation_min, -1], [field.text_validation_max, 1]] as const) if (bound && /^-?\d+(?:\.\d+)?$/.test(bound) && (direction === -1 ? Number(value) < Number(bound) : Number(value) > Number(bound))) throw Error("The number is outside the allowed range.");
    }
    if (field.field_type === "checkbox") for (const [code] of pairs) patch[`${name}___${code}`] = value.split(",").includes(code) ? "1" : "0";
    else patch[name] = value;
  }
  // Enforce newly exposed required questions, without forcing unrelated legacy blanks.
  for (const field of fields.filter(editableField)) if (field.required_field === "y" && fieldVisible(field.branching_logic ?? "", combined) && !fieldVisible(field.branching_logic ?? "", before) && !combined[field.field_name]?.trim()) throw Error(`${plainLabel(field.field_label)} is required.`);
  return patch;
}
