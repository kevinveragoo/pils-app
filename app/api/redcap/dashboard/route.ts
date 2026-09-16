import { NextResponse } from "next/server";

const REDCAP_API_URL = process.env.REDCAP_API_URL;
const REDCAP_API_TOKEN = process.env.REDCAP_API_TOKEN;
type Values = Record<string, string>;
type Period = "all" | "year" | "quarter" | "month" | "week" | "day";
type Infection = "hiv" | "syphilis" | "hcv" | "hbv";
type Source = { date: string; result: string; label: string };
type Commodity = "maleCondoms" | "femaleCondoms" | "lube" | "syringes" | "needles";
type CommoditySource = { date: string; quantity: string; label: string; worker?: string };

const periods = new Set<Period>(["all", "year", "quarter", "month", "week", "day"]);
const rapidSources: Record<Infection, Source[]> = {
  hiv: [{ date: "outreach_date", result: "outreach_hiv_rapid_result", label: "Outreach Contact — HIV rapid result" }],
  syphilis: [{ date: "outreach_date", result: "outreach_syp_result", label: "Outreach Contact — syphilis rapid result" }],
  hcv: [{ date: "outreach_date", result: "outreach_hepc_result", label: "Outreach Contact — HCV rapid result" }],
  hbv: [{ date: "outreach_date", result: "outreach_hepb_result", label: "Outreach Contact — HBV rapid result" }],
};
const labSources: Record<Infection, Source[]> = {
  hiv: [{ date: "clinic_hiv_lab_test_date", result: "clinic_hiv_lab_result", label: "Clinic Visit — HIV laboratory result" }],
  syphilis: [{ date: "clinic_syp_lab_test_date", result: "clinic_syp_lab_result", label: "Clinic Visit — syphilis laboratory result" }],
  hcv: [{ date: "clinic_hcv_lab_test_date", result: "clinic_hcv_lab_result", label: "Clinic Visit — HCV laboratory result" }],
  hbv: [{ date: "clinic_hbv_lab_test_date", result: "clinic_hbv_lab_result", label: "Clinic Visit — HBV laboratory result" }],
};
const commoditySources: Record<Commodity, CommoditySource[]> = {
  maleCondoms: [
    { date: "outreach_date", quantity: "outreach_male_condoms", label: "Outreach Contact", worker: "outreach_worker_1" },
    { date: "clinic_visit_date", quantity: "clinic_male_condoms", label: "Clinic Visit", worker: "clinic_visit_worker" },
    { date: "hiv_care_date", quantity: "hiv_male_condoms", label: "HIV Care Support", worker: "hiv_care_navigator" },
  ],
  femaleCondoms: [
    { date: "outreach_date", quantity: "outreach_female_condoms", label: "Outreach Contact", worker: "outreach_worker_1" },
    { date: "clinic_visit_date", quantity: "clinic_female_condoms", label: "Clinic Visit", worker: "clinic_visit_worker" },
    { date: "hiv_care_date", quantity: "hiv_female_condoms", label: "HIV Care Support", worker: "hiv_care_navigator" },
  ],
  lube: [
    { date: "outreach_date", quantity: "outreach_lubricant", label: "Outreach Contact", worker: "outreach_worker_1" },
    { date: "clinic_visit_date", quantity: "clinic_lube", label: "Clinic Visit", worker: "clinic_visit_worker" },
    { date: "hiv_care_date", quantity: "hiv_lube", label: "HIV Care Support", worker: "hiv_care_navigator" },
  ],
  syringes: [
    { date: "outreach_date", quantity: "outreach_syringes", label: "Outreach Contact", worker: "outreach_worker_1" },
    { date: "intervention_date", quantity: "syringe_count", label: "Testing & Prevention" },
  ],
  needles: [
    { date: "outreach_date", quantity: "outreach_needles", label: "Outreach Contact", worker: "outreach_worker_1" },
    { date: "clinic_visit_date", quantity: "clinic_needles", label: "Clinic Visit (combined needles/syringes field)", worker: "clinic_visit_worker" },
    { date: "hiv_care_date", quantity: "hiv_needles", label: "HIV Care Support (combined needles/syringes field)", worker: "hiv_care_navigator" },
    { date: "intervention_date", quantity: "needle_count", label: "Testing & Prevention" },
  ],
};
const infections: Infection[] = ["hiv", "syphilis", "hcv", "hbv"];
const kpTypes = [["1", "Sex worker"], ["2", "MSM"], ["3", "PWID"], ["4", "PPWID"], ["5", "Transgender"], ["6", "Former PWID"], ["7", "General"]] as const;

