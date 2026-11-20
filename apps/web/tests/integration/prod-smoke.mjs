// Production-mode smoke test: `next build`, then `next start` with NODE_ENV=production,
// a real database, the engine fact gate and the PDF renderer, with NO development
// flags (production refuses them) and a session cookie minted with Auth.js's own
// `encode`, so no sign-in route is involved.
//
//   npm run test:prod
//
// Prints PASS or FAIL per step and exits non-zero on any failure. The server is
// always stopped.
//
// Remote mode: SMOKE_BASE_URL=https://<deployed host> builds and starts nothing and runs only the steps
// that need no sign-in and write nothing. See runRemote() below. Optional and opt-in: SMOKE_SESSION_COOKIE
// (the owner's own staging session, a full name=value pair such as
// __Secure-authjs.session-token=..., read from the environment and never printed) with SMOKE_TAILORING_ID
// times one GET of that tailoring.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";
import { encode } from "next-auth/jwt";
import { assertCleanStart, killTree } from "../e2e/helpers.mjs";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
process.env.CAREER_OPS_CODE_ROOT ||= path.resolve(appDir, "../../packages/engine");

const load = (rel) => import(pathToFileURL(path.join(appDir, rel)).href);
const { createDb } = await load("src/lib/db/index.mjs");
const repo = await load("src/lib/db/repo.mjs");
const { normalizeFacts, tailorableLines } = await load("src/lib/facts.mjs");
const { MOCK_RESUME } = await load("src/lib/llm/mock.mjs");
const { pdfText } = await load("src/lib/server/pdf-text.mjs");

const PORT = 3124;
// Remote mode: https only, origin only.
const REMOTE = process.env.SMOKE_BASE_URL ? new URL(process.env.SMOKE_BASE_URL) : null;
if (REMOTE && REMOTE.protocol !== "https:") {
  console.error("SMOKE_BASE_URL must be an https URL.");
  process.exit(2);
}
const base = REMOTE ? REMOTE.origin : `http://localhost:${PORT}`;
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
    ROLEWRIGHT_RATE_LIMIT_KEY: "prod-smoke-rate-limit-key-not-for-real-use-0123456789",
    AUTH_URL: base,
    ROLEWRIGHT_DATA_DIR: dbDir,
    NEXT_TELEMETRY_DISABLED: "1",
    // Configured so the purge endpoint reaches its token check (no token is ever sent).
    ROLEWRIGHT_PURGE_AUDIENCE: base,
    ROLEWRIGHT_PURGE_SERVICE_ACCOUNT: "purge-smoke@example.iam.gserviceaccount.com",
  };
  for (const k of ["K_SERVICE", "ROLEWRIGHT_DEPLOYED", "ROLEWRIGHT_DEV_LOGIN", "ROLEWRIGHT_ALLOW_MOCK_LLM", "DATABASE_URL", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "AUTH_RESEND_KEY", "EMAIL_FROM", "CAREER_OPS_ROOT", "CAREER_OPS_DATA_DIR"]) {
    delete env[k];
  }
  return env;
}

const nextBin = path.join(appDir, "node_modules", "next", "dist", "bin", "next");

process.once("exit", () => {
  killTree(child);
  if (!REMOTE) restoreGenerated();
});
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.once(signal, () => process.exit(130));

async function stopServer() {
  if (!child) return;
  const exited = child.exitCode === null && child.signalCode === null ? new Promise((resolve) => child.once("exit", resolve)) : Promise.resolve();
  killTree(child);
  await Promise.race([exited, new Promise((r) => setTimeout(r, 15_000))]);
}

