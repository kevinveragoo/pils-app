export type LookupRow = Record<string, string | number>;
export type LookupField = {
  field_name: string;
  form_name: string;
  field_label: string;
  field_type: string;
  select_choices_or_calculations: string;
  text_validation_type_or_show_slider_number?: string;
};
export type LookupInstrument = { instrument_name: string; instrument_label: string };
export type LookupSection = {
  name: string;
  label: string;
  repeating: boolean;
  hasData: boolean;
  columns: { name: string; label: string; sortType?: "date" | "number" }[];
  rows: { instance: string; event: string; values: string[] }[];
};

// Render REDCap labels as plain text; never insert metadata HTML into the page.
export function plainLabel(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"')
    .replace(/&#0*39;/g, "'").replace(/\s+/g, " ").trim();
}

function choices(field: LookupField) {
  return field.select_choices_or_calculations.split("|").flatMap(part => {
    const comma = part.indexOf(",");
    return comma < 0 ? [] : [[part.slice(0, comma).trim(), plainLabel(part.slice(comma + 1))]];
  });
}

export function displayValue(row: LookupRow, field: LookupField) {
  const value = String(row[field.field_name] ?? "");
  if (field.field_type === "checkbox") {
    const options = choices(field);
    const checked = options.filter(([code]) => String(row[`${field.field_name}___${code}`]) === "1").map(([, label]) => label);
    // Include unexpected codes too, so newer or legacy values are never dropped.
    for (const [key, selected] of Object.entries(row)) {
      if (key.startsWith(`${field.field_name}___`) && String(selected) === "1" && !options.some(([code]) => key === `${field.field_name}___${code}`)) checked.push(key.slice(field.field_name.length + 3));
    }
    if (checked.length) return checked.join("; ");
    return value || (Object.keys(row).some(key => key.startsWith(`${field.field_name}___`) && String(row[key]) === "0") ? "None selected" : "");
  }
  if (!value) return "";
  if (field.field_type === "yesno") return ({ "1": "Yes", "0": "No" } as Record<string, string>)[value] ?? value;
  if (field.field_type === "truefalse") return ({ "1": "True", "0": "False" } as Record<string, string>)[value] ?? value;
  if (["radio", "dropdown"].includes(field.field_type)) return choices(field).find(([code]) => code === value)?.[1] ?? value;
  if (field.text_validation_type_or_show_slider_number?.startsWith("date") && /^\d{4}-\d{2}-\d{2}/.test(value)) return `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}${value.slice(10)}`;
  return value;
}

export function buildLookupSections(rows: LookupRow[], metadata: LookupField[], instruments: LookupInstrument[], repeating: { form_name: string }[]): LookupSection[] {
  const repeatNames = new Set([...repeating.map(form => form.form_name), ...rows.map(row => String(row.redcap_repeat_instrument || "")).filter(Boolean)]);
  const forms = new Map(instruments.map(form => [form.instrument_name, form.instrument_label]));
  for (const field of metadata) if (!forms.has(field.form_name)) forms.set(field.form_name, field.form_name.replaceAll("_", " "));
  const known = new Set(metadata.map(field => field.field_name));
  const fieldsByName = new Map(metadata.map(field => [field.field_name, field]));
  const extraFields: LookupField[] = [];
  const extras = new Set(rows.flatMap(row => Object.keys(row)));
  for (const key of extras) {
    if (known.has(key) || ["redcap_repeat_instrument", "redcap_repeat_instance", "redcap_event_name"].includes(key) || key.endsWith("_complete") || (key.includes("___") && fieldsByName.get(key.split("___")[0])?.field_type === "checkbox")) continue;
    if (!rows.some(row => row[key] !== undefined && String(row[key]) !== "")) continue;
    const form = [...forms.keys()].sort((a, b) => b.length - a.length).find(name => key.startsWith(`${name}_`));
    const formName = form || "record_details";
    if (!form) forms.set(formName, "Record details");
    extraFields.push({ field_name: key, form_name: formName, field_label: key.replaceAll("_", " "), field_type: "text", select_choices_or_calculations: "" });
  }
  const sections: LookupSection[] = [];
  for (const [name, label] of forms) {
    const isRepeat = repeatNames.has(name);
    const formRows = rows.filter(row => isRepeat ? row.redcap_repeat_instrument === name : !row.redcap_repeat_instrument);
    const fields = [...metadata, ...extraFields].filter(field => field.form_name === name && field.field_type !== "descriptive");
    // Completion is exported by REDCap but does not appear in its metadata dictionary.
    if (name !== "record_details") fields.push({ field_name: `${name}_complete`, form_name: name, field_label: "Form completion", field_type: "dropdown", select_choices_or_calculations: "0, Incomplete | 1, Unverified | 2, Complete" });
    const hasData = formRows.some(row => fields.some(field => {
      if (field.field_name === `${name}_complete`) return ["1", "2"].includes(String(row[field.field_name] ?? ""));
      if (field.field_type === "checkbox") return String(row[field.field_name] ?? "").trim() !== "" || Object.entries(row).some(([key, value]) => key.startsWith(`${field.field_name}___`) && String(value) === "1");
      return String(row[field.field_name] ?? "").trim() !== "";
    }));
    const columns = isRepeat ? fields.filter(field => formRows.some(row => displayValue(row, field) !== "")) : fields;
    sections.push({ name, label: plainLabel(label), repeating: isRepeat, hasData, columns: columns.map(field => ({ name: field.field_name, label: plainLabel(field.field_label) || field.field_name, sortType: field.text_validation_type_or_show_slider_number?.startsWith("date") ? "date" : /^(number|integer)/.test(field.text_validation_type_or_show_slider_number || "") ? "number" : undefined })), rows: formRows.sort((a, b) => String(a.redcap_event_name || "").localeCompare(String(b.redcap_event_name || "")) || Number(a.redcap_repeat_instance || 0) - Number(b.redcap_repeat_instance || 0)).map(row => ({ instance: String(row.redcap_repeat_instance || ""), event: String(row.redcap_event_name || ""), values: columns.map(field => displayValue(row, field)) })) });
  }
  return sections.sort((a, b) => Number(a.repeating) - Number(b.repeating));
}

export type LookupSort = { column: string; direction: "ascending" | "descending" };

export function sortLookupRows(section: LookupSection, sort: LookupSort) {
  const index = section.columns.findIndex(field => field.name === sort.column);
  const type = sort.column === "instance" ? "number" : section.columns[index]?.sortType;
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  const value = (row: LookupSection["rows"][number]) => sort.column === "instance" ? row.instance : sort.column === "event" ? row.event : row.values[index] || "";
  const dateKey = (text: string) => text.replace(/^(\d{2})\/(\d{2})\/(\d{4})(.*)$/, "$3-$2-$1$4");
  return section.rows.map((row, original) => ({ row, original })).sort((a, b) => {
    const left = value(a.row), right = value(b.row);
    // Empty values stay at the bottom in either direction.
    if (!left || !right) return left ? -1 : right ? 1 : a.original - b.original;
    let comparison: number;
    if (type === "date") comparison = dateKey(left).localeCompare(dateKey(right));
    else if (type === "number" && Number.isFinite(Number(left)) && Number.isFinite(Number(right))) comparison = Number(left) - Number(right);
    else comparison = collator.compare(left, right);
    return comparison * (sort.direction === "ascending" ? 1 : -1) || a.original - b.original;
  }).map(item => item.row);
}
