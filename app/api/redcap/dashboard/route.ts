import { NextResponse } from "next/server";
import { getCurrentUser, hasRole } from "@/lib/auth";

const REDCAP_API_URL = process.env.REDCAP_API_URL;
const REDCAP_API_TOKEN = process.env.REDCAP_API_TOKEN;

type Values = Record<string, string>;
type Period = "all" | "year" | "quarter" | "month" | "week" | "day";
type Infection = "hiv" | "syphilis" | "hcv" | "hbv";
type Outcome = "positive" | "negative" | "indeterminate" | "invalid";
type Source = { date: string; result: string; label: string; previousStatus?: string };
type Commodity = "maleCondoms" | "femaleCondoms" | "lube" | "syringes" | "needles";
type CommoditySource = { date: string; quantity: string; label: string };
type Demographics = { gender: string; kps: string[] };

const periods = new Set<Period>(["all", "year", "quarter", "month", "week", "day"]);
const genderCodes = new Set(["1", "2", "3", "4", "5", "9"]);
const kpCodes = new Set(["1", "2", "3", "4", "5", "6", "7", "8"]);
const infections: Infection[] = ["hiv", "syphilis", "hcv", "hbv"];
const outcomes: Outcome[] = ["positive", "negative", "indeterminate", "invalid"];

const rapidSources: Record<Infection, Source[]> = {
  hiv: [{ date: "oc_date", result: "oc_hiv_rapid_result", previousStatus: "oc_hiv_status_prev", label: "Outreach Contact — HIV rapid result" }],
  syphilis: [{ date: "oc_date", result: "oc_syp_result", previousStatus: "oc_syp_status_prev", label: "Outreach Contact — syphilis rapid result" }],
  hcv: [{ date: "oc_date", result: "oc_hepc_result", previousStatus: "oc_hepc_status_prev", label: "Outreach Contact — HCV rapid result" }],
  hbv: [{ date: "oc_date", result: "oc_hepb_result", previousStatus: "oc_hepb_status_prev", label: "Outreach Contact — HBV rapid result" }],
};

const labSources: Record<Infection, Source[]> = {
  hiv: [{ date: "cnv_hiv_lab_test_date", result: "cnv_hiv_lab_result", label: "Clinic Visit — HIV laboratory result" }],
  syphilis: [{ date: "cnv_syp_lab_test_date", result: "cnv_syp_lab_result", label: "Clinic Visit — syphilis laboratory result" }],
  hcv: [{ date: "cnv_hcv_lab_test_date", result: "cnv_hcv_lab_result", label: "Clinic Visit — HCV laboratory result" }],
  hbv: [{ date: "cnv_hbv_lab_test_date", result: "cnv_hbv_lab_result", label: "Clinic Visit — HBV laboratory result" }],
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

function ymd(date: Date) { return date.toISOString().slice(0, 10); }

function rangeFor(period: Period) {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (period === "all") return { start: null, end: ymd(end), label: "All available records" };
  const start = new Date(end);
  if (period === "year") start.setUTCFullYear(start.getUTCFullYear() - 1);
  if (period === "quarter") start.setUTCMonth(start.getUTCMonth() - 3);
  if (period === "month") start.setUTCMonth(start.getUTCMonth() - 1);
  if (period === "week") start.setUTCDate(start.getUTCDate() - 6);
  const labels: Record<Exclude<Period, "all">, string> = { year: "Rolling 12 months", quarter: "Rolling 3 months", month: "Rolling month", week: "Last 7 calendar days", day: "Today" };
  return { start: ymd(start), end: ymd(end), label: labels[period] };
}

async function redcap(params: Record<string, string>) {
  if (!REDCAP_API_URL || !REDCAP_API_TOKEN) throw new Error("REDCap API configuration is missing.");
  const response = await fetch(REDCAP_API_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: REDCAP_API_TOKEN, ...params }), cache: "no-store" });
  const text = await response.text();
  let result: unknown;
  try { result = JSON.parse(text); } catch { throw new Error(text.startsWith("<!DOCTYPE") ? "REDCap returned an HTML page instead of data." : "REDCap returned an invalid response."); }
  if (!response.ok || (result && typeof result === "object" && "error" in result)) {
    const message = result && typeof result === "object" && "error" in result ? String((result as { error: unknown }).error) : `REDCap returned HTTP ${response.status}.`;
    throw new Error(message);
  }
  return Array.isArray(result) ? result as Values[] : [];
}

