// Production-mode smoke test: `next build`, then `next start` with NODE_ENV=production,
// a real database, the engine fact gate and the PDF renderer, with NO development
// flags (production refuses them) and a session cookie minted with Auth.js's own
// `encode`, so no sign-in route is involved.
//
//   npm run test:prod
//
// Prints PASS or FAIL per step and exits non-zero on any failure. The server is
// always stopped.

import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";
import { encode } from "next-auth/jwt";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
process.env.CAREER_OPS_CODE_ROOT ||= path.resolve(appDir, "../../packages/engine");

const load = (rel) => import(pathToFileURL(path.join(appDir, rel)).href);
const { createDb } = await load("src/lib/db/index.mjs");
const repo = await load("src/lib/db/repo.mjs");
const { normalizeFacts, tailorableLines } = await load("src/lib/facts.mjs");
const { MOCK_RESUME } = await load("src/lib/llm/mock.mjs");
const { pdfText } = await load("src/lib/server/pdf-text.mjs");

const PORT = 3124;
const base = `http://localhost:${PORT}`;
const SECRET = "prod-smoke-secret-not-for-real-use-0123456789abcdef";
// Over plain http Auth.js names the cookie without the __Secure- prefix, and uses the name as the encryption salt.
const COOKIE = "authjs.session-token";

const HONEST = "Cut month-end close time by 30% with SQL and Power BI reporting";
const INVENTED = "Led a team of 12 analysts across reporting";
const squash = (s) => s.replace(/\s+/g, "");

const GENERATED = ["tsconfig.json", "next-env.d.ts"].map((name) => path.join(appDir, name));
const generated = GENERATED.map((file) => [file, fs.existsSync(file) ? fs.readFileSync(file) : null]);
function restoreGenerated() {
  for (const [file, content] of generated) {
    if (content === null) fs.rmSync(file, { force: true });
    else if (!fs.existsSync(file) || !fs.readFileSync(file).equals(content)) fs.writeFileSync(file, content);
  }
}

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "rolewright-prod-"));
const dbDir = path.join(dataDir, "pglite");
let child = null;
let browser = null;
let serverOutput = "";

function serverEnv() {
  const env = {
    ...process.env,
    NODE_ENV: "production",
    BUILD_DIST: ".next-prod",
    AUTH_SECRET: SECRET,
    AUTH_URL: base,
    ROLEWRIGHT_DATA_DIR: dbDir,
    NEXT_TELEMETRY_DISABLED: "1",
  };
  for (const k of ["ROLEWRIGHT_DEV_LOGIN", "ROLEWRIGHT_ALLOW_MOCK_LLM", "DATABASE_URL", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "AUTH_RESEND_KEY", "EMAIL_FROM", "CAREER_OPS_ROOT", "CAREER_OPS_DATA_DIR"]) {
    delete env[k];
  }
  return env;
}

const nextBin = path.join(appDir, "node_modules", "next", "dist", "bin", "next");

function killTree(proc) {
  if (!proc || proc.exitCode !== null) return;
  try {
    if (process.platform === "win32") execFileSync("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
    else proc.kill("SIGKILL");
  } catch {
    // Already gone.
  }
}

process.once("exit", () => {
  killTree(child);
  restoreGenerated();
});
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => process.exit(130));

async function stopServer() {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  killTree(child);
  await Promise.race([exited, new Promise((r) => setTimeout(r, 15_000))]);
}

async function launchBrowser() {
  try {
    return await chromium.launch();
  } catch (err) {
    const root = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
    const dirs = fs.existsSync(root)
      ? fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]))
      : [];
    for (const d of dirs) {
      for (const sub of ["chrome-win64", "chrome-win", "chrome-linux"]) {
        const exe = path.join(root, d, sub, process.platform === "win32" ? "chrome.exe" : "chrome");
        if (fs.existsSync(exe)) return chromium.launch({ executablePath: exe });
      }
    }
    throw err;
  }
}

function runBuild() {
  return new Promise((resolve, reject) => {
    let out = "";
    const proc = spawn(process.execPath, [nextBin, "build"], { cwd: appDir, env: serverEnv(), stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.stderr.on("data", (d) => (out += d.toString()));
    proc.on("exit", (code) => (code === 0 ? resolve(out) : reject(new Error(`next build failed (code ${code}).\n${out.slice(-4000)}`))));
  });
}

async function waitForServer() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`next start exited early (code ${child.exitCode}).\n${serverOutput.slice(-3000)}`);
    try {
      const res = await fetch(`${base}/api/auth/csrf`, { signal: AbortSignal.timeout(30_000) });
      if (res.status === 200) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`next start did not answer in time.\n${serverOutput.slice(-3000)}`);
}

function portIsFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.listen(port, () => srv.close(() => resolve(true)));
  });
}

async function mintCookie(userId, email) {
  const token = await encode({ token: { sub: userId, uid: userId, email }, secret: SECRET, salt: COOKIE, maxAge: 3600 });
  return `${COOKIE}=${token}`;
}

async function request(cookie, method, route, { json, headers = {} } = {}) {
  const h = { ...headers };
  if (cookie) h.cookie = cookie;
  let body;
  if (json !== undefined) {
    h["content-type"] = "application/json";
    body = JSON.stringify(json);
  }
  const res = await fetch(base + route, { method, headers: h, body, redirect: "manual", signal: AbortSignal.timeout(120_000) });
  const type = res.headers.get("content-type") ?? "";
  let data;
  if (type.includes("application/json")) data = await res.json();
  else if (type.includes("application/pdf")) data = Buffer.from(await res.arrayBuffer());
  else data = await res.text();
  return { status: res.status, headers: res.headers, data };
}

const steps = [];
let failures = 0;
async function step(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
    steps.push([name, true]);
  } catch (err) {
    failures++;
    console.log(`FAIL ${name}`);
    console.log(String(err?.stack ?? err).split("\n").map((l) => `     ${l}`).join("\n"));
    steps.push([name, false]);
    throw err;
  }
}

const state = {};

