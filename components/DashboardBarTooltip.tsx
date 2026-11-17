"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type Chart from "chart.js";
import { useLocalization } from "@/components/Localization";

export type BarContributors = Record<string, number>;

// Dataset index -> bar index -> UIC and its contribution to that bar.
export function useBarTooltip(contributors?: BarContributors[][]) {
  const { t, locale } = useLocalization();
  const [active, setActive] = useState<{ title: string; label: string; uics: BarContributors } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inside = useRef(false);
  const clear = useCallback(() => { if (timer.current !== null) clearTimeout(timer.current); timer.current = null; }, []);
  const hide = useCallback(() => {
    if (inside.current) return;
    clear();
    timer.current = setTimeout(() => setActive(null), 180);
  }, [clear]);
  useEffect(() => clear, [clear]);
  const custom = useCallback((model: Chart.ChartTooltipModel) => {
    if (!contributors) return;
    if (!model.opacity) { hide(); return; }
    const point = model.dataPoints?.[0];
    const uics = point ? contributors[point.datasetIndex ?? 0]?.[point.index ?? 0] : undefined;
    clear();
    if (!uics) { setActive(null); return; }
    setActive({ title: model.title?.join(" · ") ?? "", label: model.body?.flatMap(body => body.lines).join("; ") ?? "", uics });
  }, [contributors, clear, hide]);
  const numberLocale = locale === "mfe" ? "fr-MU" : locale;
  const popup = active && contributors ? <div role="tooltip" tabIndex={0} className="absolute right-2 top-2 z-10 max-h-60 w-[calc(100%-1rem)] max-w-sm overflow-y-auto rounded-xl border border-border bg-card p-3 text-sm shadow-lg" onMouseEnter={() => { inside.current = true; clear(); }} onMouseLeave={() => { inside.current = false; hide(); }} onFocus={() => { inside.current = true; clear(); }} onBlur={() => { inside.current = false; hide(); }} onKeyDown={event => { if (event.key === "Escape") { clear(); setActive(null); } }}>
    <strong className="block">{active.title}</strong>
    <p className="mt-1 font-semibold">{active.label}</p>
    <p className="mt-3 text-xs font-bold text-muted-foreground">{t("Contributing UICs")}</p>
    <ul className="mt-1 space-y-1">{Object.entries(active.uics).sort(([a], [b]) => a.localeCompare(b)).map(([uic, count]) => <li key={uic} className="flex items-start justify-between gap-3"><code className="break-all text-xs" translate="no">{uic}</code><span className="shrink-0 tabular-nums">× {count.toLocaleString(numberLocale)}</span></li>)}</ul>
    {!Object.keys(active.uics).length && <p className="mt-1 text-muted-foreground">{t("No data")}</p>}
  </div> : null;
  return { custom: contributors ? custom : undefined, popup, onCanvasLeave: hide };
}
