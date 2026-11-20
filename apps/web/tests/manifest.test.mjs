import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "..");
const srcRoot = join(webRoot, "src");

const { default: manifest } = await import("../src/app/manifest.ts");
const m = manifest();

function filesUnder(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

/** First value of a design token in globals.css. The first :root block is the light theme. */
function token(name) {
  const css = readFileSync(join(srcRoot, "app/globals.css"), "utf8");
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  assert.ok(match, `--${name} is defined in globals.css`);
  return match[1].toLowerCase();
}

test("manifest identifies the app and opens it in standalone mode", () => {
  assert.equal(m.name, "Rolewright");
  assert.equal(m.short_name, "Rolewright");
  assert.equal(m.start_url, "/app");
  assert.equal(m.scope, "/");
  assert.equal(m.display, "standalone");
});

test("manifest colours come from the light theme tokens in globals.css", () => {
  assert.equal(m.background_color.toLowerCase(), token("bg"));
  assert.equal(m.theme_color.toLowerCase(), token("brand"));
});

test("manifest lists 192 and 512 PNG icons, with a maskable 512", () => {
  const icons = m.icons;
  assert.deepEqual(
    icons.map((i) => [i.src, i.sizes, i.type, i.purpose]),
    [
      ["/icons/192", "192x192", "image/png", "any"],
      ["/icons/512", "512x512", "image/png", "any"],
      ["/icons/512", "512x512", "image/png", "maskable"],
    ],
  );
});

test("no source file mentions a service worker", () => {
  for (const file of filesUnder(srcRoot)) {
    const text = readFileSync(file, "utf8");
    assert.ok(!text.includes("serviceWorker"), `${file} mentions a service worker`);
  }
});
