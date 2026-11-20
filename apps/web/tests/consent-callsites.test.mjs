// P1-2: every requireConsent( call under src/app names the provider, so a request is only
// ever covered by the consent given for the provider that will receive the text.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = new URL("../src/app", import.meta.url).pathname;
const files = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx|mjs)$/.test(f) ? [p] : [];
  });

/** The top-level arguments of the call whose "(" is at src[open]. */
function args(src, open) {
  const out = [];
  let depth = 0;
  let cur = "";
  let quote = "";
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      cur += c;
      if (c === "\\") cur += src[++i];
      else if (c === quote) quote = "";
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; cur += c; continue; }
    if ("([{".includes(c)) { if (depth++ > 0) cur += c; continue; }
    if (")]}".includes(c)) {
      if (--depth === 0) { if (cur.trim()) out.push(cur.trim()); return out; }
      cur += c;
      continue;
    }
    if (c === "," && depth === 1) { out.push(cur.trim()); cur = ""; continue; }
    cur += c;
  }
  throw new Error("unbalanced call");
}

test("every requireConsent( call under src/app passes two arguments", () => {
  let calls = 0;
  for (const file of files(root)) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/\brequireConsent\s*\(/g)) {
      calls++;
      const a = args(src, m.index + m[0].length - 1);
      assert.equal(a.length, 2, `${path.relative(root, file)}: requireConsent(${a.join(", ")}) needs (userId, provider)`);
    }
  }
  assert.ok(calls >= 2, "the scan found the calls it is meant to check");
});
