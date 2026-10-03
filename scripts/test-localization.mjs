import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

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
  return new Set(keys);
}

const english = read("en");
for (const locale of locales.slice(1)) assert.deepEqual(read(locale), english, `${locale} keys must match the English catalog`);
console.log(`Localization catalogs passed: ${english.size} matching strings in ${locales.join(", ")}.`);
