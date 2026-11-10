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
    return purposeAllows(row, "pv_visit_purpose", "4") && row[`pv_${infection}_lab_test_done`] !== "0";
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
function aggregateTests(rows: Values[], sources: Record<Infection, Source[]>, demographics: Map<string, Demographics>, genders: string[], kps: string[], period: Period, start: string | null, end: string) {
  const totals = emptyTotals(), firstTime = emptyTotals(), outcomeTotals = emptyOutcomes();
  const trend = new Map<string, number>(), clients = new Set<string>();
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
    const label = bucket(test.date, period);
    trend.set(label, (trend.get(label) ?? 0) + 1);
    clients.add(test.recordId);
    encounterDays.add(JSON.stringify([test.recordId, test.date]));
  }
  const encounters = encounterDays.size;
  return { totals, firstTime, outcomes: outcomeTotals, encounters, clients, trend };
}
function aggregateCommodities(rows: Values[], demographics: Map<string, Demographics>, genders: string[], kps: string[], start: string | null, end: string) {
  const totals: Record<Commodity, number> = { maleCondoms: 0, femaleCondoms: 0, lube: 0, syringes: 0, needles: 0 };
  const clients = new Set<string>();
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
    }
  }
  return { totals, clients, sources: Object.fromEntries((Object.keys(commoditySources) as Commodity[]).map(commodity => [commodity, commoditySources[commodity].map(({ label, quantity }) => `${label} — ${quantity}`)])) };
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

export function buildDashboard(rows: Values[], filters: { period: Period; genders: string[]; kps: string[] }, now = new Date()) {
  const { period, genders, kps } = filters, range = rangeFor(period, now);
  const demographics = new Map<string, Demographics>();
  for (const row of rows) {
    if (!row.uic_ori?.trim() || row.redcap_repeat_instrument) continue;
    demographics.set(row.uic_ori.trim(), { gender: row.ce_gender_identity?.trim() ?? "", kps: Array.from({ length: 8 }, (_, index) => String(index + 1)).filter(code => row[`ce_kp_type___${code}`] === "1") });
  }
  const rapid = aggregateTests(rows, rapidSources, demographics, genders, kps, period, range.start, range.end);
  const lab = aggregateTests(rows, labSources, demographics, genders, kps, period, range.start, range.end);
  const commodities = aggregateCommodities(rows, demographics, genders, kps, range.start, range.end);
  const labels = trendLabels(period, range.start, range.end, rapid.trend, lab.trend);
  const sources = (definitions: Record<Infection, Source[]>) => Object.fromEntries(infections.map(infection => [infection, definitions[infection].map(source => source.label)]));
  return {
    filters, range,
    summary: { clients: new Set([...rapid.clients, ...lab.clients, ...commodities.clients]).size, rapidEncounters: rapid.encounters, labEncounters: lab.encounters, commodityUnits: Object.values(commodities.totals).reduce((sum, value) => sum + value, 0) },
    rapid: { totals: rapid.totals, firstTime: rapid.firstTime, outcomes: rapid.outcomes, sources: sources(rapidSources) },
    lab: { totals: lab.totals, outcomes: lab.outcomes, sources: sources(labSources) },
    trend: { labels, rapid: labels.map(label => rapid.trend.get(label) ?? 0), laboratory: labels.map(label => lab.trend.get(label) ?? 0) },
    commodities: { totals: commodities.totals, sources: commodities.sources },
    generatedAt: now.toISOString(),
  };
}