function ymd(date: Date) { return date.toISOString().slice(0, 10); }
function rangeFor(period: Period) {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (period === "all") return { start: null, end: ymd(end), label: "All available testing records" };
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
function emptyByKp(): Record<Infection, Record<string, number>> {
  return Object.fromEntries(infections.map((infection) => [infection, Object.fromEntries(kpTypes.map(([, label]) => [label, 0]))])) as Record<Infection, Record<string, number>>;
}
function aggregate(rows: Values[], sources: Record<Infection, Source[]>, clientKp: Map<string, string[]>, start: string | null, end: string) {
  const totals = emptyTotals(); const byKp = emptyByKp(); let encounters = 0;
  for (const row of rows) {
    let countedEncounter = false;
    for (const infection of infections) for (const source of sources[infection]) {
      if (!row[source.result]?.trim()) continue;
      const date = row[source.date];
      if (start && (!date || date < start || date > end)) continue;
      totals[infection] += 1; countedEncounter = true;
      for (const kp of clientKp.get(row.uic_ori) ?? []) byKp[infection][kp] += 1;
    }
    if (countedEncounter) encounters += 1;
  }
  return { totals, byKp, encounters };
}
function aggregateCommodities(rows: Values[], start: string | null, end: string) {
  const totals = { maleCondoms: 0, femaleCondoms: 0, lube: 0, syringes: 0, needles: 0 };
  const byWorker: Record<string, Record<Commodity, number>> = {};
  for (const row of rows) for (const commodity of Object.keys(commoditySources) as Commodity[]) for (const source of commoditySources[commodity]) {
    const quantity = Number(row[source.quantity]);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    const date = row[source.date];
    if (start && (!date || date < start || date > end)) continue;
    totals[commodity] += quantity;
    const worker = source.worker ? row[source.worker]?.trim() : "";
    if (worker) {
      byWorker[worker] ??= { maleCondoms: 0, femaleCondoms: 0, lube: 0, syringes: 0, needles: 0 };
      byWorker[worker][commodity] += quantity;
    }
  }
  return { totals, byWorker, workerLabels: Object.keys(byWorker).sort((a, b) => a.localeCompare(b)), sources: Object.fromEntries((Object.keys(commoditySources) as Commodity[]).map((commodity) => [commodity, commoditySources[commodity].map(({ label, quantity }) => `${label} — ${quantity}`)])) };
}

export async function GET(request: Request) {
  const requested = new URL(request.url).searchParams.get("period") ?? "all";
  if (!periods.has(requested as Period)) return NextResponse.json({ error: "Invalid dashboard period." }, { status: 400 });
  const period = requested as Period; const range = rangeFor(period);
  try {
    const allSources = [...Object.values(rapidSources).flat(), ...Object.values(labSources).flat()];
    const allCommoditySources = Object.values(commoditySources).flat();
    const fields = ["uic_ori", "client_kp_type", ...new Set([...allSources.flatMap((source) => [source.date, source.result]), ...allCommoditySources.flatMap((source) => [source.date, source.quantity, ...(source.worker ? [source.worker] : [])])])];
    const params: Record<string, string> = { content: "record", action: "export", format: "json", type: "flat", rawOrLabel: "raw", rawOrLabelHeaders: "raw", exportCheckboxLabel: "false", exportDataAccessGroups: "false", returnFormat: "json" };
    fields.forEach((field, index) => { params[`fields[${index}]`] = field; });
    const rows = await redcap(params); const clientKp = new Map<string, string[]>();
    for (const row of rows) {
      if (!row.uic_ori) continue;
      const selected = kpTypes.filter(([code]) => row[`client_kp_type___${code}`] === "1").map(([, label]) => label);
      if (selected.length) clientKp.set(row.uic_ori, selected);
    }
    const sourceDetails = (sources: Record<Infection, Source[]>) => Object.fromEntries(infections.map((infection) => [infection, { configured: sources[infection].length > 0, labels: sources[infection].map(({ label }) => label) }]));
    return NextResponse.json({ period, range, rapid: { ...aggregate(rows, rapidSources, clientKp, range.start, range.end), sources: sourceDetails(rapidSources) }, lab: { ...aggregate(rows, labSources, clientKp, range.start, range.end), sources: sourceDetails(labSources) }, commodities: aggregateCommodities(rows, range.start, range.end), kpLabels: kpTypes.map(([, label]) => label), generatedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("REDCap dashboard error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load dashboard data." }, { status: 502 });
  }
}
