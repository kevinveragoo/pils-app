"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Chart from "chart.js";
import { Activity, AlertCircle, Beaker, Boxes, FlaskConical, Users } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

type Period = "all" | "year" | "quarter" | "month" | "week" | "day";
type Infection = "hiv" | "syphilis" | "hcv" | "hbv";
type Outcome = "positive" | "negative" | "indeterminate" | "invalid";
type Commodity = "maleCondoms" | "femaleCondoms" | "lube" | "syringes" | "needles";
type TestMetrics = { totals: Record<Infection, number>; firstTime?: Record<Infection, number>; outcomes: Record<Infection, Record<Outcome, number>>; sources: Record<Infection, string[]> };
type DashboardData = {
  range: { start: string | null; end: string; label: string };
  summary: { clients: number; rapidEncounters: number; labEncounters: number; commodityUnits: number };
  rapid: TestMetrics;
  lab: TestMetrics;
  trend: { labels: string[]; rapid: number[]; laboratory: number[] };
  commodities: { totals: Record<Commodity, number>; sources: Record<Commodity, string[]> };
  generatedAt: string;
};

const infections: { key: Infection; label: string; color: string }[] = [
  { key: "hiv", label: "HIV", color: "#c0264b" },
  { key: "syphilis", label: "SYP", color: "#e27a24" },
  { key: "hcv", label: "HCV", color: "#6d4aa2" },
  { key: "hbv", label: "HBV", color: "#247b78" },
];
const outcomeLabels: { key: Outcome; label: string }[] = [
  { key: "positive", label: "Positive / reactive" },
  { key: "negative", label: "Negative / non-reactive" },
  { key: "indeterminate", label: "Indeterminate" },
  { key: "invalid", label: "Invalid" },
];
const resultChartLabels = [...outcomeLabels.map(({ label }) => label), "First time tested"];
const commodities: { key: Commodity; label: string; color: string }[] = [
  { key: "maleCondoms", label: "Male condoms", color: "#c0264b" },
  { key: "femaleCondoms", label: "Female condoms", color: "#e27a24" },
  { key: "lube", label: "Lube", color: "#6d4aa2" },
  { key: "syringes", label: "Syringes", color: "#247b78" },
  { key: "needles", label: "Needles", color: "#3973a8" },
];
const genderOptions = [["1", "Man"], ["2", "Woman"], ["3", "Transgender man"], ["4", "Transgender woman"], ["5", "Other"], ["9", "Refused to answer"]] as const;
const kpOptions = [["1", "Sex worker"], ["2", "MSM"], ["3", "PWID"], ["4", "PPWID"], ["5", "Transgender"], ["6", "Former PWID"], ["7", "General"], ["8", "Former Incarcerated People (FIP)"]] as const;

function toggleSelection(current: string[], value: string) {
  return current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
}

function ComparisonChart({ labels, rapid, laboratory, rapidLabel = "Rapid test", laboratoryLabel = "Laboratory", color, horizontal = false, ariaLabel }: { labels: string[]; rapid: number[]; laboratory: number[]; rapidLabel?: string; laboratoryLabel?: string; color?: string; horizontal?: boolean; ariaLabel: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvas.current) return;
    const chart = new Chart(canvas.current, {
      type: horizontal ? "horizontalBar" : "bar",
      data: { labels, datasets: [{ label: rapidLabel, data: rapid, backgroundColor: color ?? "#c0264b", borderWidth: 0 }, { label: laboratoryLabel, data: laboratory, backgroundColor: color ? `${color}66` : "#247b78", borderColor: color, borderWidth: color ? 1 : 0 }] },
      options: { responsive: true, maintainAspectRatio: false, legend: { display: true, position: "bottom", labels: { usePointStyle: true, boxWidth: 10 } }, tooltips: { displayColors: true, callbacks: { label: (item, chartData) => ` ${chartData.datasets?.[item.datasetIndex ?? 0]?.label}: ${Number(item.value ?? item.xLabel ?? item.yLabel ?? 0).toLocaleString()}` } }, scales: horizontal ? { xAxes: [{ ticks: { beginAtZero: true, precision: 0 } }], yAxes: [{ gridLines: { display: false } }] } : { yAxes: [{ ticks: { beginAtZero: true, precision: 0 } }], xAxes: [{ gridLines: { display: false } }] } },
    });
    return () => { chart.destroy(); };
  }, [ariaLabel, color, horizontal, labels, laboratory, laboratoryLabel, rapid, rapidLabel]);
  return <div className="h-72 w-full"><canvas ref={canvas} role="img" aria-label={ariaLabel}>{labels.map((label, index) => `${label}, ${rapidLabel} ${rapid[index]}, ${laboratoryLabel} ${laboratory[index]}`).join("; ")}</canvas></div>;
}

