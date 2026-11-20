// Helpers for the browser test: axe, keyboard navigation, focus and target-size checks.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

export const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

let axeSource = null;
export function loadAxe(appDir) {
  axeSource ??= fs.readFileSync(path.join(appDir, "node_modules", "axe-core", "axe.min.js"), "utf8");
  return axeSource;
}

/**
 * Run axe in the page against the WCAG 2.0, 2.1 and 2.2 A and AA rules, in light
 * and then dark mode (contrast differs). Violations are pushed onto `sink`.
 */
export async function runAxe(page, appDir, label, sink) {
  const source = loadAxe(appDir);
  const original = await page.evaluate(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  for (const scheme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: scheme });
    // Buttons and links fade their colours over 150 ms; wait so contrast is measured at rest.
    await page.waitForTimeout(450);
    // Inject and run in one evaluate: a reload between two evaluates leaves window.axe undefined.
    const result = await page.evaluate(
      `(async () => {
        if (typeof window.axe === "undefined") { ${source} }
        const r = await window.axe.run(document, { runOnly: { type: "tag", values: ${JSON.stringify(AXE_TAGS)} } });
        return r.violations;
      })()`,
    );
    for (const v of result) {
      sink.push({
        label,
        scheme,
        id: v.id,
        impact: v.impact,
        help: v.help,
        nodes: v.nodes.slice(0, 4).map((n) => ({ target: n.target.join(" "), html: n.html.slice(0, 160), why: (n.any[0] ?? n.all[0] ?? n.none[0])?.message ?? "" })),
        count: v.nodes.length,
      });
    }
  }
  await page.emulateMedia({ colorScheme: original ? "dark" : "light" });
}

export function describeAxe(violations) {
  return violations
    .map((v) => `  [${v.label} / ${v.scheme}] ${v.id} (${v.impact}, ${v.count} node${v.count === 1 ? "" : "s"}): ${v.help}\n${v.nodes.map((n) => `      ${n.target}\n        ${n.html}\n        ${n.why}`).join("\n")}`)
    .join("\n");
}

/** The focused element, or null when focus is on the page itself. */
export function activeInfo(page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body || el === document.documentElement) return null;
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id,
      cls: String(el.className ?? "").slice(0, 80),
      text: String(el.innerText || el.value || el.getAttribute("aria-label") || "").slice(0, 70),
      w: r.width,
      h: r.height,
      onScreen: r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth,
      card: el.closest('li[id^="sug-"]')?.id ?? null,
    };
  });
}

export async function assertFocusVisible(page, what) {
  const info = await activeInfo(page);
  assert.ok(info, `${what}: focus fell back to the page (document.activeElement is body)`);
  assert.ok(info.onScreen, `${what}: focused element is not on screen: ${JSON.stringify(info)}`);
  return info;
}

/** The first Tab on a freshly loaded page must land on the skip link. */
export async function assertSkipLinkFirst(page, what) {
  await page.evaluate(() => {
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  });
  await page.keyboard.press("Tab");
  const info = await assertFocusVisible(page, `${what}: first Tab`);
  assert.ok(info.cls.includes("skip-link"), `${what}: the first Tab landed on <${info.tag}> "${info.text}", not the skip link`);
}

/** Press Tab until the focused element matches `selector`. */
export async function tabTo(page, selector, max = 160) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    const hit = await page.evaluate((sel) => Boolean(document.activeElement?.matches(sel)), selector);
    if (hit) return assertFocusVisible(page, `Tab to ${selector}`);
  }
  const at = await activeInfo(page);
  throw new Error(`Tab did not reach ${selector} within ${max} presses (last stop: ${JSON.stringify(at)})`);
}

/** Interactive elements smaller than 24 by 24 CSS pixels (WCAG 2.2 target size, minimum). */
export function smallTargets(page) {
  return page.evaluate(() => {
    const out = [];
    const nodes = document.querySelectorAll('a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [tabindex]:not([tabindex="-1"])');
    for (const el of nodes) {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      // The skip link waits above the viewport until focused.
      if (el.classList.contains("skip-link") && r.bottom <= 0) continue;
      if (r.width < 23.5 || r.height < 23.5) {
        out.push(`${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""} "${String(el.innerText || el.getAttribute("aria-label") || el.value || "").slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    }
    return out;
  });
}

export async function assertTargets(page, what) {
  const small = await smallTargets(page);
  assert.deepEqual(small, [], `${what}: controls smaller than 24x24 CSS px`);
}

export function noHorizontalScroll(page) {
  return page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
}

// ---------------------------------------------------------------------------
// Server plumbing shared by the three harnesses (test:flow, test:e2e, test:prod).

/**
 * Kill a server started with `detached: true` (its own process group on posix). `next` spawns a child
 * server, so the whole group goes, even when the parent has already exited.
 */
export function killTree(proc) {
  if (!proc) return;
  // On win32 an exited parent has no tree left to kill.
  if (process.platform === "win32" && proc.exitCode !== null) return;
  try {
    if (process.platform === "win32") execFileSync("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
    else process.kill(-proc.pid, "SIGKILL");
  } catch {
    // Already gone.
  }
}

export function portIsFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.listen(port, () => srv.close(() => resolve(true)));
  });
}

/**
 * Other `next` processes (the CLI, its server, its workers) whose working directory is this app. Linux only
 * (reads /proc); elsewhere it returns [] and the port check is the only guard.
 */
export function staleNextProcesses(appDir) {
  if (process.platform !== "linux") return [];
  let here;
  try {
    here = fs.realpathSync(appDir);
  } catch {
    return [];
  }
  const found = [];
  for (const name of fs.readdirSync("/proc")) {
    if (!/^\d+$/.test(name) || Number(name) === process.pid) continue;
    try {
      if (fs.realpathSync(`/proc/${name}/cwd`) !== here) continue;
      const cmd = fs.readFileSync(`/proc/${name}/cmdline`, "utf8").split("\0").join(" ").trim();
      if (/next-server|next[\\/]dist|[\\/]next( |$)/.test(cmd)) found.push(`pid ${name}: ${cmd.slice(0, 160)}`);
    } catch {
      // The process exited, or it is not ours to inspect.
    }
  }
  return found;
}

/** Fail fast, with a message that says what to stop, before a harness starts its own server. */
export async function assertCleanStart(appDir, port) {
  assert.ok(await portIsFree(port), `port ${port} is already in use. Stop whatever is listening on it (a server from an earlier run?) and run again.`);
  const stale = staleNextProcesses(appDir);
  assert.equal(
    stale.length,
    0,
    `another next process already has ${appDir} as its working directory. Stop it and run again (the harness does not kill processes it did not start):\n  ${stale.join("\n  ")}`,
  );
}
