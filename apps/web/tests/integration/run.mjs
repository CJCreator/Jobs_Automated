// End-to-end flow over real HTTP against `next dev`, with the development
// sign-in, the mock AI provider and a throwaway embedded database.
//
//   npm run test:flow
//
// Exits non-zero on the first failing step. Everything the server prints is
// captured so the key-hygiene step can prove no key ever reaches a log.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assertCleanStart, killTree } from "../e2e/helpers.mjs";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
process.env.CAREER_OPS_CODE_ROOT ||= path.resolve(appDir, "../../packages/engine");

const load = (rel) => import(pathToFileURL(path.join(appDir, rel)).href);
const { resumeHtml } = await load("src/lib/resume-html.mjs");
const { renderPdf, closeBrowser } = await load("src/lib/server/pdf.mjs");
const { pdfText } = await load("src/lib/server/pdf-text.mjs");
const { MOCK_RESUME, MOCK_KEY } = await load("src/lib/llm/mock.mjs");
const { emptyFacts } = await load("src/lib/facts.mjs");
const { createDb } = await load("src/lib/db/index.mjs");
const { NOTICE_VERSION } = await load("src/lib/notice.mjs");

const SENTINEL = "sentinel-KEY-9f3b2c7d1e";
const JD = [
  "Zeta Fintech is hiring a Finance Analyst in Bengaluru to own month-end close and management reporting.",
  "You will build dashboards in Tableau and Power BI, write SQL against our ledger, and work with a team of analysts.",
  "We want 3 or more years of experience in finance operations, strong Excel, and clear written communication.",
  "Compensation: 12 to 18 LPA CTC. Notice period up to 60 days is fine.",
].join(" ");

// ---------------------------------------------------------------------------
// Small helpers

let serverOutput = "";
let base = "";

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }
  store(res) {
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(";");
      const eq = pair.indexOf("=");
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      const expired =
        value === "" ||
        attrs.some((a) => /^\s*max-age=0\s*$/i.test(a)) ||
        attrs.some((a) => /^\s*expires=/i.test(a) && Date.parse(a.split("=").slice(1).join("=")) < Date.now());
      if (expired) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }
  header() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  copy() {
    const jar = new CookieJar();
    jar.cookies = new Map(this.cookies);
    return jar;
  }
  hasSession() {
    return [...this.cookies.keys()].some((k) => k.includes("authjs.session-token"));
  }
}

async function request(jar, method, route, { json, form, headers = {} } = {}) {
  const h = { ...headers };
  if (jar && jar.cookies.size) h.cookie = jar.header();
  let body;
  if (json !== undefined) {
    h["content-type"] = "application/json";
    body = JSON.stringify(json);
  } else if (form !== undefined) {
    body = form;
  }
  const res = await fetch(base + route, { method, headers: h, body, redirect: "manual", signal: AbortSignal.timeout(240_000) });
  jar?.store(res);
  const type = res.headers.get("content-type") ?? "";
  let data;
  if (type.includes("application/json")) data = await res.json();
  else if (type.includes("application/pdf")) data = Buffer.from(await res.arrayBuffer());
  else data = await res.text();
  return { status: res.status, headers: res.headers, data };
}

const squash = (s) => s.replace(/\s+/g, "");

function assertError(res, status, code) {
  assert.equal(res.status, status, `expected ${status}, got ${res.status}: ${JSON.stringify(res.data).slice(0, 300)}`);
  assert.equal(typeof res.data?.error?.message, "string", "error shape has a message");
  assert.ok(res.data.error.message.length > 0);
  if (code) assert.equal(res.data.error.code, code);
  assert.equal(res.headers.get("cache-control"), "no-store");
}

function confirmAll(value) {
  if (Array.isArray(value)) return value.map(confirmAll);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = confirmAll(v);
    if ("confirmed" in out) out.confirmed = true;
    return out;
  }
  return value;
}

function everyItemUnconfirmed(facts) {
  const items = [facts.contact, facts.summary, ...facts.experience, ...facts.experience.flatMap((e) => e.bullets), ...facts.education, ...facts.skills];
  return items.length > 5 && items.every((i) => i.confirmed === false);
}

