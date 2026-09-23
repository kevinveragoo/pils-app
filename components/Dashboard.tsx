"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Chart from "chart.js";
import { Activity, AlertCircle } from "lucide-react";

type Period = "all" | "year" | "quarter" | "month" | "week" | "day";
type Infection = "hiv" | "syphilis" | "hcv" | "hbv";
type MetricSet = { encounters: number; totals: Record<Infection, number>; byKp: Record<Infection, Record<string, number>>; sources: Record<Infection, { configured: boolean; labels: string[] }> };
type Commodity = "maleCondoms" | "femaleCondoms" | "lube" | "syringes" | "needles";
type DashboardData = { range: { start: string | null; end: string; label: string }; rapid: MetricSet; lab: MetricSet; commodities: { totals: Record<Commodity, number>; sources: Record<Commodity, string[]> }; kpLabels: string[]; generatedAt: string };
const infections: { key: Infection; label: string; color: string }[] = [
  { key: "hiv", label: "HIV", color: "#c0264b" }, { key: "syphilis", label: "SYP", color: "#e27a24" },
  { key: "hcv", label: "HCV", color: "#6d4aa2" }, { key: "hbv", label: "HBV", color: "#247b78" },
];
const commodities: { key: Commodity; label: string; color: string }[] = [
  { key: "maleCondoms", label: "Male condoms", color: "#c0264b" },
  { key: "femaleCondoms", label: "Female condoms", color: "#e27a24" },
  { key: "lube", label: "Lube", color: "#6d4aa2" },
  { key: "syringes", label: "Syringes", color: "#247b78" },
  { key: "needles", label: "Needles", color: "#3973a8" },
];

function ComparisonChart({ labels, rapid, laboratory, color, horizontal = false, ariaLabel }: { labels: string[]; rapid: number[]; laboratory: number[]; color?: string; horizontal?: boolean; ariaLabel: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvas.current) return;
    const chart = new Chart(canvas.current, { type: horizontal ? "horizontalBar" : "bar", data: { labels, datasets: [{ label: "Rapid test", data: rapid, backgroundColor: color ?? "#c0264b", borderWidth: 0 }, { label: "Laboratory", data: laboratory, backgroundColor: color ? `${color}66` : "#247b78", borderColor: color, borderWidth: color ? 1 : 0 }] }, options: { responsive: true, maintainAspectRatio: false, legend: { display: true, position: "bottom", labels: { usePointStyle: true, boxWidth: 10 } }, tooltips: { displayColors: true, callbacks: { label: (item, chartData) => ` ${chartData.datasets?.[item.datasetIndex ?? 0]?.label}: ${Number(item.value ?? item.xLabel ?? item.yLabel ?? 0).toLocaleString()}` } }, scales: horizontal ? { xAxes: [{ ticks: { beginAtZero: true, precision: 0 }, gridLines: { color: "rgba(138,28,49,.08)", zeroLineColor: "rgba(138,28,49,.18)" } }], yAxes: [{ gridLines: { display: false } }] } : { yAxes: [{ ticks: { beginAtZero: true, precision: 0 }, gridLines: { color: "rgba(138,28,49,.08)", zeroLineColor: "rgba(138,28,49,.18)" } }], xAxes: [{ gridLines: { display: false } }] } } });
    return () => { chart.destroy(); };
  }, [ariaLabel, color, horizontal, labels, laboratory, rapid]);
  return <div className="h-72 w-full"><canvas ref={canvas} role="img" aria-label={ariaLabel}>Comparison chart: {labels.map((label, index) => `${label}, rapid ${rapid[index]}, laboratory ${laboratory[index]}`).join("; ")}</canvas></div>;
}

