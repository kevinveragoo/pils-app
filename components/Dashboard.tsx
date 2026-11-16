//
//  Dashboard.tsx
//  pils-app
//
//  Created by Elisa Kevin Veragoo + ChatGPT on 07/10/2026.
//
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Chart from "chart.js";
import { useLocalization } from "@/components/Localization";
import { Activity, AlertCircle, Beaker, Boxes, FlaskConical, Users } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import type { IndicatorValues } from "@/lib/dashboard-cards";
import { DashboardCardGrid } from "@/components/DashboardCardGrid";
import { DashboardIndicatorCard } from "@/components/DashboardIndicatorCard";
import { defaultDashboardCards, defaultDashboardCardInfo } from "@/lib/dashboard-default-cards";
import { useBarTooltip, type BarContributors } from "@/components/DashboardBarTooltip";

type Period = "all" | "year" | "quarter" | "month" | "week" | "day";
type Infection = "hiv" | "syphilis" | "hcv" | "hbv";
type Outcome = "positive" | "negative" | "indeterminate" | "invalid" | "unclassified" | "conflicting";
type Commodity = "maleCondoms" | "femaleCondoms" | "lube" | "syringes" | "needles";
type TestMetrics = { totals: Record<Infection, number>; firstTime?: Record<Infection, number>; outcomes: Record<Infection, Record<Outcome, number>>; sources: Record<Infection, string[]> };
type DashboardData = {
  barContributors?: {
    rapid: { totals: Record<Infection, BarContributors>; firstTime: Record<Infection, BarContributors>; outcomes: Record<Infection, Record<Outcome, BarContributors>> };
    lab: { totals: Record<Infection, BarContributors>; firstTime: Record<Infection, BarContributors>; outcomes: Record<Infection, Record<Outcome, BarContributors>> };
    commodities: Record<Commodity, BarContributors>;
  };
  indicators?: IndicatorValues;
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
  { key: "unclassified", label: "Recorded / unclassified" },
  { key: "conflicting", label: "Conflicting results" },
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

function ComparisonChart({ labels, rapid, laboratory, rapidLabel = "Rapid test", laboratoryLabel = "Laboratory", color, horizontal = false, ariaLabel, contributors }: { labels: string[]; rapid: number[]; laboratory: number[]; rapidLabel?: string; laboratoryLabel?: string; color?: string; horizontal?: boolean; ariaLabel: string; contributors?: BarContributors[][] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { t, locale } = useLocalization();
  const { custom, popup, onCanvasLeave } = useBarTooltip(contributors);
  useEffect(() => {
    if (!canvas.current) return;
    const chart = new Chart(canvas.current, {
      type: horizontal ? "horizontalBar" : "bar",
      data: { labels: labels.map(t), datasets: [{ label: t(rapidLabel), data: rapid, backgroundColor: color ?? "#c0264b", borderWidth: 0 }, { label: t(laboratoryLabel), data: laboratory, backgroundColor: color ? `${color}66` : "#247b78", borderColor: color, borderWidth: color ? 1 : 0 }] },
      options: { responsive: true, maintainAspectRatio: false, legend: { display: true, position: "bottom", labels: { usePointStyle: true, boxWidth: 10 } }, tooltips: { enabled: !contributors, custom, displayColors: true, callbacks: { label: (item, chartData) => ` ${chartData.datasets?.[item.datasetIndex ?? 0]?.label}: ${Number(item.value ?? item.xLabel ?? item.yLabel ?? 0).toLocaleString(locale === "mfe" ? "fr-MU" : locale)}` } }, scales: horizontal ? { xAxes: [{ ticks: { beginAtZero: true, precision: 0 } }], yAxes: [{ gridLines: { display: false } }] } : { yAxes: [{ ticks: { beginAtZero: true, precision: 0 } }], xAxes: [{ gridLines: { display: false } }] } },
    });
    return () => { chart.destroy(); };
  }, [ariaLabel, color, horizontal, labels, laboratory, laboratoryLabel, rapid, rapidLabel, t, locale, custom, contributors]);
  return <div className="relative h-72 w-full"><canvas ref={canvas} role="img" aria-label={t(ariaLabel)} onMouseLeave={onCanvasLeave}>{labels.map((label, index) => `${label}, ${rapidLabel} ${rapid[index]}, ${laboratoryLabel} ${laboratory[index]}`).join("; ")}</canvas>{popup}</div>;
}

function TrendChart({ data }: { data: DashboardData }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { t, locale } = useLocalization();
  useEffect(() => {
    if (!canvas.current || !data.trend.labels.length) return;
    const chart = new Chart(canvas.current, {
      type: "line",
      data: { labels: data.trend.labels, datasets: [{ label: t("Rapid tests"), data: data.trend.rapid, borderColor: "#c0264b", backgroundColor: "rgba(192,38,75,.08)", fill: false, lineTension: 0.2 }, { label: t("Laboratory tests"), data: data.trend.laboratory, borderColor: "#247b78", backgroundColor: "rgba(36,123,120,.08)", fill: false, lineTension: 0.2 }] },
      options: { responsive: true, maintainAspectRatio: false, legend: { position: "bottom" }, scales: { yAxes: [{ ticks: { beginAtZero: true, precision: 0 } }], xAxes: [{ gridLines: { display: false } }] } },
    });
    return () => { chart.destroy(); };
  }, [data, t, locale]);
  if (!data.trend.labels.length) return <p className="py-16 text-center text-sm text-muted-foreground">No dated test results match these filters.</p>;
  return <div className="h-80 w-full"><canvas ref={canvas} role="img" aria-label={t("Rapid and laboratory test activity over time")}>Test activity over time.</canvas></div>;
}

function CommodityChart({ data }: { data: DashboardData }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { t, locale } = useLocalization();
  const values = useMemo(() => commodities.map(({ key }) => data.commodities.totals[key]), [data.commodities.totals]);
  const contributors = useMemo(() => data.barContributors ? [commodities.map(({ key }) => data.barContributors!.commodities[key])] : undefined, [data.barContributors]);
  const { custom, popup, onCanvasLeave } = useBarTooltip(contributors);
  useEffect(() => {
    if (!canvas.current) return;
    const chart = new Chart(canvas.current, { type: "bar", data: { labels: commodities.map(({ label }) => t(label)), datasets: [{ label: t("Units provided"), data: values, backgroundColor: commodities.map(({ color }) => color), borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, legend: { display: false }, tooltips: { enabled: !contributors, custom }, scales: { yAxes: [{ ticks: { beginAtZero: true, precision: 0 } }], xAxes: [{ gridLines: { display: false } }] } } });
    return () => { chart.destroy(); };
  }, [values, t, locale, custom, contributors]);
  return <div className="relative h-72 w-full"><canvas ref={canvas} role="img" aria-label={t("Quantities of commodities provided")} onMouseLeave={onCanvasLeave}>{commodities.map(({ label }, index) => `${label} ${values[index]}`).join(", ")}</canvas>{popup}</div>;
}

function DefaultCards({ data, loading }: { data: DashboardData | null; loading: boolean }) {
  const { t, locale } = useLocalization();
  const numberLocale = locale === "mfe" ? "fr-MU" : locale;
  function renderCard(id: string) {
    const card = defaultDashboardCards.find(item => item.id === id)!;
    let content;
    if (data) {
      const summary = [
        { id: "default-clients", value: data.summary.clients, icon: Users },
        { id: "default-rapid", value: data.summary.rapidEncounters, icon: FlaskConical },
        { id: "default-laboratory", value: data.summary.labEncounters, icon: Beaker },
        { id: "default-units", value: data.summary.commodityUnits, icon: Boxes },
      ].find(item => item.id === id);
      const infection = infections.find(item => id === `default-${item.key}`);
      if (summary) {
        const Icon = summary.icon;
        content = <div className="mt-5 flex items-center justify-between gap-3"><strong className="text-3xl tabular-nums">{summary.value.toLocaleString(numberLocale)}</strong><Icon className="size-8 text-primary" aria-hidden="true" /></div>;
      } else if (id === "default-testing") {
        content = <div className="mt-4"><ComparisonChart labels={infections.map(({ label }) => t(label))} rapid={infections.map(({ key }) => data.rapid.totals[key])} laboratory={infections.map(({ key }) => data.lab.totals[key])} ariaLabel="Rapid and laboratory results for HIV, syphilis, HCV and HBV" contributors={data.barContributors ? [infections.map(({ key }) => data.barContributors!.rapid.totals[key]), infections.map(({ key }) => data.barContributors!.lab.totals[key])] : undefined} /></div>;
      } else if (infection) {
        content = <div className="mt-4"><ComparisonChart horizontal labels={resultChartLabels.map(t)} rapid={[...outcomeLabels.map(({ key }) => data.rapid.outcomes[infection.key][key]), data.rapid.firstTime?.[infection.key] ?? 0]} laboratory={[...outcomeLabels.map(({ key }) => data.lab.outcomes[infection.key][key]), 0]} color={infection.color} ariaLabel={`${infection.label} — ${t("Results by infection")}`} contributors={data.barContributors ? [[...outcomeLabels.map(({ key }) => data.barContributors!.rapid.outcomes[infection.key][key]), data.barContributors.rapid.firstTime[infection.key]], [...outcomeLabels.map(({ key }) => data.barContributors!.lab.outcomes[infection.key][key]), {}]] : undefined} /></div>;
      } else if (id === "default-trend") {
        content = <div className="mt-4"><TrendChart data={data} /></div>;
      } else if (id === "default-commodities") {
        content = <div className="mt-4"><CommodityChart data={data} /></div>;
      }
    }
    return <DashboardIndicatorCard card={card} information={defaultDashboardCardInfo[card.id]} chart={"chart" in card && card.chart} loading={loading}>{content}</DashboardIndicatorCard>;
  }
  return <DashboardCardGrid group="default" definitions={defaultDashboardCards} loading={loading} renderCard={renderCard} />;
}

export default function Dashboard({ showExecutive = false }: { showExecutive?: boolean } = {}) {
  const { t, locale } = useLocalization();
  const dateLocale = locale === "mfe" ? "fr-MU" : locale;
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
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Unable to load dashboard data."); if (!controller.signal.aborted) setData(result); })
      .catch((reason: unknown) => { if (!controller.signal.aborted && (reason as { name?: string }).name !== "AbortError") setError(reason instanceof Error ? reason.message : "Unable to load dashboard data."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [genders, kps, period]);

  return <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
    <div className="mb-6"><p className="text-sm font-bold uppercase tracking-widest text-primary">Programme overview</p><h1 className="mt-1 text-3xl font-bold sm:text-4xl">Dashboard</h1><p className="mt-2 text-muted-foreground">Programme indicators for the selected period and population.</p></div>
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
    {!loading && data && <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{t(data.range.label)}</p><span className="rounded-full bg-secondary px-3 py-1 text-sm font-bold text-secondary-foreground">Updated {new Date(data.generatedAt).toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit", timeZone: "Indian/Mauritius" })}</span></div>}
    {showExecutive && <section aria-labelledby="executive-heading">
    <h2 id="executive-heading" className="mb-4 text-2xl font-bold">Executive cards</h2>
    <DashboardCardGrid values={data?.indicators} loading={loading} />
    </section>}
    <section aria-labelledby="default-heading">
      <h2 id="default-heading" className="mb-4 text-2xl font-bold">Default cards</h2>
      <DefaultCards data={data} loading={loading} />
    </section>
  </div>;
}