function emptyTotals(): Record<Infection, number> { return { hiv: 0, syphilis: 0, hcv: 0, hbv: 0 }; }
function emptyOutcomes(): Record<Infection, Record<Outcome, number>> {
  return Object.fromEntries(infections.map((infection) => [infection, Object.fromEntries(outcomes.map((outcome) => [outcome, 0]))])) as Record<Infection, Record<Outcome, number>>;
}
function outcomeFor(code: string): Outcome | null {
  return ({ "1": "positive", "2": "negative", "3": "indeterminate", "4": "invalid" } as Record<string, Outcome>)[code] ?? null;
}
function parseMultiFilter(value: string | null, allowed: Set<string>) {
  if (!value || value === "all") return [];
  const selected = [...new Set(value.split(",").filter(Boolean))];
  return selected.length > 0 && selected.every((item) => allowed.has(item)) ? selected : null;
}
function matchesClient(recordId: string, demographics: Map<string, Demographics>, genders: string[], kps: string[]) {
  if (genders.length === 0 && kps.length === 0) return true;
  const client = demographics.get(recordId);
  return Boolean(client && (genders.length === 0 || genders.includes(client.gender)) && (kps.length === 0 || client.kps.some((kp) => kps.includes(kp))));
}
function inRange(date: string, start: string | null, end: string) {
  return !start || Boolean(date && date >= start && date <= end);
}
function trendBucket(date: string, period: Period) {
  return period === "day" || period === "week" || period === "month" ? date : date.slice(0, 7);
}

function aggregateTests(rows: Values[], sources: Record<Infection, Source[]>, demographics: Map<string, Demographics>, genders: string[], kps: string[], period: Period, start: string | null, end: string) {
  const totals = emptyTotals();
  const firstTime = emptyTotals();
  const outcomeTotals = emptyOutcomes();
  const trend = new Map<string, number>();
  const clients = new Set<string>();
  let encounters = 0;
  for (const row of rows) {
    const recordId = row.uic_ori?.trim();
    if (!recordId || !matchesClient(recordId, demographics, genders, kps)) continue;
    let countedEncounter = false;
    for (const infection of infections) for (const source of sources[infection]) {
      const result = row[source.result]?.trim();
      if (!result) continue;
      const date = row[source.date]?.trim() ?? "";
      if (!inRange(date, start, end)) continue;
      totals[infection] += 1;
      if (source.previousStatus && row[source.previousStatus]?.trim() === "3") firstTime[infection] += 1;
      const outcome = outcomeFor(result);
      if (outcome) outcomeTotals[infection][outcome] += 1;
      if (date) {
        const bucket = trendBucket(date, period);
        trend.set(bucket, (trend.get(bucket) ?? 0) + 1);
      }
      countedEncounter = true;
      clients.add(recordId);
    }
    if (countedEncounter) encounters += 1;
  }
  return { totals, firstTime, outcomes: outcomeTotals, encounters, clients, trend };
}