function startServer(port, dataDir) {
  const env = {
    ...process.env,
    ROLEWRIGHT_DEV_LOGIN: "1",
    ROLEWRIGHT_ALLOW_MOCK_LLM: "1",
    ROLEWRIGHT_DATA_DIR: dataDir,
    AUTH_SECRET: "flow-test-secret-not-for-real-use-0123456789abcdef",
    AUTH_URL: `http://localhost:${port}`,
    // Its own dist directory, so a `next dev` already running here is not disturbed.
    BUILD_DIST: ".next-flow",
    NEXT_TELEMETRY_DISABLED: "1",
  };
  for (const k of ["NODE_ENV", "DATABASE_URL", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "AUTH_RESEND_KEY", "EMAIL_FROM", "CAREER_OPS_ROOT", "CAREER_OPS_DATA_DIR"]) {
    delete env[k];
  }
  const nextBin = path.join(appDir, "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [nextBin, "dev", "-p", String(port)], { cwd: appDir, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true, detached: process.platform !== "win32" });
  child.stdout.on("data", (d) => (serverOutput += d.toString()));
  child.stderr.on("data", (d) => (serverOutput += d.toString()));
  return child;
}

async function stopServer(child) {
  if (!child) return;
  const exited = child.exitCode === null ? new Promise((resolve) => child.once("exit", resolve)) : Promise.resolve();
  // The whole process group, as next-server is a child of the next CLI.
  killTree(child);
  await Promise.race([exited, new Promise((r) => setTimeout(r, 15_000))]);
}

async function waitForServer(child) {
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`next dev exited early (code ${child.exitCode}).\n${serverOutput.slice(-3000)}`);
    try {
      const res = await fetch(`${base}/api/auth/csrf`, { signal: AbortSignal.timeout(120_000) });
      if (res.status === 200) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`next dev did not answer in time.\n${serverOutput.slice(-3000)}`);
}

// A copied session cookie keeps working until it expires, so the lifetime is
// part of the security story: seven days, not Auth.js's default thirty.
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
function assertSevenDaySession(setCookie) {
  assert.ok(setCookie, "the sign-in response sets the session cookie");
  const expires = /;\s*expires=([^;]+)/i.exec(setCookie)?.[1];
  assert.ok(expires, "the session cookie has an expiry");
  const left = Date.parse(expires) - Date.now();
  assert.ok(Math.abs(left - SEVEN_DAYS_MS) < 10 * 60 * 1000, `session lifetime is about 7 days, got ${(left / 3_600_000).toFixed(1)} hours`);
}

async function signIn(email) {
  const jar = new CookieJar();
  const csrf = await request(jar, "GET", "/api/auth/csrf");
  assert.equal(csrf.status, 200);
  assert.equal(typeof csrf.data.csrfToken, "string");
  const res = await request(jar, "POST", "/api/auth/callback/dev", {
    form: new URLSearchParams({ csrfToken: csrf.data.csrfToken, email, callbackUrl: `${base}/app` }),
  });
  assert.ok(res.status === 302 || res.status === 303, `sign-in answered ${res.status}`);
  assert.ok(jar.hasSession(), "a session cookie was set");
  assertSevenDaySession(res.headers.getSetCookie().find((c) => c.includes("authjs.session-token")));
  // A failed sign-in also redirects, so prove the session with a data route.
  const facts = await request(jar, "GET", "/api/facts");
  assert.equal(facts.status, 200, "the new session reaches a data route");
  return jar;
}

const ai = (key = MOCK_KEY) => ({ "x-llm-provider": "mock", "x-llm-key": key, "x-llm-model": "mock-1" });

function pdfForm(bytes, name = "asha-rao-resume.pdf", type = "application/pdf") {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type }), name);
  return form;
}

async function exportText(jar, id) {
  const res = await request(jar, "POST", `/api/tailorings/${id}/export`);
  assert.equal(res.status, 200, `export answered ${res.status}: ${JSON.stringify(res.data).slice(0, 400)}`);
  assert.equal(res.headers.get("content-type"), "application/pdf");
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.match(res.headers.get("content-disposition") ?? "", /^attachment; filename="[A-Za-z0-9-]+\.pdf"$/);
  assert.equal(res.data.subarray(0, 5).toString("latin1"), "%PDF-");
  const { text } = await pdfText(res.data);
  return { text: squash(text), disposition: res.headers.get("content-disposition") };
}

// ---------------------------------------------------------------------------
// The flow

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

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "rolewright-flow-"));
const dbDir = path.join(dataDir, "pglite");
let child = null;
const state = {};

// If the run is interrupted, still stop the server.
function killServerSync() {
  killTree(child);
}
process.once("exit", killServerSync);
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => process.exit(130));
}

