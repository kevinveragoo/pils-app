import type { IndicatorValues } from "./dashboard-cards";
export type Values = Record<string, string>;
export type Period = "all" | "year" | "quarter" | "month" | "week" | "day";
type Infection = "hiv" | "syphilis" | "hcv" | "hbv";
type Outcome = "positive" | "negative" | "indeterminate" | "invalid" | "unclassified" | "conflicting";
type Source = { date: string; result: string; label: string; previousStatus?: string; prep?: boolean };
type Commodity = "maleCondoms" | "femaleCondoms" | "lube" | "syringes" | "needles";
type CommoditySource = { date: string; quantity: string; label: string };
type Demographics = { gender: string; kps: string[] };

export const periods = new Set<Period>(["all", "year", "quarter", "month", "week", "day"]);
export const genderCodes = new Set(["1", "2", "3", "4", "5", "9"]);
export const kpCodes = new Set(["1", "2", "3", "4", "5", "6", "7", "8"]);
const infections: Infection[] = ["hiv", "syphilis", "hcv", "hbv"];
const outcomes: Outcome[] = ["positive", "negative", "indeterminate", "invalid", "unclassified", "conflicting"];

const rapidSources: Record<Infection, Source[]> = {
  hiv: [{ date: "oc_date", result: "oc_hiv_rapid_result", previousStatus: "oc_hiv_status_prev", label: "Outreach Contact — HIV rapid result" }],
  syphilis: [{ date: "oc_date", result: "oc_syp_result", previousStatus: "oc_syp_status_prev", label: "Outreach Contact — syphilis rapid result" }],
  hcv: [{ date: "oc_date", result: "oc_hepc_result", previousStatus: "oc_hepc_status_prev", label: "Outreach Contact — HCV rapid result" }],
  hbv: [{ date: "oc_date", result: "oc_hepb_result", previousStatus: "oc_hepb_status_prev", label: "Outreach Contact — HBV rapid result" }],
};

const labSources: Record<Infection, Source[]> = {
  hiv: [{ date: "cnv_hiv_lab_test_date", result: "cnv_hiv_lab_result", label: "Clinic Visit — HIV laboratory result" }, { date: "pv_hiv_lab_test_date", result: "pv_hiv_result", prep: true, label: "PrEP Visit — HIV laboratory result" }],
  syphilis: [{ date: "cnv_syp_lab_test_date", result: "cnv_syp_lab_result", label: "Clinic Visit — syphilis laboratory result" }, { date: "pv_syp_lab_test_date", result: "pv_syphilis_result", prep: true, label: "PrEP Visit — syphilis laboratory result" }],
  hcv: [{ date: "cnv_hcv_lab_test_date", result: "cnv_hcv_lab_result", label: "Clinic Visit — HCV laboratory result" }, { date: "pv_hcv_lab_test_date", result: "pv_hcv_result", prep: true, label: "PrEP Visit — HCV laboratory result" }],
  hbv: [{ date: "cnv_hbv_lab_test_date", result: "cnv_hbv_lab_result", label: "Clinic Visit — HBV laboratory result" }, { date: "pv_hbv_lab_test_date", result: "pv_hbv_result", prep: true, label: "PrEP Visit — HBV laboratory result" }],
};

const commoditySources: Record<Commodity, CommoditySource[]> = {
  maleCondoms: [
    { date: "oc_date", quantity: "oc_male_condoms", label: "Outreach Contact" },
    { date: "cnv_date", quantity: "cnv_num_male_condoms", label: "Clinic Visit" },
    { date: "hcs_date", quantity: "hcs_num_male_condoms", label: "HIV Care Support" },
  ],
  femaleCondoms: [
    { date: "oc_date", quantity: "oc_female_condoms", label: "Outreach Contact" },
    { date: "cnv_date", quantity: "cnv_num_female_condoms", label: "Clinic Visit" },
    { date: "hcs_date", quantity: "hcs_num_female_condoms", label: "HIV Care Support" },
  ],
  lube: [
    { date: "oc_date", quantity: "oc_lubricant", label: "Outreach Contact" },
    { date: "cnv_date", quantity: "cnv_num_lube", label: "Clinic Visit" },
    { date: "hcs_date", quantity: "hcs_num_lube", label: "HIV Care Support" },
  ],
  syringes: [{ date: "oc_date", quantity: "oc_syringes", label: "Outreach Contact" }],
  needles: [
    { date: "oc_date", quantity: "oc_num_needles", label: "Outreach Contact" },
    { date: "cnv_date", quantity: "cnv_num_needles", label: "Clinic Visit (combined needles/syringes field)" },
    { date: "hcs_date", quantity: "hcs_num_needles", label: "HIV Care Support (combined needles/syringes field)" },
  ],
};


const todayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Indian/Mauritius", year: "numeric", month: "2-digit", day: "2-digit" });
const ymd = (date: Date) => date.toISOString().slice(0, 10);
function validDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const value = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(value.getTime()) && ymd(value) === date;
}
function subtractMonths(date: Date, months: number) {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() - months);
  const last = new Date(result);
  last.setUTCMonth(last.getUTCMonth() + 1);
  last.setUTCDate(0);
  result.setUTCDate(Math.min(day, last.getUTCDate()));
  return result;
}
export function rangeFor(period: Period, now = new Date()) {
  const end = todayFormatter.format(now);
  if (period === "all") return { start: null, end, label: "All available records" };
  let start = new Date(`${end}T00:00:00Z`);
  if (period === "year") start = subtractMonths(start, 12);
  if (period === "quarter") start = subtractMonths(start, 3);
  if (period === "month") start = subtractMonths(start, 1);
  if (period === "week") start.setUTCDate(start.getUTCDate() - 6);
  const labels = { year: "Rolling 12 months", quarter: "Rolling 3 months", month: "Rolling month", week: "Last 7 calendar days", day: "Today" };
  return { start: ymd(start), end, label: labels[period] };
}
export function parseMultiFilter(value: string | null, allowed: Set<string>) {
  if (!value || value === "all") return [];
  const selected = [...new Set(value.split(",").filter(Boolean))];
  return selected.length > 0 && selected.every(item => allowed.has(item)) ? selected : null;
}
function inRange(date: string, start: string | null, end: string) {
  return validDate(date) && (!start || date >= start) && date <= end;
}
function matchesClient(recordId: string, demographics: Map<string, Demographics>, genders: string[], kps: string[]) {
  if (!genders.length && !kps.length) return true;
  const client = demographics.get(recordId);
  return Boolean(client && (!genders.length || genders.includes(client.gender)) && (!kps.length || client.kps.some(kp => kps.includes(kp))));
}
function purposeAllows(row: Values, field: string, code: string) {
  const raw = row[field]?.trim();
  const checkboxes = Object.keys(row).filter(key => key.startsWith(`${field}___`));
  // Empty/all-zero purpose sets also occur on legacy exports. Retain them;
  // an actual selection of other purposes makes these fields ineligible.
  const selected = checkboxes.filter(key => row[key] === "1");
  if (selected.length) return row[`${field}___${code}`] === "1";
  if (!raw) return true;
  try { const value = JSON.parse(raw); if (Array.isArray(value)) return value.map(String).includes(code); } catch { /* Comma-separated legacy values. */ }
  return raw.split(",").map(value => value.trim()).includes(code);
}
function sourceMatches(row: Values, field: string) {
  const instrument = field.startsWith("oc_") ? "outreach_contact" : field.startsWith("cnv_") ? "clinic_visit" : field.startsWith("pv_") ? "prep_visit" : "hiv_care_support";
  // Permit legacy flat exports without repeat identity, but never another instrument's row.
  return !row.redcap_repeat_instrument || row.redcap_repeat_instrument === instrument;
}
function visibleTest(row: Values, source: Source) {
  if (!sourceMatches(row, source.result)) return false;
  if (source.prep) {
    const infection = source.result === "pv_syphilis_result" ? "syp" : source.result.split("_")[1];
    return row[`pv_${infection}_lab_test_done`] !== "0";
  }
  if (!source.result.startsWith("cnv_")) return true;
  return row.cnv_no_show !== "1" && purposeAllows(row, "cnv_visit_purpose", "3") && row[source.result.replace("_lab_result", "_lab_test_done")] !== "0";
}
const standardOutcomes: Record<string, Outcome> = { "1": "positive", "2": "negative", "3": "indeterminate", "4": "invalid" };
function outcomeFor(result: string, source: Source): Outcome | null {
  if (!source.prep) {
    // Outreach non-HIV instruments have only reactive/non-reactive choices.
    if (source.result.startsWith("oc_") && source.result !== "oc_hiv_rapid_result" && !["1", "2"].includes(result)) return null;
    return standardOutcomes[result] ?? null;
  }
  if (source.result !== "pv_syphilis_result") return standardOutcomes[result] ?? null;
  // All typed PrEP laboratory results use the CNV radio scheme.
  if (standardOutcomes[result]) return standardOutcomes[result];
  // Preserve visibility of unexpected legacy text without interpreting titres.
  const text = result.toLowerCase().trim().replace(/[–—-]/g, " ").replace(/\s+/g, " ");
  if (!text || ["not requested", "result unavailable", "unavailable", "pending", "not done", "n/a"].includes(text)) return null;
  return ({ positive: "positive", reactive: "positive", negative: "negative", "non reactive": "negative", nonreactive: "negative", indeterminate: "indeterminate", invalid: "invalid" } as Record<string, Outcome>)[text] ?? "unclassified";
}
function emptyTotals(): Record<Infection, number> { return { hiv: 0, syphilis: 0, hcv: 0, hbv: 0 }; }
function emptyOutcomes() {
  return Object.fromEntries(infections.map(infection => [infection, Object.fromEntries(outcomes.map(outcome => [outcome, 0]))])) as Record<Infection, Record<Outcome, number>>;
}
function bucket(date: string, period: Period) {
  return ["day", "week", "month"].includes(period) ? date : date.slice(0, 7);
}
function aggregateTests(rows: Values[], sources: Record<Infection, Source[]>, demographics: Map<string, Demographics>, genders: string[], kps: string[], period: Period, start: string | null, end: string, includeUics: boolean) {
  const totals = emptyTotals(), firstTime = emptyTotals(), outcomeTotals = emptyOutcomes();
  const trend = new Map<string, number>(), clients = new Set<string>();
  const contributors = { totals: {} as Record<Infection, Map<string, number>>, firstTime: {} as Record<Infection, Map<string, number>>, outcomes: {} as Record<Infection, Record<Outcome, Map<string, number>>> };
  if (includeUics) for (const infection of infections) {
    contributors.totals[infection] = new Map();
    contributors.firstTime[infection] = new Map();
    contributors.outcomes[infection] = Object.fromEntries(outcomes.map(outcome => [outcome, new Map<string, number>()])) as Record<Outcome, Map<string, number>>;
  }
  // Each method is aggregated separately: a rapid and a laboratory test on
  // the same day remain separate. Repeat rows and Clinic/PrEP copies do not.
  const distinct = new Map<string, { recordId: string; infection: Infection; date: string; outcomes: Set<Outcome>; firstTime: boolean }>();
  for (const row of rows) {
    const recordId = row.uic_ori?.trim();
    if (!recordId || !matchesClient(recordId, demographics, genders, kps)) continue;
    for (const infection of infections) for (const source of sources[infection]) {
      if (!visibleTest(row, source)) continue;
      const result = row[source.result]?.trim() ?? "";
      const outcome = outcomeFor(result, source);
      if (!outcome) continue;
      // Use the per-infection date first. Legacy PrEP dates fall back to collection,
      // then visit, only when the preferred date is absent, never invalid.
      const date = row[source.date]?.trim() || (source.prep ? row.pv_blood_collected_date?.trim() || row.pv_visit_date?.trim() : "") || "";
      if (!inRange(date, start, end)) continue;
      const key = JSON.stringify([recordId, infection, date]);
      const test = distinct.get(key) ?? { recordId, infection, date, outcomes: new Set<Outcome>(), firstTime: false };
      test.outcomes.add(outcome);
      test.firstTime ||= Boolean(source.previousStatus && row[source.previousStatus]?.trim() === "3");
      distinct.set(key, test);
    }
  }
  const encounterDays = new Set<string>();
  for (const test of distinct.values()) {
    // Never pick a result by import order, source priority or clinical severity.
    const outcome = test.outcomes.size > 1 ? "conflicting" : [...test.outcomes][0];
    totals[test.infection]++;
    outcomeTotals[test.infection][outcome]++;
    if (test.firstTime) firstTime[test.infection]++;
    if (includeUics) {
      const maps = [contributors.totals[test.infection], contributors.outcomes[test.infection][outcome], ...(test.firstTime ? [contributors.firstTime[test.infection]] : [])];
      for (const map of maps) map.set(test.recordId, (map.get(test.recordId) ?? 0) + 1);
    }
    const label = bucket(test.date, period);
    trend.set(label, (trend.get(label) ?? 0) + 1);
    clients.add(test.recordId);
    encounterDays.add(JSON.stringify([test.recordId, test.date]));
  }
  const encounters = encounterDays.size;
  const uics = includeUics ? {
    totals: Object.fromEntries(infections.map(infection => [infection, Object.fromEntries(contributors.totals[infection])])),
    firstTime: Object.fromEntries(infections.map(infection => [infection, Object.fromEntries(contributors.firstTime[infection])])),
    outcomes: Object.fromEntries(infections.map(infection => [infection, Object.fromEntries(outcomes.map(outcome => [outcome, Object.fromEntries(contributors.outcomes[infection][outcome])]))])),
  } : undefined;
  return { totals, firstTime, outcomes: outcomeTotals, encounters, clients, trend, uics };
}
function aggregateCommodities(rows: Values[], demographics: Map<string, Demographics>, genders: string[], kps: string[], start: string | null, end: string, includeUics: boolean) {
  const totals: Record<Commodity, number> = { maleCondoms: 0, femaleCondoms: 0, lube: 0, syringes: 0, needles: 0 };
  const clients = new Set<string>();
  const contributors = Object.fromEntries(Object.keys(commoditySources).map(commodity => [commodity, new Map<string, number>()]));
  for (const row of rows) {
    const recordId = row.uic_ori?.trim();
    if (!recordId || !matchesClient(recordId, demographics, genders, kps)) continue;
    for (const commodity of Object.keys(commoditySources) as Commodity[]) for (const source of commoditySources[commodity]) {
      if (!sourceMatches(row, source.quantity)) continue;
      if (source.quantity.startsWith("cnv_") && (row.cnv_no_show === "1" || !purposeAllows(row, "cnv_visit_purpose", "16"))) continue;
      if (source.quantity.startsWith("hcs_") && row.hcs_status_only === "1") continue;
      const quantity = Number(row[source.quantity]);
      if (!Number.isSafeInteger(quantity) || quantity <= 0) continue;
      if (!inRange(row[source.date]?.trim() ?? "", start, end)) continue;
      totals[commodity] += quantity;
      clients.add(recordId);
      if (includeUics) contributors[commodity].set(recordId, (contributors[commodity].get(recordId) ?? 0) + quantity);
    }
  }
  return { totals, clients, uics: includeUics ? Object.fromEntries(Object.entries(contributors).map(([commodity, map]) => [commodity, Object.fromEntries(map)])) : undefined, sources: Object.fromEntries((Object.keys(commoditySources) as Commodity[]).map(commodity => [commodity, commoditySources[commodity].map(({ label, quantity }) => `${label} — ${quantity}`)])) };
}
function trendLabels(period: Period, start: string | null, end: string, rapid: Map<string, number>, lab: Map<string, number>) {
  const observed = [...rapid.keys(), ...lab.keys()].sort();
  const first = start ? bucket(start, period) : observed[0];
  if (!first) return [];
  const daily = ["day", "week", "month"].includes(period);
  const cursor = new Date(`${daily ? first : first + "-01"}T00:00:00Z`);
  const last = bucket(end, period), labels: string[] = [];
  while (bucket(ymd(cursor), period) <= last) {
    labels.push(bucket(ymd(cursor), period));
    if (daily) cursor.setUTCDate(cursor.getUTCDate() + 1);
    else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return labels;
}
const allSources = [...Object.values(rapidSources).flat(), ...Object.values(labSources).flat()];
const allCommoditySources = Object.values(commoditySources).flat();
export const dashboardFields = [...new Set(["uic_ori", "ce_gender_identity", "ce_kp_type", "cnv_no_show", "cnv_visit_purpose", "hcs_status_only", "pv_visit_date", "pv_blood_collected_date", "pv_visit_purpose", "pv_hiv_lab_test_done", "pv_hbv_lab_test_done", "pv_hcv_lab_test_done", "pv_syp_lab_test_done", ...allSources.filter(source => source.result.startsWith("cnv_")).map(source => source.result.replace("_lab_result", "_lab_test_done")), ...allSources.flatMap(source => [source.date, source.result, source.previousStatus].filter((field): field is string => Boolean(field))), ...allCommoditySources.flatMap(source => [source.date, source.quantity])])];

export const defaultDashboardFields = [...dashboardFields];
const indicatorFields = [
  "oc_type", "oc_hotspot", "oc_hiv_comms", "oc_hepc_comms", "oc_hepb_comms", "oc_syp_comms", "oc_prep_com", "oc_prep_interested",
  "breakfast_date", "breakfast_present_8edd8b", "hcs_date", "hcs_care_type",
  "htp_diagnosis_date", "htp_art_start_date", "htm_vl_date", "htm_viral_load_detectable", "htm_vl_level",
  "pv_medication_dispensed", "ptp_previous_use", "ptp_update_date", "ptp_start_date",
  "pv_next_med_date", "pv_next_blood_date", "pv_next_doctor_date", "pv_next_lab_review_date", "pv_next_appointment_date",
  "cr_date", "sr_date",
];
dashboardFields.push(...indicatorFields.filter(field => !dashboardFields.includes(field)));

// A repeat instance is an encounter, not a patient-day. Exact duplicate exports
// merge; distinct repeat instances on the same day remain separate encounters.
function encounterRows(rows: Values[], instrument: string, dateField: string) {
  const seen = new Set<string>();
  return rows.filter(row => {
    if (row.redcap_repeat_instrument && row.redcap_repeat_instrument !== instrument) return false;
    if (dateField && !row[dateField]) return false;
    const identity = row.redcap_repeat_instance
      ? [row.uic_ori, instrument, row.redcap_event_name ?? "", row.redcap_repeat_instance]
      : Object.entries(row).sort(([a], [b]) => a.localeCompare(b));
    const key = JSON.stringify(identity);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildIndicators(rows: Values[], start: string | null, end: string): IndicatorValues {
  const during = (date: string) => inRange(date ?? "", start, end);
  const byCutoff = (date: string) => inRange(date ?? "", null, end);
  const rate = (numerator: number, denominator: number) => denominator ? numerator / denominator * 100 : null;
  const selected = (row: Values, field: string, code: string) => row[`${field}___${code}`] === "1" || (row[field] ?? "").split(",").map(value => value.trim()).includes(code);
  const outreach = encounterRows(rows, "outreach_contact", "oc_date").filter(row => byCutoff(row.oc_date));
  const communications = ["oc_hiv_comms", "oc_hepc_comms", "oc_hepb_comms", "oc_syp_comms", "oc_prep_com"];
  // SID, Outreach, SDM/NADC, Rainbow, Hotspot/NADC and 4BAZ are prevention
  // activity types. Other contact types qualify only with recorded IEC evidence.
  const preventionTypes = new Set(["1", "3", "5", "6", "9", "12"]);
  const prevention = outreach.filter(row => preventionTypes.has(row.oc_type) || communications.some(field => row[field] === "1"));
  const attendances = prevention.filter(row => during(row.oc_date));
  const site = (row: Values) => row.oc_hotspot?.trim().normalize("NFKC").replace(/\s+/g, " ").toLowerCase() ?? "";
  const siteVisits = attendances.filter(row => site(row) && preventionTypes.has(row.oc_type));
  const activities = new Set(siteVisits.map(row => JSON.stringify([row.oc_date, site(row)])));
  const care = encounterRows(rows, "hiv_care_support", "hcs_date").filter(row => row.hcs_status_only !== "1" && during(row.hcs_date));
  const fourBazOutreach = outreach.filter(row => row.oc_type === "12" && during(row.oc_date));
  const fourBazDays = new Set(fourBazOutreach.map(row => JSON.stringify([row.uic_ori, row.oc_date])));
  const fourBazCare = care.filter(row => selected(row, "hcs_care_type", "9") && !fourBazDays.has(JSON.stringify([row.uic_ori, row.hcs_date])));

  const screeningFields = {
    HIV: ["oc_hiv_rapid_result", "oc_hiv_status_prev"],
    HCV: ["oc_hepc_result", "oc_hepc_status_prev"],
    SYP: ["oc_syp_result", "oc_syp_status_prev"],
  } as const;
  const firstTests: Record<string, number> = {}, firstReactivity: Record<string, number | null> = {}, reactivity: Record<string, number | null> = {};
  const reactive: Record<string, number> = {};
  for (const [infection, [resultField, previousField]] of Object.entries(screeningFields)) {
    const people = new Map<string, Values[]>();
    for (const row of outreach) {
      if (!(infection === "HIV" ? ["1", "2", "3", "4"] : ["1", "2"]).includes(row[resultField])) continue;
      const history = people.get(row.uic_ori) ?? [];
      history.push(row);
      people.set(row.uic_ori, history);
    }
    let first = 0, firstPositive = 0, firstValid = 0, positive = 0, valid = 0;
    for (const history of people.values()) {
      const candidates = history.filter(row => row[previousField] === "3").sort((a, b) => a.oc_date.localeCompare(b.oc_date));
      const firstDate = candidates[0]?.oc_date;
      if (firstDate && during(firstDate)) {
        first++;
        const results = new Set(candidates.filter(row => row.oc_date === firstDate).map(row => row[resultField]));
        if (results.size === 1 && ["1", "2"].includes([...results][0])) {
          firstValid++;
          if (results.has("1")) firstPositive++;
        }
      }
      const periodTests = history.filter(row => during(row.oc_date)).sort((a, b) => b.oc_date.localeCompare(a.oc_date));
      const latestDate = periodTests[0]?.oc_date;
      const results = new Set(periodTests.filter(row => row.oc_date === latestDate).map(row => row[resultField]));
      // Same-date disagreements cannot be ordered safely without test times.
      if (results.size === 1 && ["1", "2"].includes([...results][0])) {
        valid++;
        if (results.has("1")) positive++;
      }
    }
    firstTests[infection] = first;
    firstReactivity[infection] = rate(firstPositive, firstValid);
    reactive[infection] = positive;
    reactivity[infection] = rate(positive, valid);
  }
  const tested = (row: Values) => Object.entries(screeningFields).some(([infection, [field]]) => (infection === "HIV" ? ["1", "2", "3", "4"] : ["1", "2"]).includes(row[field]));
  const prep = encounterRows(rows, "prep_visit", "pv_visit_date").filter(row => byCutoff(row.pv_visit_date));
  let testingEncounters = outreach.filter(row => during(row.oc_date) && tested(row)).length;
  for (const instrument of ["clinic_visit", "prep_visit"]) {
    for (const row of encounterRows(rows, instrument, "")) {
      const testDates = new Set<string>();
      for (const infection of ["hiv", "hcv", "syphilis"] as const) for (const source of labSources[infection]) {
        if ((source.prep ? "prep_visit" : "clinic_visit") !== instrument || !visibleTest(row, source)) continue;
        if (!outcomeFor(row[source.result]?.trim() ?? "", source)) continue;
        const date = row[source.date]?.trim() || (source.prep ? row.pv_blood_collected_date?.trim() || row.pv_visit_date?.trim() : "") || "";
        if (during(date)) testDates.add(date);
      }
      testingEncounters += testDates.size;
    }
  }
  const starts = new Map<string, string>();
  for (const row of prep) {
    if (!Number.isFinite(Number(row.pv_medication_dispensed)) || Number(row.pv_medication_dispensed) <= 0) continue;
    const old = starts.get(row.uic_ori);
    if (!old || row.pv_visit_date < old) starts.set(row.uic_ori, row.pv_visit_date);
  }
  const profiles = rows.filter(row => !row.redcap_repeat_instrument || row.redcap_repeat_instrument === "prep_treatment_profile");
  // Only explicit no-prior-use evidence supports a first-ever initiation.
  const firstUse = new Set(profiles.filter(row => row.ptp_previous_use === "0" && byCutoff(row.ptp_update_date || row.ptp_start_date)).map(row => row.uic_ori));
  const priorUse = new Set(profiles.filter(row => row.ptp_previous_use === "1" && byCutoff(row.ptp_update_date || row.ptp_start_date)).map(row => row.uic_ori));
  const hivProfiles = rows.filter(row => !row.redcap_repeat_instrument || row.redcap_repeat_instrument === "hiv_treatment_profile");
  const diagnoses = new Map<string, string>();
  const artStarts = new Map<string, string>();
  for (const row of hivProfiles) {
    for (const [field, dates] of [["htp_diagnosis_date", diagnoses], ["htp_art_start_date", artStarts]] as const) {
      const date = row[field];
      if (byCutoff(date) && (!dates.has(row.uic_ori) || date < dates.get(row.uic_ori)!)) dates.set(row.uic_ori, date);
    }
  }
  // A clinical diagnosis or ART start establishes the HIV cohort. Historical
  // positive screening alone is not confirmation of HIV infection.
  const hivPeople = new Set([...diagnoses.keys(), ...artStarts.keys()]);
  const monitoring = encounterRows(rows, "hiv_clinical_monitoring", "htm_vl_date").filter(row => byCutoff(row.htm_vl_date) && hivPeople.has(row.uic_ori));
  const viralLoads = new Map<string, Values[]>();
  for (const row of monitoring) {
    const history = viralLoads.get(row.uic_ori) ?? [];
    history.push(row);
    viralLoads.set(row.uic_ori, history);
  }
  const suppressed = (row: Values): boolean | null => {
    const raw = row.htm_vl_level?.trim() ?? "";
    const numeric = raw !== "" && Number.isFinite(Number(raw)) && Number(raw) >= 0 ? Number(raw) < 40 : null;
    if (raw && numeric === null) return null;
    const category = row.htm_viral_load_detectable;
    if (["3", "4"].includes(category)) return null;
    if (category === "2") return numeric === false ? null : true;
    // Detectable below 40 still qualifies under the agreed numeric threshold.
    if (numeric !== null) return numeric;
    return category === "1" ? false : null;
  };
  let undetectable = 0, withVl = 0;
  for (const history of viralLoads.values()) {
    const latestDate = history.map(row => row.htm_vl_date).sort().at(-1);
    const outcomes = history.filter(row => row.htm_vl_date === latestDate).map(suppressed);
    if (outcomes.includes(null) || new Set(outcomes).size !== 1) continue;
    withVl++;
    if (outcomes[0]) undetectable++;
  }
  let missedPrep = 0;
  const prepPeople = new Map<string, Values[]>();
  for (const row of prep) {
    const history = prepPeople.get(row.uic_ori) ?? [];
    history.push(row);
    prepPeople.set(row.uic_ori, history);
  }
  for (const history of prepPeople.values()) {
    const missed = history.some(row => ["pv_next_med_date", "pv_next_blood_date", "pv_next_doctor_date", "pv_next_lab_review_date", "pv_next_appointment_date"].some(field => {
      const due = row[field];
      return byCutoff(due) && due > row.pv_visit_date && due < end && !history.some(visit => visit.pv_visit_date >= due);
    }));
    if (missed) missedPrep++;
  }
  return {
    reach: attendances.length, firstTests, firstReactivity,
    fourBaz: fourBazOutreach.length + fourBazCare.length,
    undetectable, outreachActivities: activities.size,
    averageReach: activities.size ? siteVisits.length / activities.size : null,
    hivAfterPrep: rate([...starts].filter(([id, date]) => (diagnoses.get(id) ?? "") > date).length, starts.size),
    testingCoverage: rate(testingEncounters, attendances.length),
    breakfast: encounterRows(rows, "breakfast_attendance", "breakfast_date").filter(row => during(row.breakfast_date) && row.breakfast_present_8edd8b === "1").length,
    prepInitiations: [...starts].filter(([id, date]) => during(date) && firstUse.has(id) && !priorUse.has(id)).length,
    arvInitiations: [...artStarts.values()].filter(during).length,
    hospital: care.filter(row => selected(row, "hcs_care_type", "3")).length,
    eyeHospital: care.filter(row => selected(row, "hcs_care_type", "2")).length,
    siteReach: siteVisits.length,
    hivRapidTests: outreach.filter(row => during(row.oc_date) && ["1", "2", "3", "4"].includes(row.oc_hiv_rapid_result)).length,
    hivReactive: reactive.HIV, hcvReactive: reactive.HCV, sypReactive: reactive.SYP,
    referrals: encounterRows(rows, "clinical_referral", "cr_date").filter(row => during(row.cr_date)).length + encounterRows(rows, "social_referral", "sr_date").filter(row => during(row.sr_date)).length,
    missedPrep, reactivity, suppression: rate(undetectable, withVl),
    prepSensitised: rate(attendances.filter(row => row.oc_prep_com === "1").length, attendances.length),
    prepInterested: rate(attendances.filter(row => row.oc_prep_interested === "1").length, attendances.length),
  };
}

export function buildDashboard(rows: Values[], filters: { period: Period; genders: string[]; kps: string[] }, now = new Date(), includeExecutive = true, includeUics = false) {
  const { period, genders, kps } = filters, range = rangeFor(period, now);
  const demographics = new Map<string, Demographics>();
  for (const row of rows) {
    if (!row.uic_ori?.trim() || row.redcap_repeat_instrument) continue;
    demographics.set(row.uic_ori.trim(), { gender: row.ce_gender_identity?.trim() ?? "", kps: Array.from({ length: 8 }, (_, index) => String(index + 1)).filter(code => row[`ce_kp_type___${code}`] === "1") });
  }
  const rapid = aggregateTests(rows, rapidSources, demographics, genders, kps, period, range.start, range.end, includeUics);
  const lab = aggregateTests(rows, labSources, demographics, genders, kps, period, range.start, range.end, includeUics);
  const commodities = aggregateCommodities(rows, demographics, genders, kps, range.start, range.end, includeUics);
  const labels = trendLabels(period, range.start, range.end, rapid.trend, lab.trend);
  const sources = (definitions: Record<Infection, Source[]>) => Object.fromEntries(infections.map(infection => [infection, definitions[infection].map(source => source.label)]));
  return {
    filters, range,
    ...(includeUics ? { barContributors: { rapid: rapid.uics, lab: lab.uics, commodities: commodities.uics } } : {}),
    ...(includeExecutive ? { indicators: buildIndicators(rows.filter(row => row.uic_ori?.trim() && matchesClient(row.uic_ori.trim(), demographics, genders, kps)), range.start, range.end) } : {}),
    summary: { clients: new Set([...rapid.clients, ...lab.clients, ...commodities.clients]).size, rapidEncounters: rapid.encounters, labEncounters: lab.encounters, commodityUnits: Object.values(commodities.totals).reduce((sum, value) => sum + value, 0) },
    rapid: { totals: rapid.totals, firstTime: rapid.firstTime, outcomes: rapid.outcomes, sources: sources(rapidSources) },
    lab: { totals: lab.totals, outcomes: lab.outcomes, sources: sources(labSources) },
    trend: { labels, rapid: labels.map(label => rapid.trend.get(label) ?? 0), laboratory: labels.map(label => lab.trend.get(label) ?? 0) },
    commodities: { totals: commodities.totals, sources: commodities.sources },
    generatedAt: now.toISOString(),
  };
}
