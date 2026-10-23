// Elisa Kevin Veragoo + ChatGPT
"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { useLocalization } from "@/components/Localization";

export default function HeaderNavigation({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const container = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const { t } = useLocalization();

  useEffect(() => {
    if (!open) return;
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    }
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("keydown", escape);
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("keydown", escape);
      document.removeEventListener("pointerdown", outside);
    };
  }, [open]);

  return <div ref={container} className="pils-header-navigation">
    <button ref={button} type="button" className="pils-menu-toggle" aria-expanded={open} aria-controls={panelId} aria-label={t(open ? "Close navigation" : "Open navigation")} onClick={() => setOpen(!open)}>
      {open ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
      <span>{t("Menu")}</span>
    </button>
    <div id={panelId} className="pils-menu-panel" data-open={open} onClick={event => {
      if (event.target instanceof Element && event.target.closest("a")) setOpen(false);
    }} onSubmit={() => setOpen(false)}>{children}</div>
  </div>;
}