async function launchBrowser() {
  const envExe = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (envExe) return chromium.launch({ executablePath: envExe });
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
  if (REMOTE && Object.keys(h).some((k) => k.toLowerCase() === "x-llm-key")) throw new Error("remote mode never sends an x-llm-key header");
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

// ---------------------------------------------------------------------------
// Remote mode (SMOKE_BASE_URL): read-only checks of a deployed host. No build, no server, no database, no
// sign-in, no x-llm-key header. Everything it sends is a GET, or a POST that must be refused.

async function runRemote() {
  const csp = (res) => res.headers.get("content-security-policy") ?? "";
  const assertNonceCsp = (res, route) =>
    assert.match(csp(res), /script-src[^;]*'nonce-[A-Za-z0-9+/=_-]{16,}'/, `${route} CSP carries a script nonce: ${csp(res)}`);
  const assertHsts = (res, route) => assert.match(res.headers.get("strict-transport-security") ?? "", /max-age=\d+/, `${route} sends HSTS`);

  console.log(`Remote mode: ${base}`);
  try {
    await step("R1. / and /sign-in: 200, HSTS, a nonce CSP, no development sign-in form", async () => {
      for (const route of ["/", "/sign-in"]) {
        const res = await request(null, "GET", route);
        assert.equal(res.status, 200, `${route} answered ${res.status}`);
        assertHsts(res, route);
        assertNonceCsp(res, route);
        assert.ok(!String(res.data).includes('id="dev-email"'), `${route} has no development sign-in form`);
      }
    });

    await step("R2. /privacy: 200; the grievance contact follows ROLEWRIGHT_EXPECT_GRIEVANCE", async () => {
      const res = await request(null, "GET", "/privacy");
      assert.equal(res.status, 200);
      assertHsts(res, "/privacy");
      assertNonceCsp(res, "/privacy");
      if (process.env.ROLEWRIGHT_EXPECT_GRIEVANCE === "1") {
        assert.ok(!res.data.includes('data-testid="grievance-unset"'), "the grievance contact is configured (ROLEWRIGHT_EXPECT_GRIEVANCE=1)");
        const email = process.env.ROLEWRIGHT_GRIEVANCE_EMAIL ?? "";
        assert.ok(email && res.data.includes(`mailto:${email}`), "/privacy shows the grievance email");
      } else {
        assert.ok(res.data.includes('data-testid="grievance-unset"'), "with no grievance contact configured, /privacy says so");
      }
    });

    await step("R3. GET /api/health is 200 { ok: true }", async () => {
      const res = await request(null, "GET", "/api/health");
      assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 300));
      assert.deepEqual(res.data, { ok: true });
    });

    await step("R4. no cookie: GET /api/facts and GET /api/providers are 401; POST /api/internal/purge with no token is 401", async () => {
      assert.equal((await request(null, "GET", "/api/facts")).status, 401, "/api/facts");
      assert.equal((await request(null, "GET", "/api/providers")).status, 401, "/api/providers");
      const purge = await request(null, "POST", "/api/internal/purge");
      assert.equal(purge.status, 401, JSON.stringify(purge.data));
    });

    await step("R5. the development sign-in (POST /api/auth/callback/dev) is refused: no session cookie is set", async () => {
      const providers = await fetch(`${base}/api/auth/providers`, { signal: AbortSignal.timeout(30_000) });
      const listed = await providers.json().catch(() => ({}));
      assert.ok(!Object.keys(listed ?? {}).includes("dev") && !Object.values(listed ?? {}).some((p) => p?.id === "dev"), "/api/auth/providers lists the dev provider");
      const csrf = await fetch(`${base}/api/auth/csrf`, { signal: AbortSignal.timeout(30_000) });
      const { csrfToken } = await csrf.json();
      const csrfCookie = csrf.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
      const res = await fetch(`${base}/api/auth/callback/dev`, {
        method: "POST",
        headers: { cookie: csrfCookie, "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ csrfToken, email: "remote-smoke@example.invalid", callbackUrl: `${base}/app` }),
        redirect: "manual",
        signal: AbortSignal.timeout(30_000),
      });
      const cookies = res.headers.getSetCookie();
      assert.ok(!cookies.some((c) => c.includes("session-token") && !/max-age=0|expires=thu, 01 jan 1970/i.test(c)), "no session cookie was set");
      const where = res.headers.get("location") ?? "";
      assert.ok(!/^\/app(\/|$)/.test(new URL(where || base, base).pathname), `the dev sign-in did not lead into /app (status ${res.status}, location ${where})`);
    });

    const cookie = process.env.SMOKE_SESSION_COOKIE;
    const tailoringId = process.env.SMOKE_TAILORING_ID;
    if (cookie && tailoringId) {
      await step("R6. signed in (opt-in): time one GET of the tailoring (the gate-timing line for P1-7)", async () => {
        assert.ok(/^[\x21-\x7e]([\x20-\x7e]*[\x21-\x7e])?$/.test(cookie), "SMOKE_SESSION_COOKIE is not a valid cookie header value (expected name=value, one line)");
        assert.match(tailoringId, /^[A-Za-z0-9_-]+$/, "SMOKE_TAILORING_ID looks like an id");
        const started = performance.now();
        const res = await request(cookie, "GET", `/api/tailorings/${tailoringId}`);
        const ms = Math.round(performance.now() - started);
        console.log(`     gate timing: GET /api/tailorings/<id> took ${ms} ms (status ${res.status})`);
        assert.equal(res.status, 200, `the tailoring answered ${res.status}`);
      });
    }

    console.log("\nSkipped in remote mode:");
    console.log("  - build, start and the embedded database: nothing is started");
    console.log("  - steps 1 to 10, 12, 13: they seed a database, mint a session or write data");
    console.log("  - 11 (sign-in security headers beyond R1) and the Chromium CSP step: need a local server");
    if (!(cookie && tailoringId)) console.log("  - the gate-timing step: set SMOKE_SESSION_COOKIE and SMOKE_TAILORING_ID to run it");
  } catch {
    // Reported by step().
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  }
  const passed = steps.filter(([, ok]) => ok).length;
  console.log(`\n${failures ? "FAIL" : "PASS"}: ${passed} of ${steps.length} steps passed${failures ? "" : " (all)"}`);
  process.exit(failures ? 1 : 0);
}

