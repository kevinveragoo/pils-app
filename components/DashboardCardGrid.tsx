"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode, type KeyboardEvent, type PointerEvent } from "react";
import { GripVertical } from "lucide-react";
import { useLocalization } from "@/components/Localization";
import { dashboardCards, type IndicatorValues } from "@/lib/dashboard-cards";
import { defaultCardLayout, getCardOrderSnapshot, getServerCardOrder, moveCard, parseCardOrder, resetCardOrder, saveCardOrder, subscribeCardOrder } from "@/lib/dashboard-card-layout";
import { DashboardIndicatorCard } from "@/components/DashboardIndicatorCard";

type Drag = { id: string; pointer: number; startX: number; startY: number; x: number; y: number; target: string; moving: boolean };

type GridCard = { id: string; title: string; blank?: boolean };
export function DashboardLayoutControls({ group = "executive" }: { group?: "executive" | "default" }) {
  const { t } = useLocalization();
  const [announcement, setAnnouncement] = useState("");
  return <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-sm">
    <p id={`${group}-card-layout-help`} className="text-muted-foreground">Drag a card handle to rearrange. You can also focus a handle and use the arrow keys.</p>
    <button type="button" className="rounded-lg border px-3 py-2 font-semibold hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary" onClick={() => { (group === "default" ? defaultCardLayout.reset : resetCardOrder)(); setAnnouncement(t("Default card layout restored")); }}>{t("Reset card layout")}</button>
    <span className="sr-only" role="status">{announcement}</span>
  </div>;
}
export function DashboardCardGrid({ values, loading, group = "executive", definitions = dashboardCards, renderCard, hideControls = false }: { values?: IndicatorValues; loading: boolean; group?: "executive" | "default"; definitions?: readonly GridCard[]; renderCard?: (id: string) => ReactNode; hideControls?: boolean }) {
  const { t } = useLocalization();
  const subscribe = group === "default" ? defaultCardLayout.subscribe : subscribeCardOrder;
  const getSnapshot = group === "default" ? defaultCardLayout.getSnapshot : getCardOrderSnapshot;
  const save = group === "default" ? defaultCardLayout.save : saveCardOrder;
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerCardOrder);
  const order = useMemo(() => parseCardOrder(snapshot, [...definitions.filter(card => !card.blank), ...definitions.filter(card => card.blank)].map(card => card.id)), [snapshot, definitions]);
  const grid = useRef<HTMLElement>(null);
  const drag = useRef<Drag | null>(null);
  const [preview, setPreview] = useState<Drag | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const cards = order.map(id => definitions.find(card => card.id === id)!);
  const moving = Boolean(preview?.moving);

  useEffect(() => {
    if (!moving) return;
    let frame: number;
    const scroll = () => {
      const current = drag.current;
      if (!current) return;
      const bounds = grid.current?.getBoundingClientRect();
      const inside = bounds && current.x >= bounds.left && current.x <= bounds.right;
      const delta = !inside ? 0 : current.y < 80 ? -16 : current.y > window.innerHeight - 80 ? 16 : 0;
      if (delta) {
        window.scrollBy(0, delta);
        const element = document.elementFromPoint(current.x, current.y)?.closest<HTMLElement>("[data-indicator-slot]");
        const target = element && grid.current?.contains(element) ? element.dataset.indicatorSlot ?? current.id : current.id;
        if (target !== current.target) {
          drag.current = { ...current, target };
          setPreview(drag.current);
        }
      }
      frame = requestAnimationFrame(scroll);
    };
    frame = requestAnimationFrame(scroll);
    return () => cancelAnimationFrame(frame);
  }, [moving]);

  function announce(id: string, next: string[]) {
    const title = definitions.find(card => card.id === id)!.title;
    setAnnouncement(`${t(title)}: ${t("Card position")} ${next.indexOf(id) + 1} / ${next.length}`);
  }
  function start(event: PointerEvent<HTMLButtonElement>, id: string) {
    if (!event.isPrimary || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id, pointer: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, target: id, moving: false };
  }
  function update(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    const moving = current.moving || Math.hypot(event.clientX - current.startX, event.clientY - current.startY) > 6;
    const element = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-indicator-slot]");
    const target = element && grid.current?.contains(element) ? element.dataset.indicatorSlot ?? current.id : current.id;
    drag.current = { ...current, x: event.clientX, y: event.clientY, target, moving };
    if (moving) setPreview(drag.current);
  }
  function finish(event: PointerEvent<HTMLButtonElement>, commit: boolean) {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    drag.current = null;
    setPreview(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (commit && current.moving && current.id !== current.target) {
      const next = moveCard(order, current.id, current.target);
      save(next);
      announce(current.id, next);
    }
  }
  function keyboard(event: KeyboardEvent<HTMLButtonElement>, id: string) {
    if (event.key === "Escape") { drag.current = null; setPreview(null); return; }
    const index = order.indexOf(id);
    const elements = Array.from(grid.current?.querySelectorAll<HTMLElement>("[data-indicator-slot]") ?? []);
    const columns = elements.filter(element => element.offsetTop === elements[0]?.offsetTop).length || 1;
    const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns };
    const targetIndex = event.key === "Home" ? 0 : event.key === "End" ? order.length - 1 : index + (offsets[event.key] ?? 0);
    if (!(event.key in offsets) && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    if (targetIndex < 0 || targetIndex >= order.length || targetIndex === index) return;
    const next = moveCard(order, id, order[targetIndex]);
    save(next);
    announce(id, next);
    // Restore focus after React moves the keyed wrapper in the DOM.
    requestAnimationFrame(() => grid.current?.querySelector<HTMLButtonElement>(`[data-move-card="${id}"]`)?.focus());
  }

  return <div className="mb-8">
    {!hideControls && <DashboardLayoutControls group={group} />}
    <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
    <section ref={grid} aria-label={t(group === "executive" ? "Executive cards" : "Default cards")} className={group === "default" ? "grid gap-4 sm:grid-cols-2" : "grid gap-4 sm:grid-cols-2 xl:grid-cols-3"}>
      {cards.map(card => <div key={card.id} data-indicator-slot={card.id} className="indicator-slot" data-dragging={preview?.id === card.id} data-drop-target={preview?.target === card.id && preview.id !== card.id}>
        <button type="button" className="indicator-card-move" data-move-card={card.id} aria-label={`${t("Move card")}: ${t(card.title)}`} aria-describedby={`${group}-card-layout-help`} title={t("Move card")} onPointerDown={event => start(event, card.id)} onPointerMove={update} onPointerUp={event => finish(event, true)} onPointerCancel={event => finish(event, false)} onLostPointerCapture={event => finish(event, false)} onKeyDown={event => keyboard(event, card.id)}>
          <GripVertical className="size-4" aria-hidden="true" />
        </button>
        {renderCard ? renderCard(card.id) : <DashboardIndicatorCard card={card} value={values?.[card.id]} loading={loading} />}
      </div>)}
    </section>
    {preview?.moving && <div className="indicator-drag-preview" style={{ left: preview.x + 16, top: preview.y + 16 }} aria-hidden="true">{t(definitions.find(card => card.id === preview.id)!.title)}</div>}
  </div>;
}