function TrendChart({ data }: { data: DashboardData }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvas.current || !data.trend.labels.length) return;
    const chart = new Chart(canvas.current, {
      type: "line",
      data: { labels: data.trend.labels, datasets: [{ label: "Rapid tests", data: data.trend.rapid, borderColor: "#c0264b", backgroundColor: "rgba(192,38,75,.08)", fill: false, lineTension: 0.2 }, { label: "Laboratory tests", data: data.trend.laboratory, borderColor: "#247b78", backgroundColor: "rgba(36,123,120,.08)", fill: false, lineTension: 0.2 }] },
      options: { responsive: true, maintainAspectRatio: false, legend: { position: "bottom" }, scales: { yAxes: [{ ticks: { beginAtZero: true, precision: 0 } }], xAxes: [{ gridLines: { display: false } }] } },
    });
    return () => { chart.destroy(); };
  }, [data]);
  if (!data.trend.labels.length) return <p className="py-16 text-center text-sm text-muted-foreground">No dated test results match these filters.</p>;
  return <div className="h-80 w-full"><canvas ref={canvas} role="img" aria-label="Rapid and laboratory test activity over time">Test activity over time.</canvas></div>;
}

function CommodityChart({ data }: { data: DashboardData }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const values = useMemo(() => commodities.map(({ key }) => data.commodities.totals[key]), [data.commodities.totals]);
  useEffect(() => {
    if (!canvas.current) return;
    const chart = new Chart(canvas.current, { type: "bar", data: { labels: commodities.map(({ label }) => label), datasets: [{ label: "Units provided", data: values, backgroundColor: commodities.map(({ color }) => color), borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, legend: { display: false }, scales: { yAxes: [{ ticks: { beginAtZero: true, precision: 0 } }], xAxes: [{ gridLines: { display: false } }] } } });
    return () => { chart.destroy(); };
  }, [values]);
  return <div className="h-72 w-full"><canvas ref={canvas} role="img" aria-label="Quantities of commodities provided">{commodities.map(({ label }, index) => `${label} ${values[index]}`).join(", ")}</canvas></div>;
}

function Summary({ data }: { data: DashboardData }) {
  const items = [
    { label: "Clients represented", value: data.summary.clients, icon: Users },
    { label: "Rapid encounters", value: data.summary.rapidEncounters, icon: FlaskConical },
    { label: "Laboratory encounters", value: data.summary.labEncounters, icon: Beaker },
    { label: "Commodity units", value: data.summary.commodityUnits, icon: Boxes },
  ];
  return <section aria-label="Dashboard summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{items.map(({ label, value, icon: Icon }) => <article key={label} className="dashboard-card"><div className="flex items-center justify-between gap-3"><div><p className="text-sm text-muted-foreground">{label}</p><strong className="mt-1 block text-3xl">{value.toLocaleString()}</strong></div><Icon className="size-8 text-primary" aria-hidden="true" /></div></article>)}</section>;
}

export default function Dashboard() {
  const [period, setPeriod] = useState<Period>("week");
  const [genders, setGenders] = useState<string[]>([]);
  const [kps, setKps] = useState<string[]>([]);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  function beginFilterChange() {
    setLoading(true);
    setError("");
    setData(null);
  }

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ period, gender: genders.join(",") || "all", kp: kps.join(",") || "all" });
    fetch(`/api/redcap/dashboard?${query}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Unable to load dashboard data."); setData(result); })
      .catch((reason: unknown) => { if ((reason as { name?: string }).name !== "AbortError") setError(reason instanceof Error ? reason.message : "Unable to load dashboard data."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [genders, kps, period]);

  return <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
    <div className="mb-6"><p className="text-sm font-bold uppercase tracking-widest text-primary">Programme overview</p><h1 className="mt-1 text-3xl font-bold sm:text-4xl">Dashboard</h1><p className="mt-2 text-muted-foreground">Filter testing activity and commodity distribution across the programme.</p></div>
    <section aria-label="Dashboard filters" className="dashboard-card mb-6 grid items-start gap-5 lg:grid-cols-[minmax(12rem,0.6fr)_1fr_1.3fr]">
      <label className="outreach-field"><span>Time</span><select value={period} onChange={(event) => { beginFilterChange(); setPeriod(event.target.value as Period); }}><option value="all">All time</option><option value="year">Last year</option><option value="quarter">Last quarter</option><option value="month">Last month</option><option value="week">Last week</option><option value="day">Today</option></select></label>
      <fieldset className="rounded-xl border border-border p-4">
        <legend className="px-1 text-sm font-bold">Gender</legend>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm"><Checkbox checked={genders.length === 0} onCheckedChange={() => { beginFilterChange(); setGenders([]); }} /><span>All genders</span></label>
          {genderOptions.map(([value, label]) => <label key={value} className="flex cursor-pointer items-center gap-2 text-sm"><Checkbox checked={genders.includes(value)} onCheckedChange={() => { beginFilterChange(); setGenders((current) => toggleSelection(current, value)); }} /><span>{label}</span></label>)}
        </div>
      </fieldset>
      <fieldset className="rounded-xl border border-border p-4">
        <legend className="px-1 text-sm font-bold">Key population</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm"><Checkbox checked={kps.length === 0} onCheckedChange={() => { beginFilterChange(); setKps([]); }} /><span>All key populations</span></label>
          {kpOptions.map(([value, label]) => <label key={value} className="flex cursor-pointer items-center gap-2 text-sm"><Checkbox checked={kps.includes(value)} onCheckedChange={() => { beginFilterChange(); setKps((current) => toggleSelection(current, value)); }} /><span>{label}</span></label>)}
        </div>
      </fieldset>
    </section>

    {error && <div role="alert" className="mb-5 flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertCircle className="mt-0.5 size-5 shrink-0" />{error}</div>}
    {loading && <div className="dashboard-card flex min-h-52 items-center justify-center text-muted-foreground"><Activity className="mr-3 size-5 animate-pulse" />Loading REDCap aggregates…</div>}
    {!loading && data && <div className="grid gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{data.range.label}</p><span className="rounded-full bg-secondary px-3 py-1 text-sm font-bold text-secondary-foreground">Updated {new Date(data.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></div>
      <Summary data={data} />
      <section className="dashboard-card" aria-labelledby="testing-heading"><p className="dashboard-kicker">Testing volume</p><h2 id="testing-heading" className="text-2xl font-bold">Tests by infection and method</h2><p className="mt-1 text-sm text-muted-foreground">Every bar reflects the filters above.</p><ComparisonChart labels={infections.map(({ label }) => label)} rapid={infections.map(({ key }) => data.rapid.totals[key])} laboratory={infections.map(({ key }) => data.lab.totals[key])} ariaLabel="Rapid and laboratory results for HIV, syphilis, HCV and HBV" /></section>
      <section className="grid gap-5" aria-labelledby="outcomes-heading"><div><p className="dashboard-kicker">Test outcomes</p><h2 id="outcomes-heading" className="text-2xl font-bold">Results by infection</h2><p className="mt-1 text-sm text-muted-foreground">“First time tested” counts rapid tests where previous status was recorded as “Never tested.”</p></div><div className="grid gap-5 lg:grid-cols-2">{infections.map((infection) => <article key={infection.key} className="dashboard-card"><h3 className="text-2xl font-bold">{infection.label}</h3><ComparisonChart horizontal labels={resultChartLabels} rapid={[...outcomeLabels.map(({ key }) => data.rapid.outcomes[infection.key][key]), data.rapid.firstTime?.[infection.key] ?? 0]} laboratory={[...outcomeLabels.map(({ key }) => data.lab.outcomes[infection.key][key]), 0]} color={infection.color} ariaLabel={`${infection.label} results by outcome, testing method, and first-time testing`} /><p className="mt-3 text-xs text-muted-foreground">Rapid: {data.rapid.sources[infection.key].join("; ")}<br />Laboratory: {data.lab.sources[infection.key].join("; ")}</p></article>)}</div></section>
      <section className="dashboard-card" aria-labelledby="trend-heading"><p className="dashboard-kicker">Activity over time</p><h2 id="trend-heading" className="text-2xl font-bold">Testing trend</h2><p className="mt-1 text-sm text-muted-foreground">Daily for shorter periods and monthly for quarter, year, and all-time views.</p><TrendChart data={data} /></section>
      <section className="dashboard-card" aria-labelledby="commodities-heading"><p className="dashboard-kicker">Prevention commodities</p><h2 id="commodities-heading" className="text-2xl font-bold">Commodities provided</h2><p className="mt-1 text-sm text-muted-foreground">Total units matching the selected time, gender, and key population.</p><CommodityChart data={data} /><details className="mt-4 rounded-xl border p-3 text-xs text-muted-foreground"><summary className="cursor-pointer font-bold text-foreground">Data sources</summary><div className="mt-2 grid gap-2 sm:grid-cols-2">{commodities.map(({ key, label }) => <p key={key}><strong>{label}:</strong> {data.commodities.sources[key].join("; ")}</p>)}</div><p className="mt-2">Clinic Visit and HIV Care Support store needles and syringes in a combined field; each quantity is included once under Needles.</p></details></section>
      <p className="text-sm text-muted-foreground">Tests count populated result fields rather than unique clients. KP filtering uses membership, so a client assigned to several KPs appears when any one of those KPs is selected. Records without the selected demographic value are excluded.</p>
    </div>}
  </div>;
}
