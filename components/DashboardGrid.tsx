"use client";

import { Children, isValidElement, useEffect, useRef, useState, type ReactNode } from "react";
import { GripVertical } from "lucide-react";
import { useLocalization } from "@/components/Localization";
import styles from "./DashboardGrid.module.css";

const storageKey = "pils.dashboard.grid.v1";
export function reorderCards(order: string[], from: string, to: string) {
  if (from === to || !order.includes(from) || !order.includes(to)) return order;
  const next = order.filter(id => id !== from);
  next.splice(order.indexOf(to), 0, from);
  return next;
}
export function DashboardGrid({ children }: { children: ReactNode }) {
  const { t } = useLocalization();
  const cards = Children.toArray(children).filter(isValidElement);
  const ids = cards.map(card => String(card.key));
  const [saved, setSaved] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const drag = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
      if (Array.isArray(value)) setSaved([...new Set(value.filter((id): id is string => typeof id === "string"))]);
    } catch { /* Storage may be disabled or contain an older invalid value. */ }
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  const order = [...saved.filter(id => ids.includes(id)), ...ids.filter(id => !saved.includes(id))];
  function move(from: string, to: string) {
    const next = reorderCards(order, from, to);
    // Preserve positions of temporarily hidden cards during filter refreshes.
    const all = [...next, ...saved.filter(id => !ids.includes(id))];
    setSaved(all);
    try { localStorage.setItem(storageKey, JSON.stringify(all)); } catch { /* Keep this session usable without storage. */ }
  }
  function reset() {
    setSaved([]);
    try { localStorage.removeItem(storageKey); } catch { /* Storage is optional. */ }
  }
  return <>
    <div className="mb-4 flex justify-end"><button type="button" className="rounded-xl border px-3 py-2 text-sm font-bold hover:bg-muted" onClick={reset}>{t("Reset grid positions")}</button></div>
    <div className={styles.grid}>
      {order.map(id => {
        const card = cards.find(card => String(card.key) === id)!;
        const compact = (card.props as { infoKey?: string }).infoKey;
        return <div key={id} data-dashboard-grid-card={id} className={`${styles.item} ${["clients", "rapidEncounters", "labEncounters", "commodityUnits"].includes(compact ?? "") ? styles.compact : compact === "filters" ? styles.full : styles.chart} ${active === id ? styles.dragging : ""}`}>
          <button type="button" className={styles.handle} aria-label={`${t("Move card")}: ${t((card.props as { title: string }).title)}`} title={t("Drag to move; use arrow keys to reorder")}
            onKeyDown={event => {
              const direction = ["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : 0;
              if (direction) { event.preventDefault(); const target = order[order.indexOf(id) + direction]; if (target) move(id, target); }
            }}
            onPointerDown={event => {
              if (event.button !== 0) return;
              drag.current = { id, x: event.clientX, y: event.clientY, moved: false };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={event => {
              const current = drag.current;
              if (!current) return;
              if (!current.moved && Math.hypot(event.clientX - current.x, event.clientY - current.y) < 6) return;
              current.moved = true; setActive(id);
            }}
            onPointerUp={event => {
              const current = drag.current;
              if (current?.moved) {
                const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-dashboard-grid-card]")?.dataset.dashboardGridCard;
                if (target) move(current.id, target);
              }
              drag.current = null; setActive(null);
            }}
            onPointerCancel={() => { drag.current = null; setActive(null); }}
          ><GripVertical className="size-4" aria-hidden="true" /></button>
          {card}
        </div>;
      })}
    </div>
    <p role="status" className="sr-only">{active ? t("Drag to move; use arrow keys to reorder") : ""}</p>
  </>;
}