if (REMOTE) await runRemote();

const state = {};

try {
  await step("0. preflight: port 3124 is free and no other next process runs in this app directory", () => assertCleanStart(appDir, PORT));
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

  await step("2b. a deployed host (K_SERVICE set) with no DATABASE_URL refuses to start: non-zero exit, nothing listening", async () => {
    assert.ok(await portIsFree(PORT), `port ${PORT} is free`);
    const env = { ...serverEnv(), K_SERVICE: "x" };
    let out = "";
    const proc = (child = spawn(process.execPath, [nextBin, "start", "-p", String(PORT)], { cwd: appDir, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true, detached: process.platform !== "win32" }));
    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.stderr.on("data", (d) => (out += d.toString()));
    const code = await new Promise((resolve) => {
      const timer = setTimeout(() => {
        killTree(proc);
        child = null;
        resolve("timeout");
      }, 90_000);
      proc.once("close", (c) => {
        clearTimeout(timer);
        resolve(c);
      });
    });
    assert.notEqual(code, "timeout", `the server kept running instead of exiting.\n${out.slice(-1500)}`);
    assert.ok(typeof code === "number" && code !== 0, `exit code is non-zero, got ${code}.\n${out.slice(-1500)}`);
    assert.match(out, /DATABASE_URL is not set/, "the refusal says DATABASE_URL is not set");
    child = null;
    assert.ok(await portIsFree(PORT), `nothing is listening on ${PORT}`);
  });

  await step("3. next start with NODE_ENV=production answers", async () => {
    child = spawn(process.execPath, [nextBin, "start", "-p", String(PORT)], { cwd: appDir, env: serverEnv(), stdio: ["ignore", "pipe", "pipe"], windowsHide: true, detached: process.platform !== "win32" });
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
    assert.equal(res.headers.get("strict-transport-security"), "max-age=63072000; includeSubDomains");
    // A new nonce on every request.
    const again = await request(null, "GET", "/sign-in");
    const nonce = (h) => /'nonce-([^']+)'/.exec(h.get("content-security-policy") ?? "")?.[1];
    assert.notEqual(nonce(res.headers), nonce(again.headers), "the nonce changes per request");
    // The page's own scripts carry that nonce.
    assert.ok(res.data.includes(`nonce="${nonce(res.headers)}"`), "inline and framework scripts in the HTML carry the nonce");
  });

  // ROLEWRIGHT_GRIEVANCE_* in the parent environment without ROLEWRIGHT_EXPECT_GRIEVANCE=1 fails this step:
  // the server inherits them, so /privacy shows the contact and the "grievance-unset" assertion below fails.
  await step("11b. signed-out /privacy is 200 with a nonce CSP; / and /sign-in link to it; purge without a token is 401", async () => {
    const res = await request(null, "GET", "/privacy");
    assert.equal(res.status, 200);
    const csp = res.headers.get("content-security-policy") ?? "";
    assert.match(csp, /script-src[^;]*'nonce-[A-Za-z0-9+/=_-]{16,}'/, `/privacy CSP carries a nonce: ${csp}`);
    assert.equal(res.headers.get("strict-transport-security"), "max-age=63072000; includeSubDomains");
    const privacyNonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    assert.ok(res.data.includes(`nonce="${privacyNonce}"`), "the /privacy HTML carries the nonce from its CSP");
    if (process.env.ROLEWRIGHT_EXPECT_GRIEVANCE === "1") {
      assert.ok(!res.data.includes('data-testid="grievance-unset"'), "the grievance contact is configured (ROLEWRIGHT_EXPECT_GRIEVANCE=1)");
      const email = process.env.ROLEWRIGHT_GRIEVANCE_EMAIL ?? "";
      assert.ok(email && res.data.includes(`mailto:${email}`), "/privacy shows the grievance email");
    } else {
      assert.ok(res.data.includes('data-testid="grievance-unset"'), "with no grievance contact configured, /privacy says so");
    }
    for (const route of ["/", "/sign-in"]) {
      const page = await request(null, "GET", route);
      assert.equal(page.status, 200, route);
      assert.ok(page.data.includes('href="/privacy"'), `${route} links to /privacy`);
    }
    const purge = await request(null, "POST", "/api/internal/purge");
    assert.equal(purge.status, 401, JSON.stringify(purge.data));
    assert.equal(purge.data?.error?.code, "unauthorized");
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
    for (const route of ["/sign-in", "/sign-in/check-email", "/", "/privacy"]) {
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
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Privacy", exact: true }).click();
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