function CommodityChart({ data }: { data: DashboardData }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const values = useMemo(() => commodities.map(({ key }) => data.commodities.totals[key]), [data.commodities.totals]);
  useEffect(() => {
    if (!canvas.current) return;
    const chart = new Chart(canvas.current, { type: "bar", data: { labels: commodities.map(({ label }) => label), datasets: [{ label: "Units provided", data: values, backgroundColor: commodities.map(({ color }) => color), borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, legend: { display: false }, tooltips: { displayColors: false, callbacks: { label: (item) => ` ${Number(item.value ?? item.yLabel ?? 0).toLocaleString()} units provided` } }, scales: { yAxes: [{ ticks: { beginAtZero: true, precision: 0 }, gridLines: { color: "rgba(138,28,49,.08)", zeroLineColor: "rgba(138,28,49,.18)" } }], xAxes: [{ gridLines: { display: false } }] } } });
    return () => { chart.destroy(); };
  }, [values]);
  return <div className="h-72 w-full"><canvas ref={canvas} role="img" aria-label="Quantities of commodities provided">Commodity chart: {commodities.map(({ label }, index) => `${label} ${values[index]}`).join(", ")}</canvas></div>;
}

function CombinedMetrics({ data }: { data: DashboardData }) {
  return <section className="grid gap-5" aria-labelledby="testing-heading">
    <div className="dashboard-card"><div className="mb-4"><p className="dashboard-kicker">Rapid and laboratory results</p><h2 id="testing-heading" className="text-2xl font-bold">Tests by infection and method</h2><p className="mt-1 text-sm text-muted-foreground">{data.range.label} · {data.rapid.encounters.toLocaleString()} rapid encounters · {data.lab.encounters.toLocaleString()} laboratory encounters</p></div><ComparisonChart labels={infections.map(({ label }) => label)} rapid={infections.map(({ key }) => data.rapid.totals[key])} laboratory={infections.map(({ key }) => data.lab.totals[key])} ariaLabel="Rapid and laboratory results for HIV, syphilis, HCV and HBV" /></div>
    <div className="grid gap-5 lg:grid-cols-2">{infections.map((infection) => <article key={infection.key} className="dashboard-card"><div className="mb-4"><p className="dashboard-kicker">By key population and method</p><h3 className="text-2xl font-bold">{infection.label}</h3><div className="mt-2 flex gap-4 text-sm"><span><strong style={{ color: infection.color }}>{data.rapid.totals[infection.key].toLocaleString()}</strong> rapid</span><span><strong style={{ color: infection.color }}>{data.lab.totals[infection.key].toLocaleString()}</strong> laboratory</span></div></div><ComparisonChart horizontal labels={data.kpLabels} rapid={data.kpLabels.map((label) => data.rapid.byKp[infection.key][label] ?? 0)} laboratory={data.kpLabels.map((label) => data.lab.byKp[infection.key][label] ?? 0)} color={infection.color} ariaLabel={`${infection.label} rapid and laboratory results by key-population type`} /><p className="mt-3 text-xs text-muted-foreground">Rapid: {data.rapid.sources[infection.key].labels.join("; ")}<br />Laboratory: {data.lab.sources[infection.key].labels.join("; ")}</p></article>)}</div>
    <p className="text-sm text-muted-foreground">Charts count populated result fields, not tests merely marked as performed. Results without a date appear in All Time only.</p>
  </section>;
}

function CommoditiesSection({ data }: { data: DashboardData }) {
  return <section className="grid gap-5" aria-labelledby="commodities-heading"><div className="dashboard-card"><div className="mb-4"><p className="dashboard-kicker">Prevention commodities</p><h2 id="commodities-heading" className="text-2xl font-bold">Commodities provided</h2><p className="mt-1 text-sm text-muted-foreground">Total units across all current REDCap distribution instruments · {data.range.label}</p></div><CommodityChart data={data} /><details className="mt-4 rounded-xl border p-3 text-xs text-muted-foreground"><summary className="cursor-pointer font-bold text-foreground">Data sources</summary><div className="mt-2 grid gap-2 sm:grid-cols-2">{commodities.map(({ key, label }) => <p key={key}><strong>{label}:</strong> {data.commodities.sources[key].join("; ")}</p>)}</div><p className="mt-2">Clinic Visit and HIV Care Support store needles and syringes in a combined field; each combined quantity is included once under Needles to avoid double-counting.</p></details></div></section>;
}

export default function Dashboard() {
  const [period, setPeriod] = useState<Period>("all"); const [data, setData] = useState<DashboardData | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  useEffect(() => { const controller = new AbortController(); fetch(`/api/redcap/dashboard?period=${period}`, { signal: controller.signal, cache: "no-store" }).then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Unable to load dashboard data."); setData(result); }).catch((reason: unknown) => { if ((reason as { name?: string }).name !== "AbortError") setError(reason instanceof Error ? reason.message : "Unable to load dashboard data."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); }, [period]);
  return <div className="mx-auto w-full max-w-7xl px-4 sm:px-6"><div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-bold uppercase tracking-widest text-primary">Programme overview</p><h1 className="mt-1 text-3xl font-bold sm:text-4xl">Dashboard</h1><p className="mt-2 text-muted-foreground">Rapid test and laboratory result activity, kept separate by source.</p></div><label className="outreach-field min-w-56"><span>Reporting period</span><select value={period} onChange={(event) => { setLoading(true); setError(""); setPeriod(event.target.value as Period); }}><option value="all">1. All Time</option><option value="year">2. Last Year</option><option value="quarter">3. Last Quarter</option><option value="month">4. Last Month</option><option value="week">5. Last Week</option><option value="day">6. Last Day</option></select></label></div>
    {error && <div role="alert" className="mb-5 flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertCircle className="mt-0.5 size-5 shrink-0" />{error}</div>}
    {loading && <div className="dashboard-card flex min-h-52 items-center justify-center text-muted-foreground"><Activity className="mr-3 size-5 animate-pulse" />Loading REDCap aggregates…</div>}
    {!loading && data && <div className="grid gap-10"><div className="flex justify-end"><span className="rounded-full bg-secondary px-3 py-1 text-sm font-bold text-secondary-foreground">Updated {new Date(data.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></div><CombinedMetrics data={data} /><CommoditiesSection data={data} /><p className="text-sm text-muted-foreground">A client belonging to multiple key-population types is included in every selected category, so KP bars may sum to more than the infection total.</p></div>}
  </div>;
}
