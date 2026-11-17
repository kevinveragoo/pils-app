import { dashboardCards } from "./dashboard-cards";
import { defaultDashboardCards } from "./dashboard-default-cards";

export const cardOrderStorageKey = "pils:dashboard-card-order:v1";
export const defaultCardOrder: string[] = [
  ...dashboardCards.filter(card => !("blank" in card && card.blank)),
  ...dashboardCards.filter(card => "blank" in card && card.blank),
].map(card => card.id);

export function parseCardOrder(snapshot: string, available: readonly string[] = defaultCardOrder): string[] {
  let saved: unknown;
  try { saved = JSON.parse(snapshot); } catch { return [...available]; }
  if (!Array.isArray(saved)) return [...available];
  const valid = saved.filter((id): id is string => typeof id === "string" && available.includes(id));
  return [...new Set([...valid, ...available])];
}

export function moveCard(order: string[], id: string, target: string): string[] {
  const from = order.indexOf(id), to = order.indexOf(target);
  if (from < 0 || to < 0 || from === to) return order;
  const next = [...order];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}

// Stable string snapshots keep SSR/hydration deterministic. If storage is
// disabled or full, preserve reordering in memory for the current page.
export const getServerCardOrder = () => "";
export function createCardLayoutStore(storageKey: string, available: readonly string[]) {
  let volatileSnapshot: string | null = null;
  const listeners = new Set<() => void>();
  function getSnapshot() {
    if (volatileSnapshot !== null) return volatileSnapshot;
    try { return window.localStorage.getItem(storageKey) ?? ""; } catch { return ""; }
  }
  function subscribe(listener: () => void) {
    listeners.add(listener);
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) {
        volatileSnapshot = null;
        listener();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => { listeners.delete(listener); window.removeEventListener("storage", onStorage); };
  }
  function save(order: string[]) {
    const snapshot = JSON.stringify(parseCardOrder(JSON.stringify(order), available));
    try { window.localStorage.setItem(storageKey, snapshot); volatileSnapshot = null; }
    catch { volatileSnapshot = snapshot; }
    listeners.forEach(listener => listener());
  }
  function reset() {
    try { window.localStorage.removeItem(storageKey); volatileSnapshot = null; }
    catch { volatileSnapshot = ""; }
    listeners.forEach(listener => listener());
  }
  return { getSnapshot, subscribe, save, reset };
}
const executiveLayout = createCardLayoutStore(cardOrderStorageKey, defaultCardOrder);
export const getCardOrderSnapshot = executiveLayout.getSnapshot;
export const subscribeCardOrder = executiveLayout.subscribe;
export const saveCardOrder = executiveLayout.save;
export const resetCardOrder = executiveLayout.reset;
export const defaultCardLayout = createCardLayoutStore("pils:dashboard-default-card-order:v1", defaultDashboardCards.map(card => card.id));