try {
  await step("1. next dev starts with the dev sign-in, the mock AI and a temp database", async () => {
    const port = Number(process.env.FLOW_PORT) || 3111;
    await assertCleanStart(appDir, port);
    base = `http://localhost:${port}`;
    child = startServer(port, dbDir);
    await waitForServer(child);
  });

  await step("2. two users sign in through the real Auth.js endpoints", async () => {
    state.A = await signIn("asha.flow@example.com");
    state.B = await signIn("bala.flow@example.com");
    const sa = await request(state.A, "GET", "/api/auth/session");
    const sb = await request(state.B, "GET", "/api/auth/session");
    assert.ok(Math.abs(Date.parse(sa.data.expires) - Date.now() - SEVEN_DAYS_MS) < 10 * 60 * 1000, `session expires ${sa.data.expires}`);
    assert.match(sa.data.user.id, /^[0-9a-f-]{36}$/);
    assert.notEqual(sa.data.user.id, sb.data.user.id);
    state.aId = sa.data.user.id;
    state.bId = sb.data.user.id;
  });

  await step("3. key check: right key ok, wrong key ok:false, no session 401", async () => {
    const good = await request(state.A, "POST", "/api/keys/verify", { headers: ai() });
    assert.equal(good.status, 200);
    assert.equal(good.data.ok, true);
    assert.deepEqual(good.data.models.map((m) => m.id), ["mock-1"]);
    assert.equal(good.data.recommended, "mock-1");
    // The accepted key is the success path: it must not come back either.
    assert.ok(!JSON.stringify(good.data).includes(MOCK_KEY), "the accepted key is not echoed in the response");
    const bad = await request(state.A, "POST", "/api/keys/verify", { headers: ai("mock-wrong-key-123") });
    assert.equal(bad.status, 200);
    assert.equal(bad.data.ok, false);
    assert.equal(bad.data.code, "invalid_key");
    const unknown = await request(state.A, "POST", "/api/keys/verify", { headers: { ...ai(), "x-llm-provider": "acme-ai" } });
    assert.equal(unknown.data.ok, false);
    assert.equal(unknown.data.code, "not_allowed");
    // The model id is stored with a tailoring, so a junk one is refused for every provider, the mock included.
    const junkModel = await request(state.A, "POST", "/api/keys/verify", { headers: { ...ai(), "x-llm-model": `m${"x".repeat(300)}` } });
    assert.equal(junkModel.data.ok, false);
    assert.equal(junkModel.data.code, "model_not_found");
    assertError(
      await request(state.A, "POST", "/api/tailorings", { json: { title: "X", company: "Y", jdText: JD }, headers: { ...ai(), "x-llm-model": "../etc" } }),
      400,
      "model_not_found",
    );
    assertError(await request(null, "POST", "/api/keys/verify", { headers: ai() }), 401, "unauthorized");
  });

  await step("4. a real text PDF uploads and every proposed fact comes back unconfirmed; a fake PDF is refused", async () => {
    const fixture = {
      contact: { ...MOCK_RESUME.contact },
      summary: MOCK_RESUME.summary,
      experience: MOCK_RESUME.experience.map((e) => ({ company: e.company, title: e.title, location: e.location, dates: `${e.start} – ${e.end}`, bullets: e.bullets })),
      education: ["B.Com, Christ University, 2019"],
      skills: MOCK_RESUME.skills,
    };
    state.fixturePdf = await renderPdf(resumeHtml(fixture));
    assert.ok((await pdfText(state.fixturePdf)).text.length >= 200, "the fixture has enough text");

    // No consent yet: the upload is refused before any AI call.
    assertError(await request(state.A, "POST", "/api/resume", { form: pdfForm(state.fixturePdf), headers: ai() }), 403, "consent_required");
    assert.deepEqual((await request(state.A, "GET", "/api/consent")).data, { noticeVersion: NOTICE_VERSION, accepted: false });
    // Consent comes before the body is read or checked: a bad file or a short job description gets 403, not 415 or 400.
    assertError(
      await request(state.A, "POST", "/api/resume", { form: pdfForm(new TextEncoder().encode("not a pdf"), "resume.pdf"), headers: ai() }),
      403,
      "consent_required",
    );
    assertError(
      await request(state.A, "POST", "/api/tailorings", { json: { title: "X", company: "Y", jdText: "too short" }, headers: ai() }),
      403,
      "consent_required",
    );
    assertError(await request(state.A, "POST", "/api/consent", { json: { noticeVersion: "1999-01-01.0" } }), 400, "stale_notice");
    assertError(await request(state.A, "POST", "/api/consent", { json: {} }), 400, "stale_notice");
    assertError(await request(null, "POST", "/api/consent", { json: { noticeVersion: NOTICE_VERSION } }), 401, "unauthorized");
    const agreed = await request(state.A, "POST", "/api/consent", { json: { noticeVersion: NOTICE_VERSION } });
    assert.equal(agreed.status, 200);
    assert.deepEqual(agreed.data, { accepted: true });
    assert.equal((await request(state.A, "POST", "/api/consent", { json: { noticeVersion: NOTICE_VERSION } })).status, 200, "agreeing twice is fine");
    assert.deepEqual((await request(state.A, "GET", "/api/consent")).data, { noticeVersion: NOTICE_VERSION, accepted: true });

    const up = await request(state.A, "POST", "/api/resume", { form: pdfForm(state.fixturePdf), headers: ai() });
    assert.equal(up.status, 200, JSON.stringify(up.data).slice(0, 300));
    assert.ok(everyItemUnconfirmed(up.data.facts), "every proposed item is unconfirmed");
    assert.equal(up.data.counts.confirmed, 0);
    assert.ok(up.data.counts.total >= 8);
    assert.equal(up.data.facts.experience[0].company, "Infosys");
    state.proposed = up.data.facts;
    // The faithful PDF contains everything the mock returns, so nothing is flagged.
    const flagged = [up.data.facts.summary, ...up.data.facts.experience, ...up.data.facts.experience.flatMap((e) => e.bullets), ...up.data.facts.education, ...up.data.facts.skills]
      .filter((i) => i.source === "model");
    assert.equal(flagged.length, 0, "no item of the faithful PDF is labelled model");
    state.flaggedCount = flagged.length;

    const fake = await request(state.A, "POST", "/api/resume", {
      form: pdfForm(new TextEncoder().encode("This is a plain text file with a .pdf name, not a real PDF document."), "resume.pdf"),
      headers: ai(),
    });
    assertError(fake, 415, "not_pdf");
    const noKey = await request(state.A, "POST", "/api/resume", { form: pdfForm(state.fixturePdf) });
    assertError(noKey, 400, "not_allowed");
  });

  await step("4b. an item the upload lacks is labelled model; a re-upload keeps confirmations and ids", async () => {
    const allItems = (f) => [f.summary, ...f.experience, ...f.experience.flatMap((e) => e.bullets), ...f.education, ...f.skills];
    const jar = await signIn("cora.flow@example.com");
    assert.equal((await request(jar, "POST", "/api/consent", { json: { noticeVersion: NOTICE_VERSION } })).status, 200);
    const first = await request(jar, "POST", "/api/resume", { form: pdfForm(state.fixturePdf), headers: ai() });
    assert.equal(first.status, 200, JSON.stringify(first.data).slice(0, 300));
    assert.ok(allItems(first.data.facts).every((i) => i.source !== "model"), "the first upload has no model items");

    const put = await request(jar, "PUT", "/api/facts", { json: { facts: confirmAll(first.data.facts) } });
    assert.equal(put.status, 200);
    const again = await request(jar, "POST", "/api/resume", { form: pdfForm(state.fixturePdf), headers: ai() });
    assert.equal(again.status, 200);
    assert.equal(again.data.counts.confirmed, put.data.counts.confirmed, "every confirmation survives a re-upload");
    assert.deepEqual(again.data.facts.experience.map((e) => [e.id, e.confirmed]), put.data.facts.experience.map((e) => [e.id, e.confirmed]));
    assert.deepEqual(
      again.data.facts.experience[0].bullets.map((b) => [b.id, b.confirmed]),
      put.data.facts.experience[0].bullets.map((b) => [b.id, b.confirmed]),
      "bullet ids and confirmations are unchanged",
    );

    // A second PDF that lacks one skill the mock still returns.
    const lacking = await renderPdf(resumeHtml({
      contact: { ...MOCK_RESUME.contact },
      summary: MOCK_RESUME.summary,
      experience: MOCK_RESUME.experience.map((e) => ({ company: e.company, title: e.title, location: e.location, dates: `${e.start} – ${e.end}`, bullets: e.bullets })),
      education: ["B.Com, Christ University, 2019"],
      skills: MOCK_RESUME.skills.filter((k) => k !== "Excel"),
    }));
    const second = await request(jar, "POST", "/api/resume", { form: pdfForm(lacking), headers: ai() });
    assert.equal(second.status, 200);
    const excel = second.data.facts.skills.find((k) => k.name === "Excel");
    assert.ok(excel, "the mock still returns Excel");
    assert.equal(excel.source, "model");
    assert.equal(excel.confirmed, false);
    assert.ok(second.data.facts.skills.filter((k) => k.name !== "Excel").every((k) => k.source === "upload" && k.confirmed), "the skills the PDF has keep their confirmation");
    assert.deepEqual(second.data.facts.experience[0].bullets.map((b) => b.id), put.data.facts.experience[0].bullets.map((b) => b.id));

    // The page cannot relabel the model item by sending it back as an upload.
    const relabel = JSON.parse(JSON.stringify(second.data.facts));
    relabel.skills.find((k) => k.name === "Excel").source = "upload";
    const saved = await request(jar, "PUT", "/api/facts", { json: { facts: relabel } });
    assert.equal(saved.status, 200);
    assert.equal(saved.data.facts.skills.find((k) => k.name === "Excel").source, "model");
  });

  await step("5. tailoring needs confirmed facts; then four suggestions, three of them blocked", async () => {
    const early = await request(state.A, "POST", "/api/tailorings", { json: { title: "Finance Analyst", company: "Zeta Fintech", jdText: JD }, headers: ai() });
    assertError(early, 409, "nothing_confirmed");

    const put = await request(state.A, "PUT", "/api/facts", { json: { facts: confirmAll(state.proposed) } });
    assert.equal(put.status, 200);
    assert.equal(put.data.counts.confirmed, put.data.counts.total);
    state.facts = put.data.facts;

    const made = await request(state.A, "POST", "/api/tailorings", { json: { title: "Finance Analyst", company: "Zeta Fintech", jdText: JD }, headers: ai() });
    assert.equal(made.status, 200, JSON.stringify(made.data).slice(0, 300));
    state.tid = made.data.id;

    const got = await request(state.A, "GET", `/api/tailorings/${state.tid}`);
    assert.equal(got.status, 200);
    const list = got.data.tailoring.suggestions;
    assert.equal(list.length, 4);
    const find = (needle) => list.find((s) => s.finalText.includes(needle));
    state.s = { faithful: find("Cut month-end close"), team: find("team of 12"), tableau: find("Tableau"), crore: find("₹5 crore") };
    for (const [k, v] of Object.entries(state.s)) assert.ok(v, `found the ${k} suggestion`);
    assert.notEqual(state.s.faithful.check.verdict, "block");
    assert.equal(state.s.team.check.verdict, "block");
    assert.equal(state.s.tableau.check.verdict, "block");
    assert.equal(state.s.crore.check.verdict, "block");
    assert.ok(list.every((s) => s.decision === "pending" && s.check.engineRan === true));
    const items = await request(state.A, "GET", "/api/tailorings");
    assert.equal(items.data.items.length, 1);
    assert.equal(items.data.items[0].pending, 4);
  });

  await step("6. a blocked suggestion cannot be accepted; the faithful one exports, nothing invented in the PDF", async () => {
    const patch = (sid, body) => request(state.A, "PATCH", `/api/tailorings/${state.tid}/suggestions/${sid}`, { json: body });
    assertError(await patch(state.s.team.id, { action: "accept" }), 409, "blocked");
    const ok = await patch(state.s.faithful.id, { action: "accept" });
    assert.equal(ok.status, 200);
    assert.equal(ok.data.tailoring.suggestions.find((s) => s.id === state.s.faithful.id).decision, "accepted");

    const { text, disposition } = await exportText(state.A, state.tid);
    assert.equal(disposition, 'attachment; filename="Asha-Rao-Zeta-Fintech.pdf"');
    assert.ok(text.includes(squash("Cut month-end close time by 30% with SQL and Power BI reporting")), "accepted wording is in the PDF");
    assert.ok(!text.includes(squash("Reduced month-end close time by 30% using SQL and Power BI")), "the replaced line is gone");
    for (const banned of ["12 analysts", "Tableau", "Google", "5 crore"]) {
      assert.ok(!text.includes(squash(banned)), `"${banned}" is not in the PDF`);
    }
    assert.ok(text.includes(squash("Managed a team of 4 analysts")), "untouched lines stay as confirmed");
  });

  await step("7. attest and can't-confirm rules, then an honest edit exports", async () => {
    const patch = (body) => request(state.A, "PATCH", `/api/tailorings/${state.tid}/suggestions/${state.s.team.id}`, { json: body });
    assertError(await patch({ action: "attest", value: "Tableau" }), 400, "not_an_issue");
    const cc = await patch({ action: "cannot_confirm", value: "12" });
    assert.equal(cc.status, 200);
    const facts = await request(state.A, "GET", "/api/facts");
    assert.deepEqual(facts.data.facts.cannotConfirm, ["12"]);
    assertError(await patch({ action: "attest", value: "12" }), 409, "cannot_confirm");

    const edited = await patch({ action: "edit", text: "Managed and mentored a team of 4 analysts" });
    assert.equal(edited.status, 200);
    const team = edited.data.tailoring.suggestions.find((s) => s.id === state.s.team.id);
    assert.equal(team.finalText, "Managed and mentored a team of 4 analysts");
    assert.notEqual(team.check.verdict, "block");
    assert.equal(team.decision, "pending");
    const accepted = await patch({ action: "accept" });
    assert.equal(accepted.status, 200);

    const { text } = await exportText(state.A, state.tid);
    assert.ok(text.includes(squash("Managed and mentored a team of 4 analysts")));
    assert.ok(text.includes(squash("Cut month-end close time by 30% with SQL and Power BI reporting")));
    assert.ok(!text.includes(squash("12 analysts")));
  });

  await step("7b. a stale facts page cannot undo can't-confirm, an explicit removal can, and two actions at once both land", async () => {
    // A facts page opened before the cannot_confirm in step 7 sends a list without "12".
    const current = (await request(state.A, "GET", "/api/facts")).data.facts;
    assert.deepEqual(current.cannotConfirm, ["12"]);
    const stale = await request(state.A, "PUT", "/api/facts", { json: { facts: { ...current, cannotConfirm: [] } } });
    assert.equal(stale.status, 200);
    assert.deepEqual(stale.data.facts.cannotConfirm, ["12"], "the stored list is kept");
    assert.deepEqual((await request(state.A, "GET", "/api/facts")).data.facts.cannotConfirm, ["12"]);
    // Nor can a page add to it: the list only grows through review actions.
    const planted = await request(state.A, "PUT", "/api/facts", { json: { facts: { ...current, cannotConfirm: ["12", "Power BI"] } } });
    assert.deepEqual(planted.data.facts.cannotConfirm, ["12"]);

    assertError(await request(state.A, "PUT", "/api/facts", { json: { facts: current, removeCannotConfirm: "12" } }), 400, "invalid_removals");
    assertError(await request(state.A, "PUT", "/api/facts", { json: { facts: current, removeCannotConfirm: [12] } }), 400, "invalid_removals");
    const removed = await request(state.A, "PUT", "/api/facts", { json: { facts: current, removeCannotConfirm: [" 12 ", "never listed"] } });
    assert.equal(removed.status, 200);
    assert.deepEqual(removed.data.facts.cannotConfirm, []);
    assert.deepEqual((await request(state.A, "GET", "/api/facts")).data.facts.cannotConfirm, []);

    // Two review actions sent at the same moment: neither overwrites the other.
    const patch = (sid, body) => request(state.A, "PATCH", `/api/tailorings/${state.tid}/suggestions/${sid}`, { json: body });
    const [r1, r2] = await Promise.all([patch(state.s.crore.id, { action: "reject" }), patch(state.s.tableau.id, { action: "reject" })]);
    assert.equal(r1.status, 200);
    assert.equal(r2.status, 200);
    const after = (await request(state.A, "GET", `/api/tailorings/${state.tid}`)).data.tailoring.suggestions;
    assert.equal(after.find((s) => s.id === state.s.crore.id).decision, "rejected");
    assert.equal(after.find((s) => s.id === state.s.tableau.id).decision, "rejected");
  });

  await step("8. tampering: no body can force a decision or verdict, and a stale stored pass does not export", async () => {
    const patch = (sid, body) => request(state.A, "PATCH", `/api/tailorings/${state.tid}/suggestions/${sid}`, { json: body });
    const forged = { verdict: "pass", issues: [], advisory: [], engineRan: true };
    assertError(await patch(state.s.tableau.id, { action: "accept", decision: "accepted", check: forged }), 409, "blocked");
    const rejected = await patch(state.s.tableau.id, { action: "reject", decision: "accepted", check: forged });
    assert.equal(rejected.status, 200);
    const t = rejected.data.tailoring.suggestions.find((s) => s.id === state.s.tableau.id);
    assert.equal(t.decision, "rejected");
    assert.equal(t.check.verdict, "block");
    assertError(await patch(state.s.crore.id, { decision: "accepted", check: forged }), 400, "invalid_action");

    // Drop "30%" from the confirmed bullet, and try to smuggle suggestion state in alongside.
    const current = (await request(state.A, "GET", "/api/facts")).data.facts;
    const edited = structuredClone(current);
    const bullet = edited.experience[0].bullets.find((b) => b.text.startsWith("Reduced month-end close"));
    bullet.text = "Reduced month-end close time using SQL and Power BI";
    const put = await request(state.A, "PUT", "/api/facts", {
      json: { facts: { ...edited, suggestions: [{ id: state.s.faithful.id, decision: "accepted", check: forged }] }, suggestions: [{ id: state.s.faithful.id, check: forged }], tailoring: { suggestions: [] } },
    });
    assert.equal(put.status, 200);
    assert.equal("suggestions" in put.data.facts, false, "unknown keys are dropped");

    const got = await request(state.A, "GET", `/api/tailorings/${state.tid}`);
    const faithful = got.data.tailoring.suggestions.find((s) => s.id === state.s.faithful.id);
    assert.equal(faithful.decision, "accepted");
    assert.equal(faithful.check.verdict, "block", "the shown check is recomputed against the new facts");

    const refused = await request(state.A, "POST", `/api/tailorings/${state.tid}/export`);
    assertError(refused, 409, "blocked");
    assert.ok(Array.isArray(refused.data.issues) && refused.data.issues.length > 0);
    assert.ok(refused.data.issues.some((i) => i.sid === state.s.faithful.id && /30/.test(i.value)), JSON.stringify(refused.data.issues));
  });

  await step("9. isolation: B sees none of A's data", async () => {
    const list = await request(state.B, "GET", "/api/tailorings");
    assert.equal(list.status, 200);
    assert.deepEqual(list.data.items, []);
    assertError(await request(state.B, "GET", `/api/tailorings/${state.tid}`), 404, "not_found");
    assertError(await request(state.B, "PATCH", `/api/tailorings/${state.tid}/suggestions/${state.s.faithful.id}`, { json: { action: "reject" } }), 404, "not_found");
    assertError(await request(state.B, "POST", `/api/tailorings/${state.tid}/export`), 404, "not_found");
    const facts = await request(state.B, "GET", "/api/facts");
    assert.equal(facts.status, 200);
    assert.deepEqual(facts.data, { facts: emptyFacts(), counts: { confirmed: 0, total: 0 } });
    // A's tailoring is untouched by B's attempt.
    const mine = await request(state.A, "GET", `/api/tailorings/${state.tid}`);
    assert.equal(mine.data.tailoring.suggestions.find((s) => s.id === state.s.faithful.id).decision, "accepted");
  });

  await step("10. cross-site: a state change from another origin is refused, same origin is allowed", async () => {
    const evil = { origin: "https://evil.example" };
    assertError(await request(state.A, "POST", "/api/tailorings", { json: { title: "X", company: "Y", jdText: JD }, headers: { ...ai(), ...evil } }), 403, "cross_site");
    assertError(await request(state.A, "DELETE", "/api/account", { headers: evil }), 403, "cross_site");
    assertError(await request(state.A, "PATCH", `/api/tailorings/${state.tid}/suggestions/${state.s.crore.id}`, { json: { action: "reject" }, headers: { "sec-fetch-site": "cross-site" } }), 403, "cross_site");
    const csrf = await request(null, "GET", "/api/auth/csrf");
    const forgedSignIn = await request(new CookieJar(), "POST", "/api/auth/callback/dev", {
      form: new URLSearchParams({ csrfToken: csrf.data.csrfToken, email: "mallory@example.com" }),
      headers: evil,
    });
    assertError(forgedSignIn, 403, "cross_site");
    const current = (await request(state.A, "GET", "/api/facts")).data.facts;
    const same = await request(state.A, "PUT", "/api/facts", { json: { facts: current }, headers: { origin: base } });
    assert.equal(same.status, 200);
    // A's account survived the forged delete.
    assert.equal((await request(state.A, "GET", "/api/facts")).status, 200);
  });

  await step("13. gate cost: an over-cap fact base is refused at save, and the tailoring routes are rate limited per user", async () => {
    // Too much confirmed text: refused at save, and what was stored is unchanged.
    const before = (await request(state.A, "GET", "/api/facts")).data.facts;
    const huge = JSON.parse(JSON.stringify(before));
    huge.experience = Array.from({ length: 30 }, (_, j) => ({
      id: `big-exp-${j}-aaaa`, company: `Company ${j}`, title: "Analyst", confirmed: true,
      bullets: Array.from({ length: 25 }, (_, k) => ({ id: `big-b-${j}-${k}-aaaa`, text: `Reduced close time ${"x ".repeat(299)}`, confirmed: true })),
    }));
    const refused = await request(state.A, "PUT", "/api/facts", { json: { facts: huge } });
    assertError(refused, 400, "facts_too_large");
    assert.match(refused.data.error.message, /too long/);
    assert.deepEqual((await request(state.A, "GET", "/api/facts")).data.facts, before, "nothing was saved");

    // A fresh user so the other steps' counts are not touched. The bucket is shared by the tailoring
    // GET, the suggestions PATCH and the export, so a plain GET of a missing tailoring spends it.
    const jar = await signIn("carol@example.com");
    const missing = "/api/tailorings/00000000-0000-4000-8000-000000000000";
    let limited = null;
    for (let i = 0; i < 60 && !limited; i++) {
      const res = await request(jar, "GET", missing);
      if (res.status === 429) limited = res;
      else assertError(res, 404, "not_found");
    }
    assert.ok(limited, "the limit answered 429 within 60 requests");
    assertError(limited, 429, "too_many_requests");
    assert.ok(Number(limited.headers.get("retry-after")) >= 1, "Retry-After is set");
    // Another user is not affected.
    assertError(await request(state.B, "GET", missing), 404, "not_found");
    // The same bucket covers the other two routes.
    assertError(await request(jar, "POST", `${missing}/export`), 429, "too_many_requests");
    assertError(await request(jar, "PATCH", `${missing}/suggestions/x`, { json: { action: "reject" } }), 429, "too_many_requests");
  });

  await step("11. key hygiene (HTTP half): a distinctive key is used on failing and writing requests", async () => {
    const verify = await request(state.B, "POST", "/api/keys/verify", { headers: ai(SENTINEL) });
    assert.equal(verify.data.ok, false);
    assert.ok(!JSON.stringify(verify.data).includes(SENTINEL));
    const badProvider = await request(state.B, "POST", "/api/keys/verify", { headers: { ...ai(SENTINEL), "x-llm-provider": "nope" } });
    assert.equal(badProvider.data.ok, false);
    // The mock provider's completions ignore the key, so these write rows while carrying it.
    // B has not consented yet: neither route runs, and the key never leaks in the refusal.
    const noConsentUp = await request(state.B, "POST", "/api/resume", { form: pdfForm(state.fixturePdf, "bala.pdf"), headers: ai(SENTINEL) });
    assertError(noConsentUp, 403, "consent_required");
    assert.ok(!JSON.stringify(noConsentUp.data).includes(SENTINEL));
    assertError(
      await request(state.B, "POST", "/api/tailorings", { json: { title: "Analyst", company: "Acme", jdText: JD }, headers: ai(SENTINEL) }),
      403,
      "consent_required",
    );
    assert.equal((await request(state.B, "POST", "/api/consent", { json: { noticeVersion: NOTICE_VERSION } })).status, 200);
    const up = await request(state.B, "POST", "/api/resume", { form: pdfForm(state.fixturePdf, "bala.pdf"), headers: ai(SENTINEL) });
    assert.equal(up.status, 200);
    const put = await request(state.B, "PUT", "/api/facts", { json: { facts: confirmAll(up.data.facts) } });
    assert.equal(put.status, 200);
    const made = await request(state.B, "POST", "/api/tailorings", { json: { title: "Analyst", company: "Acme", jdText: JD }, headers: ai(SENTINEL) });
    assert.equal(made.status, 200);
    assert.ok(!JSON.stringify((await request(state.B, "GET", `/api/tailorings/${made.data.id}`)).data).includes(SENTINEL));
    const failing = await request(state.B, "POST", "/api/tailorings", { json: { title: "Analyst", company: "Acme", jdText: "too short" }, headers: ai(SENTINEL) });
    assertError(failing, 400, "invalid_jd");
    assert.ok(!JSON.stringify(failing.data).includes(SENTINEL));
    assert.ok(!serverOutput.includes(SENTINEL), "not in the server output so far");
  });

  await step("12. account deletion ends the session for data routes", async () => {
    const oldCookies = state.A.copy();
    const del = await request(state.A, "DELETE", "/api/account");
    assert.equal(del.status, 200);
    assert.deepEqual(del.data, { ok: true });
    assertError(await request(oldCookies, "GET", "/api/facts"), 401, "unauthorized");
    assertError(await request(oldCookies, "GET", "/api/tailorings"), 401, "unauthorized");
    assertError(await request(oldCookies, "GET", `/api/tailorings/${state.tid}`), 401, "unauthorized");
    assertError(await request(state.A, "GET", "/api/facts"), 401, "unauthorized");
    // B is unaffected.
    assert.equal((await request(state.B, "GET", "/api/tailorings")).data.items.length, 1);
  });

  await stopServer(child);
  child = null;

  await step("11. key hygiene (storage half): the key is in no log line and no database column", async () => {
    // MOCK_KEY was accepted and used on the successful verify, upload and tailoring calls of steps 3 to 5,
    // so searching for it as well as the sentinel covers the success path, not only failing calls.
    assert.ok(serverOutput.length > 0, "server output was captured");
    assert.ok(!serverOutput.includes(SENTINEL), "the key is not in the server output");
    assert.ok(!serverOutput.includes(MOCK_KEY), "the valid key is not in the server output either");
    const db = await createDb({ dataDir: dbDir });
    try {
      for (const table of ["users", "accounts", "verification_tokens", "resumes", "fact_bases", "jobs", "tailorings", "consents"]) {
        const { rows } = await db.system.query(`SELECT row_to_json(t)::text AS j FROM ${table} t`);
        for (const { j } of rows) {
          assert.ok(!j.includes(SENTINEL), `the key is not stored in ${table}`);
          assert.ok(!j.includes(MOCK_KEY), `the valid key is not stored in ${table}`);
        }
      }
      const { rows: bRows } = await db.system.query("SELECT count(*)::int AS n FROM tailorings WHERE user_id = $1", [state.bId]);
      assert.equal(bRows[0].n, 1, "B's rows (written with the key) were scanned");
      const { rows: consents } = await db.system.query("SELECT notice_version, purpose FROM consents WHERE user_id = $1", [state.bId]);
      assert.deepEqual(consents, [{ notice_version: NOTICE_VERSION, purpose: "ai_processing" }], "B's consent is stored once, with the notice version");
    } finally {
      await db.close();
    }
  });

  await step("12. account deletion removed every one of A's rows", async () => {
    const db = await createDb({ dataDir: dbDir });
    try {
      const { rows: u } = await db.system.query("SELECT count(*)::int AS n FROM users WHERE id = $1", [state.aId]);
      assert.equal(u[0].n, 0);
      for (const table of ["resumes", "fact_bases", "jobs", "tailorings", "consents"]) {
        const { rows } = await db.system.query(`SELECT count(*)::int AS n FROM ${table} WHERE user_id = $1`, [state.aId]);
        assert.equal(rows[0].n, 0, `no rows left in ${table}`);
      }
      const { rows: b } = await db.system.query("SELECT count(*)::int AS n FROM fact_bases WHERE user_id = $1", [state.bId]);
      assert.equal(b[0].n, 1, "B's data is still there");
    } finally {
      await db.close();
    }
  });
} catch {
  // Reported by step(); fall through to cleanup.
} finally {
  await stopServer(child);
  await closeBrowser();
  if (process.env.FLOW_SHOW_SERVER_OUTPUT === "1") {
    console.log("\n--- server output ---");
    console.log(serverOutput);
  } else if (failures && serverOutput) {
    console.log("\n--- last server output ---");
    console.log(serverOutput.slice(-4000));
  }
  fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
}

const passed = steps.filter(([, ok]) => ok).length;
console.log(`\n${failures ? "FAIL" : "PASS"}: ${passed} of ${steps.length} steps passed${failures ? "" : " (all)"}`);
process.exit(failures ? 1 : 0);
