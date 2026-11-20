// A cheap stand-in for running `next build` on every change: the engine
// checkout's location is only known at runtime, and a path built from it
// without Turbopack's ignore comment makes the production build trace the whole
// project into the server output (and print a warning).

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "lib", "server");
const UNGUARDED = /path\.(?:join|resolve)\(\s*(?!\/\*\s*turbopackIgnore:\s*true\s*\*\/)(?:process\.cwd\(\)|engineCodeRoot\(\))/g;

test("every runtime path to the engine checkout carries the turbopackIgnore comment", () => {
  const files = fs.readdirSync(serverDir).filter((f) => f.endsWith(".mjs"));
  assert.ok(files.includes("engine.mjs") && files.includes("pdf.mjs"));
  for (const file of files) {
    const source = fs.readFileSync(path.join(serverDir, file), "utf8");
    const bad = [...source.matchAll(UNGUARDED)].map((m) => m[0]);
    assert.deepEqual(bad, [], `${file} builds an unguarded runtime path`);
  }
});

test("the check itself catches an unguarded path", () => {
  assert.equal([...'path.resolve(process.cwd(), "..")'.matchAll(UNGUARDED)].length, 1);
  assert.equal([...'path.join(/* turbopackIgnore: true */ engineCodeRoot(), "x")'.matchAll(UNGUARDED)].length, 0);
});
