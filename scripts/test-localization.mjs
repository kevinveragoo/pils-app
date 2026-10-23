// Elisa Kevin Veragoo + ChatGPT
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { localizationSources } from "./localization-coverage.mjs";

const root = path.resolve(import.meta.dirname, "..");
const locales = ["en", "fr", "mfe"];
const pattern = /^\s*"((?:\\.|[^"\\])*)"\s*=\s*"((?:\\.|[^"\\])*)"\s*;/gm;

function read(locale) {
  const filename = path.join(root, "locales", `${locale}.lproj`, "Localizable.strings");
  const source = fs.readFileSync(filename, "utf8");
  const entries = [...source.matchAll(pattern)];
  const keys = entries.map((match) => match[1]);
  assert.equal(new Set(keys).size, keys.length, `${locale} contains duplicate localization keys`);
  assert.ok(entries.every((match) => match[2].trim()), `${locale} contains an empty translation`);
  const remaining = source.replace(pattern, "").replace(/\/\*[\s\S]*?\*\//g, "").trim();
  assert.equal(remaining, "", `${locale} contains malformed catalog content`);
  return new Set(keys.map(key => JSON.parse(`"${key}"`)));
}

const english = read("en");
for (const locale of locales.slice(1)) assert.deepEqual(read(locale), english, `${locale} keys must match the English catalog`);
const sources = localizationSources();
const missing = [...sources].filter(([key]) => !english.has(key));
assert.deepEqual(missing.map(([key, files]) => `${key} (${[...files].join(", ")})`), [], "App labels and generated instrument labels must be present in every catalog");
for (const locale of ["fr", "mfe"]) {
  const source = fs.readFileSync(path.join(root, "locales", `${locale}.lproj`, "Localizable.strings"), "utf8");
  const values = Object.fromEntries([...source.matchAll(pattern)].map(match => [JSON.parse(`"${match[1]}"`), JSON.parse(`"${match[2]}"`)]));
  for (const key of ["Middle name 1", "Middle name 2", "Middle name 3", "Previous HIV test result", "Lookup - partial", "Clinic Queue"]) assert.notEqual(values[key], key, `${locale}: ${key} must be translated`);
}
console.log(`Source coverage passed: ${sources.size} labels from app screens, shared choices and generated instruments.`);
console.log(`Localization catalogs passed: ${english.size} matching strings in ${locales.join(", ")}.`);
