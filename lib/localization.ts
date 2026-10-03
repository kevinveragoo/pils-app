import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { cookies } from "next/headers";

export const locales = ["en", "fr", "mfe"] as const;
export type AppLocale = typeof locales[number];
export const defaultLocale: AppLocale = "en";
export const localeCookieName = "pils_locale";

export function isAppLocale(value: string): value is AppLocale {
  return locales.includes(value as AppLocale);
}

export async function currentLocale(): Promise<AppLocale> {
  const value = (await cookies()).get(localeCookieName)?.value ?? "";
  return isAppLocale(value) ? value : defaultLocale;
}

function unescapeStringsValue(value: string) {
  return value.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

async function readStrings(locale: AppLocale) {
  const file = path.join(process.cwd(), "locales", `${locale}.lproj`, "Localizable.strings");
  const source = await readFile(file, "utf8");
  const result: Record<string, string> = {};
  const entry = /^\s*"((?:\\.|[^"\\])*)"\s*=\s*"((?:\\.|[^"\\])*)"\s*;/gm;
  for (const match of source.matchAll(entry)) result[unescapeStringsValue(match[1])] = unescapeStringsValue(match[2]);
  return result;
}

export async function translationsFor(locale: AppLocale) {
  const english = await readStrings("en");
  return locale === "en" ? english : { ...english, ...await readStrings(locale) };
}
