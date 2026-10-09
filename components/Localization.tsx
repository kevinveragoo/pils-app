"use client";

import { createContext, useCallback, useContext, useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import type { AppLocale } from "@/lib/localization";

type LocalizationContextValue = { locale: AppLocale; t: (text: string) => string };
const LocalizationContext = createContext<LocalizationContextValue>({ locale: "en", t: (text) => text });
const attributes = ["aria-label", "placeholder", "title"] as const;

export function LocalizationProvider({ locale, strings, children }: { locale: AppLocale; strings: Record<string, string>; children: React.ReactNode }) {
  const t = useCallback((text: string) => strings[text] ?? text, [strings]);
  const value = useMemo(() => ({ locale, t }), [locale, t]);

  useEffect(() => {
    document.documentElement.lang = locale;
    if (locale === "en") return;
    const translateNode = (root: Node) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      let node: Node | null = root;
      while (node) {
        if (node.nodeType === Node.TEXT_NODE) {
          const parent = node.parentElement;
          const source = node.textContent ?? "";
          const key = source.trim();
          if (parent && !["SCRIPT", "STYLE", "TEXTAREA"].includes(parent.tagName) && key && strings[key]) node.textContent = source.replace(key, strings[key]);
        } else if (node instanceof Element) {
          for (const attribute of attributes) {
            const source = node.getAttribute(attribute);
            if (source && strings[source]) node.setAttribute(attribute, strings[source]);
          }
        }
        node = walker.nextNode();
      }
    };
    translateNode(document.body);
    const observer = new MutationObserver((mutations) => mutations.forEach((mutation) => mutation.addedNodes.forEach(translateNode)));
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [locale, strings]);

  return <LocalizationContext.Provider value={value}>{children}</LocalizationContext.Provider>;
}

export function useLocalization() {
  return useContext(LocalizationContext);
}

export function LanguagePicker() {
  const pathname = usePathname();
  const { locale } = useLocalization();
  return <form action="/api/locale" method="post" className="language-picker"><input type="hidden" name="pathname" value={pathname} /><label><span className={`language-flag language-flag-${locale}`} aria-hidden="true" /><span className="language-label">Language</span><select aria-label="Language" name="locale" value={locale} onChange={(event) => event.currentTarget.form?.requestSubmit()}><option value="en">English</option><option value="fr">Français</option><option value="mfe">Kreol Morisien</option></select></label></form>;
}