function aggregateCommodities(rows: Values[], demographics: Map<string, Demographics>, genders: string[], kps: string[], start: string | null, end: string) {
  const totals: Record<Commodity, number> = { maleCondoms: 0, femaleCondoms: 0, lube: 0, syringes: 0, needles: 0 };
  const clients = new Set<string>();
  for (const row of rows) {
    const recordId = row.uic_ori?.trim();
    if (!recordId || !matchesClient(recordId, demographics, genders, kps)) continue;
    for (const commodity of Object.keys(commoditySources) as Commodity[]) for (const source of commoditySources[commodity]) {
      const quantity = Number(row[source.quantity]);
      if (!Number.isFinite(quantity) || quantity <= 0) continue;
      const date = row[source.date]?.trim() ?? "";
      if (!inRange(date, start, end)) continue;
      totals[commodity] += quantity;
      clients.add(recordId);
    }
  }
  return { totals, clients, sources: Object.fromEntries((Object.keys(commoditySources) as Commodity[]).map((commodity) => [commodity, commoditySources[commodity].map(({ label, quantity }) => `${label} — ${quantity}`)])) };
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!hasRole(user, "ADMIN")) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });

  const search = new URL(request.url).searchParams;
  const period = search.get("period") ?? "all";
  const genders = parseMultiFilter(search.get("gender"), genderCodes);
  const kps = parseMultiFilter(search.get("kp"), kpCodes);
  if (!periods.has(period as Period) || genders === null || kps === null) return NextResponse.json({ error: "Invalid dashboard filter." }, { status: 400 });
  const range = rangeFor(period as Period);

  try {
    const allSources = [...Object.values(rapidSources).flat(), ...Object.values(labSources).flat()];
    const allCommoditySources = Object.values(commoditySources).flat();
    const fields = ["uic_ori", "ce_gender_identity", "ce_kp_type", ...new Set([...allSources.flatMap((source) => [source.date, source.result, source.previousStatus].filter((field): field is string => Boolean(field))), ...allCommoditySources.flatMap((source) => [source.date, source.quantity])])];
    const params: Record<string, string> = { content: "record", action: "export", format: "json", type: "flat", rawOrLabel: "raw", rawOrLabelHeaders: "raw", exportCheckboxLabel: "false", exportDataAccessGroups: "false", returnFormat: "json" };
    fields.forEach((field, index) => { params[`fields[${index}]`] = field; });
    const rows = await redcap(params);
    const demographics = new Map<string, Demographics>();
    for (const row of rows) {
      if (!row.uic_ori || row.redcap_repeat_instrument) continue;
      demographics.set(row.uic_ori, { gender: row.ce_gender_identity ?? "", kps: Array.from({ length: 8 }, (_, index) => String(index + 1)).filter((code) => row[`ce_kp_type___${code}`] === "1") });
    }

    const rapid = aggregateTests(rows, rapidSources, demographics, genders, kps, period as Period, range.start, range.end);
    const lab = aggregateTests(rows, labSources, demographics, genders, kps, period as Period, range.start, range.end);
    const commodities = aggregateCommodities(rows, demographics, genders, kps, range.start, range.end);
    const trendLabels = [...new Set([...rapid.trend.keys(), ...lab.trend.keys()])].sort();
    const representedClients = new Set([...rapid.clients, ...lab.clients, ...commodities.clients]);
    const sourceDetails = (sources: Record<Infection, Source[]>) => Object.fromEntries(infections.map((infection) => [infection, sources[infection].map(({ label }) => label)]));
    const commodityUnits = Object.values(commodities.totals).reduce((sum, value) => sum + value, 0);

    return NextResponse.json({
      filters: { period, genders, kps },
      range,
      summary: { clients: representedClients.size, rapidEncounters: rapid.encounters, labEncounters: lab.encounters, commodityUnits },
      rapid: { totals: rapid.totals, firstTime: rapid.firstTime, outcomes: rapid.outcomes, sources: sourceDetails(rapidSources) },
      lab: { totals: lab.totals, outcomes: lab.outcomes, sources: sourceDetails(labSources) },
      trend: { labels: trendLabels, rapid: trendLabels.map((label) => rapid.trend.get(label) ?? 0), laboratory: trendLabels.map((label) => lab.trend.get(label) ?? 0) },
      commodities: { totals: commodities.totals, sources: commodities.sources },
      generatedAt: new Date().toISOString(),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("REDCap dashboard error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load dashboard data." }, { status: 502 });
  }
}