try {
  await step("1. seed the database directly: two users, A's confirmed facts, a job and a tailoring", async () => {
    const raw = {
      contact: { ...MOCK_RESUME.contact, confirmed: true },
      summary: { text: MOCK_RESUME.summary, confirmed: true },
      experience: MOCK_RESUME.experience.map((e) => ({
        company: e.company,
        title: e.title,
        location: e.location,
        start: e.start,
        end: e.end,
        confirmed: true,
        bullets: e.bullets.map((text) => ({ text, confirmed: true })),
      })),
      education: MOCK_RESUME.education.map((e) => ({ ...e, confirmed: true })),
      skills: MOCK_RESUME.skills.map((name) => ({ name, confirmed: true })),
    };
    const facts = normalizeFacts(raw, { trustConfirmed: true });
    const lines = tailorableLines(facts).filter((l) => l.kind === "bullet");
    assert.ok(lines.length >= 3, "three confirmed bullets");
    const [first, second, third] = lines;
    const staleCheck = { verdict: "pass", issues: [], advisory: [], engineRan: true };
    const make = (id, line, after, decision) => ({
      id,
      ref: line.ref,
      kind: "bullet",
      context: line.context,
      before: line.text,
      after,
      rationale: "Matches the job's wording.",
      check: staleCheck,
      decision,
      finalText: after,
    });
    const suggestions = [
      make("sug-honest-0001", first, HONEST, "accepted"),
      make("sug-invented-0002", second, INVENTED, "accepted"),
      make("sug-pending-0003", third, "Managed budgets of ₹2 crore", "pending"),
    ];
    const db = await createDb({ dataDir: dbDir });
    try {
      const a = await repo.upsertUserByEmail(db, { email: "asha.prod@example.com" });
      const b = await repo.upsertUserByEmail(db, { email: "bala.prod@example.com" });
      state.a = a;
      state.b = b;
      await repo.saveFacts(db, a.id, facts);
      const job = await repo.createJob(db, a.id, { title: "Finance Analyst", company: "Zeta Fintech", jdText: "Zeta Fintech is hiring a Finance Analyst in Bengaluru to own month-end close. ".repeat(4) });
      const t = await repo.createTailoring(db, a.id, { jobId: job.id, suggestions, provider: "gemini", model: "test-model" });
      state.tid = t.id;
      state.facts = facts;
    } finally {
      await db.close();
    }
  });

  await step("2. next build into .next-prod with no development flags", async () => {
    assert.ok(await portIsFree(PORT), `port ${PORT} is free`);
    fs.rmSync(path.join(appDir, ".next-prod"), { recursive: true, force: true });
    await runBuild();
    assert.ok(fs.existsSync(path.join(appDir, ".next-prod", "BUILD_ID")), "the build finished");
  });

  await step("3. next start with NODE_ENV=production answers", async () => {
    child = spawn(process.execPath, [nextBin, "start", "-p", String(PORT)], { cwd: appDir, env: serverEnv(), stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    child.stdout.on("data", (d) => (serverOutput += d.toString()));
    child.stderr.on("data", (d) => (serverOutput += d.toString()));
    await waitForServer();
  });

  await step("4. minted session cookies are accepted by /api/auth/session", async () => {
    state.cookieA = await mintCookie(state.a.id, "asha.prod@example.com");
    state.cookieB = await mintCookie(state.b.id, "bala.prod@example.com");
    const sa = await request(state.cookieA, "GET", "/api/auth/session");
    assert.equal(sa.status, 200);
    assert.equal(sa.data?.user?.id, state.a.id, JSON.stringify(sa.data));
    const sb = await request(state.cookieB, "GET", "/api/auth/session");
    assert.equal(sb.data?.user?.id, state.b.id);
  });

  await step("5. A: GET /api/facts returns the seeded facts (database and row-level security in the production bundle)", async () => {
    const res = await request(state.cookieA, "GET", "/api/facts");
    assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 300));
    assert.equal(res.data.facts.contact.name, "Asha Rao");
    assert.equal(res.data.facts.experience[0].bullets.length, 3);
    assert.equal(res.data.counts.confirmed, res.data.counts.total);
    assert.ok(res.data.counts.total >= 8);
  });

  await step("6. A: the tailoring comes back with checks recomputed; the stale pass is now a block and the engine ran", async () => {
    const res = await request(state.cookieA, "GET", `/api/tailorings/${state.tid}`);
    assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 300));
    const list = res.data.tailoring.suggestions;
    assert.equal(list.length, 3);
    const invented = list.find((s) => s.finalText === INVENTED);
    const honest = list.find((s) => s.finalText === HONEST);
    assert.equal(invented.check.verdict, "block", JSON.stringify(invented.check));
    assert.equal(invented.check.engineRan, true, "the engine fact gate loaded and ran");
    assert.notEqual(honest.check.verdict, "block", JSON.stringify(honest.check));
    assert.equal(honest.check.engineRan, true);
  });

  await step("7. A: export refuses while the invented claim is accepted (409 naming 12)", async () => {
    const res = await request(state.cookieA, "POST", `/api/tailorings/${state.tid}/export`);
    assert.equal(res.status, 409, `export answered ${res.status}`);
    assert.ok(Array.isArray(res.data.issues) && res.data.issues.some((i) => String(i.value).includes("12")), JSON.stringify(res.data));
  });

  await step("8. A: after rejecting it, export returns a PDF with the honest wording and not 12 analysts", async () => {
    const patch = await request(state.cookieA, "PATCH", `/api/tailorings/${state.tid}/suggestions/sug-invented-0002`, { json: { action: "reject" } });
    assert.equal(patch.status, 200, JSON.stringify(patch.data).slice(0, 300));
    const res = await request(state.cookieA, "POST", `/api/tailorings/${state.tid}/export`);
    assert.equal(res.status, 200, `export answered ${res.status}: ${Buffer.isBuffer(res.data) ? "" : JSON.stringify(res.data).slice(0, 400)}`);
    assert.equal(res.headers.get("content-type"), "application/pdf");
    assert.equal(res.data.subarray(0, 5).toString("latin1"), "%PDF-");
    const text = squash((await pdfText(res.data)).text);
    assert.ok(text.includes(squash(HONEST)), "the accepted honest wording is in the PDF");
    assert.ok(!text.includes(squash("12 analysts")), "the invented claim is not in the PDF");
    assert.ok(text.includes(squash("Managed a team of 4 analysts")), "the untouched confirmed line stays");
  });

  await step("9. B: A's tailoring is 404 and B's facts are empty", async () => {
    const t = await request(state.cookieB, "GET", `/api/tailorings/${state.tid}`);
    assert.equal(t.status, 404);
    const x = await request(state.cookieB, "POST", `/api/tailorings/${state.tid}/export`);
    assert.equal(x.status, 404);
    const f = await request(state.cookieB, "GET", "/api/facts");
    assert.equal(f.status, 200);
    assert.deepEqual(f.data.counts, { confirmed: 0, total: 0 });
    assert.equal(f.data.facts.experience.length, 0);
  });

  await step("10. no cookie gets 401; a POST from another origin gets 403", async () => {
    const none = await request(null, "GET", "/api/facts");
    assert.equal(none.status, 401);
    const evil = await request(state.cookieA, "POST", "/api/tailorings", {
      json: { title: "X", company: "Y", jdText: "x".repeat(250) },
      headers: { origin: "https://evil.example" },
    });
    assert.equal(evil.status, 403, JSON.stringify(evil.data));
  });

  await step("11. /sign-in carries the security headers, a nonce and no 'unsafe-inline' in script-src", async () => {
    const res = await request(null, "GET", "/sign-in");
    assert.equal(res.status, 200);
    const csp = res.headers.get("content-security-policy") ?? "";
    assert.ok(csp, "Content-Security-Policy is set");
    const directive = (name) => csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(`${name} `)) ?? "";
    for (const need of ["default-src 'self'", "frame-ancestors 'none'", "base-uri 'self'", "object-src 'none'", "form-action 'self' https://accounts.google.com"]) {
      assert.ok(csp.includes(need), `CSP has ${need}: ${csp}`);
    }
    const script = directive("script-src");
    assert.match(script, /'nonce-[A-Za-z0-9+/=_-]{16,}'/, `script-src carries a nonce: ${script}`);
    assert.ok(!script.includes("'unsafe-inline'"), `script-src has no 'unsafe-inline': ${script}`);
    assert.ok(!script.includes("'unsafe-eval'"), `script-src has no 'unsafe-eval' in production: ${script}`);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.equal(res.headers.get("x-frame-options"), "DENY");
    assert.equal(res.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
    assert.equal(res.headers.get("permissions-policy"), "camera=(), microphone=(), geolocation=()");
    // A new nonce on every request.
    const again = await request(null, "GET", "/sign-in");
    const nonce = (h) => /'nonce-([^']+)'/.exec(h.get("content-security-policy") ?? "")?.[1];
    assert.notEqual(nonce(res.headers), nonce(again.headers), "the nonce changes per request");
    // The page's own scripts carry that nonce.
    assert.ok(res.data.includes(`nonce="${nonce(res.headers)}"`), "inline and framework scripts in the HTML carry the nonce");
  });

  await step("12. the mock AI provider does not exist in production", async () => {
    const res = await request(state.cookieA, "POST", "/api/keys/verify", {
      headers: { "x-llm-provider": "mock", "x-llm-key": "mock-valid-key", "x-llm-model": "mock-1" },
    });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(res.data.ok, false);
    assert.equal(res.data.code, "not_allowed");
  });

  await step("13. in Chromium the production page hydrates with no Content Security Policy violation", async () => {
    browser = await launchBrowser();
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, baseURL: base });
    const page = await ctx.newPage();
    const problems = [];
    page.on("console", (m) => {
      if (/content security policy|refused to (execute|load|apply)/i.test(m.text())) problems.push(m.text().slice(0, 300));
    });
    page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));

    // Signed out: the sign-in page and the landing page load and run their scripts.
    for (const route of ["/sign-in", "/"]) {
      await page.goto(route, { waitUntil: "networkidle" });
      assert.ok(await page.evaluate(() => Boolean(document.querySelector("main"))), `${route} rendered`);
    }

    // Signed in: the key screen is a client component, so typing into it proves React hydrated.
    await ctx.addCookies([{ name: COOKIE, value: state.cookieA.slice(COOKIE.length + 1), url: base }]);
    await page.goto("/app/key", { waitUntil: "networkidle" });
    const keyInput = page.locator('input[type="password"], input[name*="key" i], input[id*="key" i]').first();
    await keyInput.waitFor();
    await keyInput.fill("not-a-real-key-123456");
    assert.equal(await keyInput.inputValue(), "not-a-real-key-123456");
    // A client-side navigation (no full reload) needs the framework's scripts to be running.
    const marker = await page.evaluate(() => (window.__smoke = Math.random()));
    await page.getByRole("link", { name: /privacy/i }).first().click();
    await page.waitForURL(/\/app\/privacy/);
    assert.equal(await page.evaluate(() => window.__smoke), marker, "the navigation was client-side, so the scripts ran");
    assert.deepEqual(problems, [], "no Content Security Policy violation or page error on the real pages");

    // Control: the same page with an inline script added the way an attacker's markup would
    // arrive (parser-inserted, no nonce) must not run, and the browser must say why.
    const attacked = await ctx.newPage();
    const reports = [];
    attacked.on("console", (m) => reports.push(m.text()));
    await attacked.route("**/sign-in", async (route) => {
      const res = await route.fetch();
      const body = (await res.text()).replace("</body>", "<script>window.__injected = true</script></body>");
      await route.fulfill({ response: res, body });
    });
    await attacked.goto("/sign-in", { waitUntil: "networkidle" });
    assert.equal(await attacked.evaluate(() => window.__injected === true), false, "an injected inline script did not run");
    assert.ok(
      reports.some((t) => /content security policy/i.test(t) && /inline/i.test(t)),
      `the browser reported the blocked script: ${reports.join(" | ").slice(0, 300)}`,
    );
    await ctx.close();
  });
} catch {
  // Reported by step().
} finally {
  await browser?.close().catch(() => {});
  await stopServer();
  if (failures && serverOutput) {
    console.log("\n--- last server output ---");
    console.log(serverOutput.slice(-4000));
  }
  fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  restoreGenerated();
}

const passed = steps.filter(([, ok]) => ok).length;
console.log(`\n${failures ? "FAIL" : "PASS"}: ${passed} of ${steps.length} steps passed${failures ? "" : " (all)"}`);
process.exit(failures ? 1 : 0);
