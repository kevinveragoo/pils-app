"use client";

import { useRef, useState, type ReactNode } from "react";
import { Info, RotateCcw } from "lucide-react";
import { useLocalization } from "@/components/Localization";
import { dashboardCardInfo, sharedIndicatorFields, type CardInfo, type IndicatorValue } from "@/lib/dashboard-cards";

export function DashboardIndicatorCard({ card, value, loading = false, information, children, chart = false }: { card: { id: string; title: string; blank?: boolean; percent?: boolean; decimal?: boolean }; value?: IndicatorValue; loading?: boolean; information?: CardInfo; children?: ReactNode; chart?: boolean }) {
  const [flipped, setFlipped] = useState(false);
  const infoButton = useRef<HTMLButtonElement>(null);
  const { t, locale } = useLocalization();
  const info = information ?? dashboardCardInfo[card.id as keyof typeof dashboardCardInfo];
  const blank = "blank" in card && card.blank;
  const noData = value == null || (typeof value === "object" && Object.values(value).every(number => number === null));
  const fields = [...new Set([...info.fields, ...(blank ? [] : sharedIndicatorFields)])];
  const format = (number: number | null) => {
    if (number === null) return t("No data");
    const percent = "percent" in card && card.percent;
    const decimal = "decimal" in card && card.decimal;
    const formatted = number.toLocaleString(locale === "mfe" ? "fr-MU" : locale, { maximumFractionDigits: percent || decimal ? 1 : 0 });
    return percent ? `${formatted}%` : formatted;
  };

  return <article className={chart ? "indicator-card indicator-card-chart" : "indicator-card"} aria-labelledby={`indicator-${card.id}`} data-flipped={flipped} onKeyDown={event => { if (event.key === "Escape" && flipped) { setFlipped(false); infoButton.current?.focus(); } }}>
    <button ref={infoButton} type="button" className="indicator-card-info" aria-label={`${t(flipped ? "Show card value" : "Show card details")}: ${t(card.title)}`} title={t(flipped ? "Show card value" : "Show card details")} aria-expanded={flipped} aria-controls={`indicator-details-${card.id}`} onClick={() => setFlipped(current => !current)}>
      {flipped ? <RotateCcw className="size-4" aria-hidden="true" /> : <Info className="size-4" aria-hidden="true" />}
    </button>
    <div className="indicator-card-rotor">
      <div className="dashboard-card indicator-card-face indicator-card-front" aria-hidden={flipped} inert={flipped}>
        <h2 id={`indicator-${card.id}`} className="pr-10 text-base font-semibold">{t(card.title)}</h2>
        {blank && <span className="indicator-card-status mt-5 inline-block text-sm font-bold">{t("Not Implemented")}</span>}
        {!blank && !loading && children}
        {!blank && !loading && !children && noData && <span className="mt-5 inline-block text-sm font-semibold text-muted-foreground">{t("No data")}</span>}
        {!blank && !loading && !children && !noData && value != null && (typeof value === "object"
          ? <dl className="mt-5 grid grid-cols-3 gap-3">{Object.entries(value).map(([infection, count]) => <div key={infection}><dt className="text-xs font-semibold text-muted-foreground">{t(infection)}</dt><dd className={count === null ? "mt-1 text-sm font-semibold text-muted-foreground" : "mt-1 text-2xl font-bold tabular-nums"}>{format(count)}</dd></div>)}</dl>
          : <p className="mt-5 text-3xl font-bold tabular-nums">{format(value)}</p>)}
      </div>
      <div id={`indicator-details-${card.id}`} className="dashboard-card indicator-card-face indicator-card-back" aria-hidden={!flipped} inert={!flipped} tabIndex={flipped ? 0 : -1}>
        <h3 className="pr-10 text-base font-semibold">{t(card.title)}</h3>
        {blank && <span className="indicator-card-status mt-2 inline-block text-sm font-bold">{t("Not Implemented")}</span>}
        <dl className="mt-4 space-y-4 text-sm">
          <div><dt className="font-bold">{t("Assumptions")}</dt><dd className="mt-1 text-muted-foreground" lang="en">{info.assumptions}</dd></div>
          <div><dt className="font-bold">{t(blank ? "Planned calculation" : "Calculation")}</dt><dd className="mt-1 text-muted-foreground" lang="en">{info.calculation}</dd></div>
          {info.missing && <div><dt className="font-bold">{t("Missing fields or history")}</dt><dd className="mt-1 text-muted-foreground" lang="en">{info.missing}</dd></div>}
          <div><dt className="font-bold">{t("REDCap fields used")}</dt><dd className="mt-2">{fields.length
            ? <ul className="space-y-1">{fields.map(field => <li key={field}><code className="break-all text-xs" translate="no">{field}</code></li>)}</ul>
            : <span className="text-muted-foreground">{t("None — not implemented")}</span>}</dd></div>
        </dl>
      </div>
    </div>
  </article>;
}
