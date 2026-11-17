"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { Info, RotateCcw } from "lucide-react";
import { useLocalization } from "@/components/Localization";
import styles from "./DashboardCard.module.css";
import { dashboardCardInfo } from "@/lib/dashboard-card-info";

export function DashboardCard({ title, infoKey, children, className = "" }: { title: string; infoKey: string; children: ReactNode; className?: string }) {
  const { t } = useLocalization();
  const [flipped, setFlipped] = useState(false);
  const id = useId();
  const frontButton = useRef<HTMLButtonElement>(null), backButton = useRef<HTMLButtonElement>(null);
  const info = dashboardCardInfo(infoKey);
  function flip(next: boolean) {
    setFlipped(next);
    requestAnimationFrame(() => (next ? backButton : frontButton).current?.focus());
  }
  return <article className={`${styles.card} ${className}`} aria-label={t(title)} onKeyDown={event => { if (event.key === "Escape" && flipped) { event.preventDefault(); flip(false); } }}>
    <div className={styles.inner} data-flipped={flipped}>
      <div className={`dashboard-card ${styles.front}`} aria-hidden={flipped} inert={flipped}>
        <button ref={frontButton} type="button" className={styles.infoButton} aria-label={`${t("About this card")}: ${t(title)}`} aria-expanded={flipped} aria-controls={id} onClick={() => flip(true)}><Info className="size-5" aria-hidden="true" /></button>
        {children}
      </div>
      <div id={id} className={`dashboard-card ${styles.back}`} aria-hidden={!flipped} inert={!flipped}>
        <button ref={backButton} type="button" className={styles.infoButton} aria-label={t("Back to card")} onClick={() => flip(false)}><RotateCcw className="size-5" aria-hidden="true" /></button>
        <h3 className="mb-4 pr-9 text-lg font-bold">{t(title)}</h3>
        <div className="grid gap-4 text-sm leading-relaxed">
          <section><h4 className="font-bold">{t("Calculation")}</h4><p>{t(info.calculation)}</p></section>
          <section><h4 className="font-bold">{t("Assumptions")}</h4><ul className="mt-1 list-disc space-y-2 pl-5">{info.assumptions.map(text => <li key={text}>{t(text)}</li>)}</ul></section>
          <section><h4 className="font-bold">{t("REDCap fields")}</h4><p className="mb-2 text-xs text-muted-foreground">{t("An asterisk matches the infection-specific fields for HIV, syphilis, HCV and HBV.")}</p><div className="flex flex-wrap gap-1">{[...new Set(info.fields)].map(field => <code key={field} className="break-all rounded bg-muted px-1.5 py-1 text-xs">{field}</code>)}</div></section>
        </div>
      </div>
    </div>
  </article>;
}
