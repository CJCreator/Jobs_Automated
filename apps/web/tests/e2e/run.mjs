// Browser end-to-end test. Drives the product through the UI only, in a real
// Chromium, against `next dev` with the development sign-in, the mock AI
// provider and a throwaway embedded database.
//
//   npm run test:e2e
//
// Optional: E2E_SCREENS_DIR=<folder> also saves full-page screenshots of every
// screen and state (1280 wide light and dark, 360 wide light).
// Exits non-zero on any failure. On a failed step the page's screenshot and HTML
// are saved to tests/e2e/artifacts/.

import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";
import {
  activeInfo,
  assertFocusVisible,
  assertSkipLinkFirst,
  assertTargets,
  describeAxe,
  noHorizontalScroll,
  runAxe,
  smallTargets,
  tabTo,
} from "./helpers.mjs";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
process.env.CAREER_OPS_CODE_ROOT ||= path.resolve(appDir, "../../packages/engine");
const artifactsDir = path.join(appDir, "tests", "e2e", "artifacts");
const screensDir = process.env.E2E_SCREENS_DIR || "";

const load = (rel) => import(pathToFileURL(path.join(appDir, rel)).href);
const { resumeHtml } = await load("src/lib/resume-html.mjs");
const { renderPdf, closeBrowser } = await load("src/lib/server/pdf.mjs");
const { pdfText } = await load("src/lib/server/pdf-text.mjs");
const { MOCK_RESUME, MOCK_KEY } = await load("src/lib/llm/mock.mjs");

const PORT = Number(process.env.E2E_PORT) || 3122;
const base = `http://localhost:${PORT}`;
const WRONG_KEY = "mock-wrong-key-123";
const JD = [
  "Zeta Fintech is hiring a Finance Analyst in Bengaluru to own month-end close and management reporting.",
  "You will build dashboards in Tableau and Power BI, write SQL against our ledger, and work with a team of analysts.",
  "We want 3 or more years of experience in finance operations, strong Excel, and clear written communication.",
  "Compensation: 12 to 18 LPA CTC. Notice period up to 60 days is fine.",
].join(" ");
const NEW_WORDING = "Managed and mentored a team of 4 analysts";
const FAITHFUL_WORDING = "Cut month-end close time by 30% with SQL and Power BI reporting";

const squash = (s) => s.replace(/\s+/g, "");

// ---------------------------------------------------------------------------
// Server and browser

let serverOutput = "";

const GENERATED = ["tsconfig.json", "next-env.d.ts"].map((name) => path.join(appDir, name));
const generated = GENERATED.map((file) => [file, fs.existsSync(file) ? fs.readFileSync(file) : null]);
function restoreGenerated() {
  for (const [file, content] of generated) {
    if (content === null) fs.rmSync(file, { force: true });
    else if (!fs.existsSync(file) || !fs.readFileSync(file).equals(content)) fs.writeFileSync(file, content);
  }
}

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "rolewright-e2e-"));
let child = null;
let browser = null;

function freePort(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.listen(port, () => srv.close(() => resolve(true)));
  });
}

function startServer() {
  const env = {
    ...process.env,
    BUILD_DIST: ".next-e2e",
    ROLEWRIGHT_DEV_LOGIN: "1",
    ROLEWRIGHT_ALLOW_MOCK_LLM: "1",
    ROLEWRIGHT_DATA_DIR: path.join(dataDir, "pglite"),
    AUTH_SECRET: "e2e-test-secret-not-for-real-use-0123456789abcdef",
    AUTH_URL: base,
    NEXT_TELEMETRY_DISABLED: "1",
  };
  for (const k of ["NODE_ENV", "DATABASE_URL", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "AUTH_RESEND_KEY", "EMAIL_FROM", "CAREER_OPS_ROOT", "CAREER_OPS_DATA_DIR"]) {
    delete env[k];
  }
  const nextBin = path.join(appDir, "node_modules", "next", "dist", "bin", "next");
  const proc = spawn(process.execPath, [nextBin, "dev", "-p", String(PORT)], { cwd: appDir, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  proc.stdout.on("data", (d) => (serverOutput += d.toString()));
  proc.stderr.on("data", (d) => (serverOutput += d.toString()));
  return proc;
}

function killServerSync() {
  if (!child || child.exitCode !== null) return;
  try {
    if (process.platform === "win32") execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else child.kill("SIGKILL");
  } catch {
    // Already gone.
  }
}

async function waitForServer() {
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

process.once("exit", () => {
  killServerSync();
  restoreGenerated();
});
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => process.exit(130));

// ---------------------------------------------------------------------------
// Steps, findings and screenshots

const steps = [];
let failures = 0;
let currentPage = null;
const axeFindings = [];
const sizeFindings = [];
const pageErrors = [];
const consoleErrors = [];
const cspViolations = [];

async function saveArtifacts(name) {
  if (!currentPage || currentPage.isClosed()) return;
  try {
    fs.mkdirSync(artifactsDir, { recursive: true });
    const slug = name.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 50);
    await currentPage.screenshot({ path: path.join(artifactsDir, `${slug}.png`), fullPage: true });
    fs.writeFileSync(path.join(artifactsDir, `${slug}.html`), await currentPage.content());
    console.log(`     saved ${slug}.png and ${slug}.html in tests/e2e/artifacts/ (page was at ${currentPage.url()})`);
  } catch {
    // Best effort.
  }
}

async function step(name, fn, { fatal = true } = {}) {
  try {
    await fn();
    console.log(`PASS ${name}`);
    steps.push([name, true]);
  } catch (err) {
    failures++;
    console.log(`FAIL ${name}`);
    console.log(String(err?.stack ?? err).split("\n").map((l) => `     ${l}`).join("\n"));
    steps.push([name, false]);
    await saveArtifacts(name);
    if (fatal) throw err;
  }
}

function watch(page) {
  page.setDefaultTimeout(90_000);
  page.setDefaultNavigationTimeout(120_000);
  page.on("pageerror", (e) => pageErrors.push(`${page.url()}: ${e.message}`));
  page.on("console", (m) => {
    // Chromium reports a blocked script or style as a console message naming the policy.
    if (/content security policy|violates the following/i.test(m.text())) cspViolations.push(`${page.url()}: ${m.text().slice(0, 300)}`);
    if (m.type() !== "error") return;
    const text = m.text();
    if (/favicon/i.test(text)) return;
    consoleErrors.push(`${page.url()}: ${text.slice(0, 300)}`);
  });
}

async function newContext(options = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true, baseURL: base, ...options });
  const page = await ctx.newPage();
  watch(page);
  currentPage = page;
  return { ctx, page };
}

let shotNumber = 0;
async function shot(page, label, { dark = true } = {}) {
  if (!screensDir) return;
  fs.mkdirSync(screensDir, { recursive: true });
  const size = page.viewportSize();
  const width = size?.width ?? 1280;
  const variants = width < 600 ? ["light"] : dark ? ["light", "dark"] : ["light"];
  const n = String(++shotNumber).padStart(2, "0");
  const original = await page.evaluate(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  for (const scheme of variants) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.waitForTimeout(450);
    await page.screenshot({ path: path.join(screensDir, `${n}-${label}-${width}-${scheme}.png`), fullPage: true });
  }
  await page.emulateMedia({ colorScheme: original ? "dark" : "light" });
}

/** Wait until the page has not navigated for 4 seconds (up to a minute). */
async function untilQuiet(page) {
  let last = Date.now();
  const onNav = () => (last = Date.now());
  page.on("framenavigated", onNav);
  try {
    const end = Date.now() + 60_000;
    while (Date.now() < end && Date.now() - last < 4000) await page.waitForTimeout(500);
  } finally {
    page.off("framenavigated", onNav);
  }
}

/** At every screen state: axe in light and dark, target sizes, and a screenshot. */
async function checkpoint(page, label) {
  // The dev server reloads the page when a source file changes under it (other
  // people edit this tree while the suite runs); retry if that lands mid-check.
  for (let attempt = 1; ; attempt++) {
    const mark = [axeFindings.length, sizeFindings.length];
    try {
      await settle(page);
      await runAxe(page, appDir, label, axeFindings);
      for (const problem of await smallTargets(page)) sizeFindings.push(`[${label}] ${problem}`);
      await shot(page, label);
      return;
    } catch (e) {
      axeFindings.length = mark[0];
      sizeFindings.length = mark[1];
      if (attempt >= 6 || !/context was destroyed|navigation/i.test(String(e))) throw e;
      await untilQuiet(page);
    }
  }
}

// Network idle, but never fail on it: if something keeps the dev server busy
// (another dev server rewriting tsconfig.json makes Next reload pages), carry on.
const settle = (page) => page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});

async function poll(fn, message, ms = 30_000) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    try {
      last = await fn();
      if (last) return last;
    } catch (e) {
      last = e;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Timed out waiting for: ${message}${last instanceof Error ? ` (${last.message})` : ""}`);
}

async function go(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await settle(page);
}

/**
 * Sign in through the sign-in page form. There is no fallback: a form that
 * rejects a valid email fails the step. `submit` performs the form
 * submission (mouse or keyboard).
 */
async function signInThroughForm(page, email, submit) {
  await go(page, "/sign-in");
  await submit();
  const outcome = await Promise.race([
    page.waitForURL("**/app", { timeout: 90_000 }).then(() => "ok"),
    page.getByText("We could not sign you in").waitFor({ timeout: 90_000 }).then(() => "failed"),
  ]);
  assert.equal(outcome, "ok", `the sign-in form rejected a valid email (${email})`);
  await settle(page);
}

async function signInByUi(page, email) {
  await signInThroughForm(page, email, async () => {
    await page.locator("#dev-email").fill(email);
    await page.getByRole("button", { name: "Development sign-in" }).click();
  });
}

const nav = (page, name) => page.getByRole("navigation", { name: "Main" }).getByRole("link", { name, exact: true });

/** Everything the page could keep in browser storage, as text. */
async function storageDump(page) {
  return page.evaluate(async () => {
    const read = (store) => {
      const out = {};
      try {
        for (let i = 0; i < store.length; i++) {
          const k = store.key(i);
          out[k] = store.getItem(k);
        }
      } catch {
        // Blocked storage holds nothing.
      }
      return out;
    };
    let idb = [];
    try {
      idb = indexedDB.databases ? (await indexedDB.databases()).map((d) => d.name) : [];
    } catch {
      // No databases we can list.
    }
    return { local: read(window.localStorage), session: read(window.sessionStorage), idb, cookie: document.cookie };
  });
}

async function assertNoStoredKey(page, what) {
  const dump = JSON.stringify(await storageDump(page));
  assert.ok(!dump.includes(MOCK_KEY), `${what}: the key is not in localStorage, sessionStorage, IndexedDB names or document.cookie: ${dump.slice(0, 300)}`);
  assert.ok(!dump.includes("rolewright.llm"), `${what}: nothing named rolewright.llm is stored: ${dump.slice(0, 300)}`);
}

/**
 * The key lives only in page memory, so any full page load forgets it. Put it
 * back through the key screen (checks it, picks the model, saves). Leaves the
 * page on /app/key with the saved-key card showing.
 */
async function enterKey(page) {
  if (!new URL(page.url()).pathname.startsWith("/app/key")) {
    await nav(page, "AI key").click();
    await page.waitForURL("**/app/key");
    await settle(page);
  }
  if ((await page.locator("#saved-key-title").count()) > 0) return;
  await page.waitForSelector('#provider option[value="mock"]', { state: "attached" });
  await page.locator("#provider").selectOption("mock");
  await page.locator("#llm-key").fill(MOCK_KEY);
  await page.getByRole("button", { name: "Check key", exact: true }).click();
  await page.getByText(/This key works/).waitFor();
  await page.locator("#model").selectOption("mock-1");
  await page.getByRole("button", { name: "Save in this browser" }).click();
  await page.locator("#saved-key-title").waitFor();
}

/** Sign out with the header button and sign in as someone else, with client-side navigation only (no page load). */
async function switchUserWithoutReload(page, email, signOutButton) {
  await page.evaluate(() => {
    window.__noReload = true;
  });
  await signOutButton();
  await page.waitForURL(`${base}/`, { timeout: 60_000 });
  await page.getByRole("link", { name: "Sign in" }).first().click();
  await page.waitForURL("**/sign-in");
  await page.locator("#dev-email").fill(email);
  await page.getByRole("button", { name: "Development sign-in" }).click();
  await page.waitForURL("**/app", { timeout: 90_000 });
  await settle(page);
  assert.equal(await page.evaluate(() => window.__noReload === true), true, "the tab was not reloaded, so memory was not cleared by a page load");
}

async function assertNoKeyInUse(page, what) {
  await nav(page, "AI key").click();
  await page.waitForURL("**/app/key");
  await settle(page);
  await page.locator("#llm-key").waitFor();
  assert.equal(await page.locator("#saved-key-title").count(), 0, `${what}: no saved key card`);
}

/** Follow a header link with the keyboard only (no page load, so the in-memory key survives). */
async function kbNav(page, href) {
  await page.evaluate(() => document.querySelector(".skip-link")?.focus());
  await tabTo(page, `a[href="${href}"]`);
  await page.keyboard.press("Enter");
  await page.waitForURL(`**${href}`);
  await settle(page);
}

async function pdfFixture() {
  const fixture = {
    contact: { ...MOCK_RESUME.contact },
    summary: MOCK_RESUME.summary,
    experience: MOCK_RESUME.experience.map((e) => ({ company: e.company, title: e.title, location: e.location, dates: `${e.start} – ${e.end}`, bullets: e.bullets })),
    education: ["B.Com, Christ University, 2019"],
    skills: MOCK_RESUME.skills,
  };
  return renderPdf(resumeHtml(fixture));
}

/** Find the four suggestion cards by what they say; returns their ids. */
async function findCards(page) {
  await poll(async () => (await page.locator('li[id^="sug-"]').count()) === 4, "four suggestion cards", 60_000);
  const list = await page.locator('li[id^="sug-"]').evaluateAll((els) => els.map((e) => ({ id: e.id.replace(/^sug-/, ""), text: e.innerText })));
  const find = (re, what) => {
    const hit = list.find((c) => re.test(c.text));
    assert.ok(hit, `found the ${what} card`);
    return hit.id;
  };
  return { faithful: find(/month-end close/, "faithful"), team: find(/team of/, "team of 12"), tableau: find(/Tableau/, "Tableau"), crore: find(/portfolios/, "5 crore") };
}

const cardLoc = (page, id) => page.locator(`[id="sug-${id}"]`);

async function downloadPdfText(page, trigger) {
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 120_000 }), trigger()]);
  assert.match(download.suggestedFilename(), /\.pdf$/);
  const file = path.join(dataDir, `export-${Date.now()}.pdf`);
  await download.saveAs(file);
  const bytes = fs.readFileSync(file);
  assert.equal(bytes.subarray(0, 5).toString("latin1"), "%PDF-");
  const { text } = await pdfText(bytes);
  return squash(text);
}

function assertNoInvented(text) {
  for (const banned of ["12 analysts", "Tableau", "Google", "5 crore"]) {
    assert.ok(!text.includes(squash(banned)), `"${banned}" is not in the PDF`);
  }
}

// ---------------------------------------------------------------------------
// The run

const state = {};

try {
  await step("1. next dev starts on port 3122 with the dev sign-in, the mock AI and a temp database", async () => {
    assert.ok(await freePort(PORT), `port ${PORT} is already in use`);
    child = startServer();
    await waitForServer();
    browser = await launchBrowser();
    state.pdf = await pdfFixture();
    assert.ok((await pdfText(state.pdf)).text.length >= 200, "the fixture PDF has enough text");
  });

  const main = await newContext();
  const page = main.page;

  await step("a. landing page, sign in link, failed and successful development sign-in", async () => {
    await go(page, "/");
    assert.match(await page.locator("h1").innerText(), /Tailor your resume/);
    await checkpoint(page, "landing");
    await page.getByRole("link", { name: "Sign in" }).first().click();
    await page.waitForURL("**/sign-in");
    await settle(page);
    await checkpoint(page, "sign-in");

    await signInByUi(page, "asha.e2e@example.com");
    await page.getByText("Nothing tailored yet").waitFor();
    await checkpoint(page, "home-empty");

    // A sign-in that fails says so in plain words (a separate visitor, signed out).
    const visitor = await newContext();
    try {
      await go(visitor.page, "/sign-in");
      await visitor.page.locator("#dev-email").fill("nobody@invalid");
      await visitor.page.getByRole("button", { name: "Development sign-in" }).click();
      await visitor.page.getByText("We could not sign you in").waitFor();
      await checkpoint(visitor.page, "sign-in-failed");
    } finally {
      await visitor.ctx.close();
      currentPage = page;
    }
  });

  await step("b. AI key: wrong key refused, right key checked, model picked, saved, shown masked, never in HTML or cookies", async () => {
    await nav(page, "AI key").click();
    await page.waitForURL("**/app/key");
    await settle(page);
    await page.waitForSelector('#provider option[value="mock"]', { state: "attached" });
    const labels = await page.locator("#provider option").allInnerTexts();
    assert.ok(labels.includes("Test provider (development only)"), "the test provider is offered in development");
    await checkpoint(page, "key-before");

    await page.locator("#provider").selectOption({ label: "Test provider (development only)" });
    await page.locator("#llm-key").fill(WRONG_KEY);
    await page.getByRole("button", { name: "Check key", exact: true }).click();
    await page.getByText(/This key did not work/).waitFor();

    await page.locator("#llm-key").fill(MOCK_KEY);
    await page.getByRole("button", { name: "Check key", exact: true }).click();
    await page.getByText(/This key works/).waitFor();
    await page.locator("#model").selectOption("mock-1");
    await page.getByRole("button", { name: "Save in this browser" }).click();
    await page.getByText("Key saved in this browser.").waitFor();
    await page.locator("#saved-key-title").waitFor();

    const afterSave = async () => {
      const html = await page.content();
      assert.ok(!html.includes(MOCK_KEY), "the full key is not in the page HTML");
      const cookies = JSON.stringify(await page.context().cookies());
      assert.ok(!cookies.includes(MOCK_KEY), "the key is not in any cookie");
      const shown = await page.locator("main").innerText();
      assert.ok(shown.includes("••••"), "the key is shown masked");
      assert.ok(!shown.includes(MOCK_KEY), "the key is not shown in full");
    };
    await afterSave();
    await assertNoStoredKey(page, "after saving the key");
    await checkpoint(page, "key-after");

    // An old build kept the key in localStorage: loading the page removes it.
    await page.evaluate((k) => window.localStorage.setItem("rolewright.llm", JSON.stringify({ provider: "mock", key: k, model: "mock-1", verifiedAt: "2020-01-01T00:00:00.000Z" })), MOCK_KEY);
    await page.reload();
    await settle(page);
    await page.locator("#llm-key").waitFor();
    assert.equal(await page.locator("#saved-key-title").count(), 0, "after a reload the saved-key card is gone");
    await assertNoStoredKey(page, "after reload (legacy item removed)");
    await enterKey(page);
    await afterSave();
    await assertNoStoredKey(page, "after entering the key again");
  });

  await step("c. resume: consent, upload, fact review starts at 0 confirmed, confirm all, save, reload keeps it", async () => {
    await nav(page, "Resume and facts").click();
    await page.waitForURL("**/app/resume");
    await settle(page);
    await page.getByText("No facts yet").waitFor();
    await checkpoint(page, "resume-before");

    await page.locator("#resume-file").setInputFiles({ name: "asha-rao-resume.pdf", mimeType: "application/pdf", buffer: state.pdf });
    await page.getByLabel(/I understand my resume text/).check();
    await page.locator("#upload-resume").click();
    await page.getByText(/Resume read\./).first().waitFor({ timeout: 120_000 });
    const bar = page.getByText(/^\d+ of \d+ facts confirmed$/);
    const before = await bar.innerText();
    assert.match(before, /^0 of \d+ facts confirmed$/);
    state.total = Number(before.match(/of (\d+)/)[1]);
    assert.ok(state.total >= 8, `a useful number of facts was read (${state.total})`);
    await checkpoint(page, "resume-review");

    const confirmButtons = page.getByRole("button", { name: /^Confirm all in this section/ });
    const n = await confirmButtons.count();
    assert.ok(n >= 6, `a confirm-all button per section (${n})`);
    for (let i = 0; i < n; i++) await confirmButtons.nth(i).click();
    await poll(async () => (await bar.innerText()) === `${state.total} of ${state.total} facts confirmed`, "every fact confirmed");
    await checkpoint(page, "resume-confirmed");

    await page.locator("#save-facts").click();
    await page.getByText("Facts saved.").waitFor();
    await page.reload();
    await settle(page);
    await poll(async () => (await bar.innerText().catch(() => "")) === `${state.total} of ${state.total} facts confirmed`, "confirmed count persisted after reload");
    // The reload forgot the key; the next steps use it.
    await enterKey(page);
  });

  await step("d. tailor: title, company and a long job description lead to four suggestions", async () => {
    await nav(page, "Tailor").click();
    await page.waitForURL("**/app/tailor");
    await settle(page);
    await page.locator("#job-title").waitFor();
    await checkpoint(page, "tailor-form");
    await page.locator("#job-title").fill("Finance Analyst");
    await page.locator("#job-company").fill("Zeta Fintech");
    await page.locator("#job-jd").fill(JD);
    assert.ok(JD.length >= 200);
    await page.locator("#tailor-submit").click();
    await page.waitForURL(/\/app\/tailor\/[0-9a-f-]{36}$/, { timeout: 120_000 });
    state.reviewUrl = new URL(page.url()).pathname;
    state.cards = await findCards(page);
  });

  await step("e. review: faithful card checked and acceptable, three invented cards blocked, export gated, PDF has only true lines", async () => {
    const { faithful, team, tableau, crore } = state.cards;
    await settle(page);
    await checkpoint(page, "review-fresh");

    const f = cardLoc(page, faithful);
    const faithfulText = await f.innerText();
    assert.ok(faithfulText.includes("Checked against your facts"), `the faithful card shows the checked badge:\n${faithfulText}`);
    assert.equal(await f.locator('[id^="accept-btn-"]').isDisabled(), false, "the faithful card can be accepted");

    const expectIssues = { [team]: [["12"]], [tableau]: [["Tableau", "Google"]], [crore]: [["5 crore"]] };
    for (const [id, groups] of Object.entries(expectIssues)) {
      const card = cardLoc(page, id);
      const text = await card.innerText();
      assert.ok(text.includes("Not in your facts"), `blocked card says "Not in your facts":\n${text}`);
      const issues = await card.getByTestId("issues").innerText();
      for (const anyOf of groups) {
        assert.ok(anyOf.some((v) => issues.includes(v)), `issues list mentions ${anyOf.join(" or ")}:\n${issues}`);
      }
      assert.equal(await card.locator('[id^="accept-btn-"]').isDisabled(), true, "Accept is disabled on a blocked card");
      assert.ok(text.includes("Accept is off because this line is not in your facts"), "the reason for the disabled Accept is visible");
    }
    const tableauIssues = await cardLoc(page, tableau).getByTestId("issues").innerText();
    console.log(`     tableau card issues: ${tableauIssues.replace(/\s+/g, " ").slice(0, 200)}`);

    const exportBtn = page.locator("#export-pdf");
    assert.equal(await exportBtn.isDisabled(), true, "export is disabled before anything is accepted");
    assert.ok(await page.locator("#export-reason").isVisible(), "the reason is visible");
    assert.match(await page.locator("#export-reason").innerText(), /Accept at least one suggestion/);

    await f.locator('[id^="accept-btn-"]').click();
    await poll(async () => (await cardLoc(page, faithful).innerText()).includes("Accepted"), "faithful card shows Accepted");
    await poll(async () => !(await exportBtn.isDisabled()), "export enabled after an accept");
    await checkpoint(page, "review-one-accepted");

    const text = await downloadPdfText(page, () => exportBtn.click());
    assert.ok(text.includes(squash(FAITHFUL_WORDING)), "accepted wording is in the PDF");
    assertNoInvented(text);
    assert.ok(text.includes(squash("Managed a team of 4 analysts")), "untouched lines stay as confirmed");
  });

  await step("f. can't confirm marks the card, an honest edit unblocks it, and the new wording exports", async () => {
    const { team } = state.cards;
    const card = cardLoc(page, team);
    await card.getByRole("button", { name: /I can't confirm this/ }).click();
    await poll(async () => /marked this as something you can't confirm|You marked/.test(await card.innerText()), "card explains it is marked can't-confirm");
    const text = await card.innerText();
    assert.ok(text.includes("Not in your facts"), "still blocked");
    assert.equal(await card.locator('[id^="accept-btn-"]').isDisabled(), true, "Accept still disabled");
    await checkpoint(page, "review-cannot-confirm");

    await card.locator('[id^="edit-btn-"]').click();
    await page.locator(`[id="edit-${team}"]`).fill(NEW_WORDING);
    await page.getByRole("button", { name: "Save wording" }).click();
    await poll(async () => (await card.innerText()).includes("Checked against your facts"), "badge changes to checked after the edit");
    assert.equal(await card.locator('[id^="accept-btn-"]').isDisabled(), false);
    await card.locator('[id^="accept-btn-"]').click();
    await poll(async () => (await card.innerText()).includes("Accepted"), "team card accepted");

    const pdf = await downloadPdfText(page, () => page.locator("#export-pdf").click());
    assert.ok(pdf.includes(squash(NEW_WORDING)), "the edited wording is in the PDF");
    assert.ok(pdf.includes(squash(FAITHFUL_WORDING)), "the first accepted line is still there");
    assertNoInvented(pdf);
  });

  await step("g. attesting '5 crore' unblocks it for that issue and lists it under Additional facts", async () => {
    const { crore } = state.cards;
    const card = cardLoc(page, crore);
    await card.locator('[id^="attest-"]').first().click();
    const confirmText = await card.innerText();
    assert.ok(/You are stating that '₹?5 crore' is true about you/.test(confirmText), `inline statement shown:\n${confirmText}`);
    await card.getByRole("button", { name: "Yes, it is true. Add it" }).click();
    await poll(async () => {
      const issues = card.getByTestId("issues");
      if ((await issues.count()) === 0) return true;
      return !(await issues.innerText()).includes("5 crore");
    }, "the card no longer lists 5 crore as an issue");
    await checkpoint(page, "review-attested");

    await nav(page, "Resume and facts").click();
    await page.waitForURL("**/app/resume");
    await settle(page);
    const extras = page.locator('section[aria-labelledby="sec-extras-title"] textarea');
    await poll(async () => (await extras.count()) > 0, "an additional fact is listed");
    const values = await extras.evaluateAll((els) => els.map((e) => e.value));
    assert.ok(values.some((v) => v.includes("5 crore")), `Additional facts lists the new fact: ${JSON.stringify(values)}`);
    await checkpoint(page, "resume-with-extras");
    const cannot = await page.locator('section[aria-labelledby="sec-cannot-title"]').innerText();
    assert.ok(cannot.includes("12"), "the can't-confirm claim from step f is listed");
  });

  // Removing a can't-confirm entry must reach the server (contract change: removeCannotConfirm).
  await step("g2. removing a claim from the can't-confirm list is saved", async () => {
    const cannotSection = page.locator('section[aria-labelledby="sec-cannot-title"]');
    await cannotSection.getByRole("button", { name: /Remove "12"/ }).click();
    await page.locator("#save-facts").click();
    await page.getByText("Facts saved.").waitFor();
    await page.reload();
    await settle(page);
    const section = page.locator('section[aria-labelledby="sec-cannot-title"]');
    await section.waitFor();
    assert.equal(await section.locator("li").count(), 0, `the claim is gone after reload:\n${await section.innerText()}`);
  });

  await step("5. keyboard only: sign in, key, resume, tailor and review work without a mouse; focus stays sensible", async () => {
    const { ctx, page: p } = await newContext();
    try {
      // Landing and sign-in: first Tab is the skip link.
      await go(p, "/");
      await assertSkipLinkFirst(p, "landing");
      await assertTargets(p, "landing");
      await p.keyboard.press("Tab");
      let info = await assertFocusVisible(p, "landing second Tab");
      assert.match(info.text, /Sign in/);
      await p.keyboard.press("Enter");
      await p.waitForURL("**/sign-in");

      await signInThroughForm(p,"keys.e2e@example.com", async () => {
        await assertSkipLinkFirst(p, "sign-in");
        await assertTargets(p, "sign-in");
        await tabTo(p, "#dev-email");
        await p.keyboard.type("keys.e2e@example.com");
        await p.keyboard.press("Tab");
        const i = await assertFocusVisible(p, "sign-in submit");
        assert.match(i.text, /Development sign-in/);
        await p.keyboard.press("Enter");
      });

      // Home, then move to the key screen by keyboard.
      await go(p, "/app");
      await assertSkipLinkFirst(p, "home");
      await assertTargets(p, "home");
      await tabTo(p, 'a[href="/app/key"]');
      await p.keyboard.press("Enter");
      await p.waitForURL("**/app/key");
      await settle(p);

      // b. key
      await go(p, "/app/key");
      await assertSkipLinkFirst(p, "key");
      await assertTargets(p, "key");
      await p.waitForSelector('#provider option[value="mock"]', { state: "attached" });
      await tabTo(p, "#provider");
      for (let i = 0; i < 10 && (await p.locator("#provider").inputValue()) !== "mock"; i++) await p.keyboard.press("ArrowDown");
      assert.equal(await p.locator("#provider").inputValue(), "mock", "chose the test provider with the arrow keys");
      await tabTo(p, "#llm-key");
      await p.keyboard.type(WRONG_KEY);
      await tabTo(p, "#check-key");
      await p.keyboard.press("Enter");
      await p.getByText(/This key did not work/).waitFor();
      info = await assertFocusVisible(p, "after a failed key check");
      assert.equal(info.id, "check-key", "focus stays on the Check key button");
      await p.keyboard.press("Shift+Tab");
      await p.keyboard.press("Shift+Tab");
      info = await assertFocusVisible(p, "back in the key field");
      assert.equal(info.id, "llm-key");
      await p.keyboard.press("Control+A");
      await p.keyboard.type(MOCK_KEY);
      await tabTo(p, "#check-key");
      await p.keyboard.press("Enter");
      await p.getByText(/This key works/).waitFor();
      await tabTo(p, "#model");
      await tabTo(p, "#save-key");
      await p.keyboard.press("Enter");
      await p.getByText("Key saved in this browser.").waitFor();
      info = await assertFocusVisible(p, "after saving the key");
      assert.equal(info.id, "saved-key-title", "focus moves to the saved key summary");
      await assertTargets(p, "key saved");

      // c. resume. The key lives in page memory, so reach this screen by keyboard
      // navigation inside the app instead of a page load, which would forget it.
      await kbNav(p, "/app/resume");
      await tabTo(p, "#resume-file");
      await p.locator("#resume-file").setInputFiles({ name: "asha-rao-resume.pdf", mimeType: "application/pdf", buffer: state.pdf });
      await p.keyboard.press("Tab");
      info = await assertFocusVisible(p, "consent checkbox");
      assert.equal(info.id, "resume-consent");
      await p.keyboard.press("Space");
      assert.equal(await p.locator("#resume-consent").isChecked(), true, "Space ticks the consent box");
      await p.keyboard.press("Tab");
      info = await assertFocusVisible(p, "upload button");
      assert.equal(info.id, "upload-resume");
      await p.keyboard.press("Enter");
      await p.getByText(/Resume read\./).first().waitFor({ timeout: 120_000 });
      info = await assertFocusVisible(p, "after the resume was read");
      assert.equal(info.id, "facts-heading", "focus moves to the facts to review");
      const bar = p.getByText(/^\d+ of \d+ facts confirmed$/);
      assert.match(await bar.innerText(), /^0 of \d+/);
      await assertTargets(p, "resume review");
      for (let i = 0; i < 6; i++) {
        await tabTo(p, 'button[aria-label^="Confirm all in this section"]');
        await p.keyboard.press("Enter");
        await assertFocusVisible(p, `after confirm all ${i + 1}`);
      }
      await poll(async () => (await bar.innerText()) === `${state.total} of ${state.total} facts confirmed`, "every fact confirmed with the keyboard");
      await tabTo(p, "#save-facts");
      await p.keyboard.press("Enter");
      await p.getByText("Facts saved.").waitFor();
      info = await assertFocusVisible(p, "after saving facts");
      assert.equal(info.id, "save-facts", "focus stays on Save");

      // d. tailor
      await kbNav(p, "/app/tailor");
      await assertTargets(p, "tailor");
      await tabTo(p, "#job-title");
      await p.keyboard.type("Finance Analyst");
      await p.keyboard.press("Tab");
      await p.keyboard.type("Zeta Fintech");
      await p.keyboard.press("Tab");
      info = await assertFocusVisible(p, "job description field");
      assert.equal(info.id, "job-jd");
      await p.keyboard.insertText(JD);
      await tabTo(p, "#tailor-submit");
      await p.keyboard.press("Enter");
      await p.waitForURL(/\/app\/tailor\/[0-9a-f-]{36}$/, { timeout: 120_000 });
      const url = new URL(p.url()).pathname;

      // e. review
      await go(p, url);
      await assertSkipLinkFirst(p, "review");
      const ids = await findCards(p);
      await assertTargets(p, "review");
      const inCard = async (id, what) => {
        const i = await assertFocusVisible(p, what);
        assert.equal(i.card, `sug-${id}`, `${what}: focus is inside the same card, not at the top (${JSON.stringify(i)})`);
        return i;
      };

      await tabTo(p, `[id="accept-btn-${ids.faithful}"]`);
      await p.keyboard.press("Enter");
      await poll(async () => (await cardLoc(p, ids.faithful).innerText()).includes("Accepted"), "faithful accepted");
      info = await inCard(ids.faithful, "after Accept");
      assert.ok(info.id.startsWith("undo-"), `focus moves to Undo (${info.id})`);

      // team: can't confirm, edit, save, accept
      await tabTo(p, `[id="cannot-0-${ids.team}"]`);
      await p.keyboard.press("Enter");
      await poll(async () => /You marked/.test(await cardLoc(p, ids.team).innerText()), "can't-confirm applied");
      await inCard(ids.team, "after can't confirm");
      info = await activeInfo(p);
      assert.match(info.text, /Edit the wording/, `focus lands on the next action in the card (${info.text})`);
      await p.keyboard.press("Enter");
      info = await inCard(ids.team, "after Edit");
      assert.equal(info.id, `edit-${ids.team}`, "focus moves into the edit box");
      await p.keyboard.press("Control+A");
      await p.keyboard.type(NEW_WORDING);
      await p.keyboard.press("Tab");
      info = await assertFocusVisible(p, "save wording");
      assert.match(info.text, /Save wording/);
      await p.keyboard.press("Enter");
      await poll(async () => (await cardLoc(p, ids.team).innerText()).includes("Checked against your facts"), "edit rechecked");
      info = await inCard(ids.team, "after saving the edit");
      assert.ok(info.id.startsWith("accept-btn-") || info.id.startsWith("edit-btn-"), `focus is on Accept or Edit (${info.id})`);
      await p.keyboard.press("Enter");
      await poll(async () => (await cardLoc(p, ids.team).innerText()).includes("Accepted"), "team accepted by keyboard");
      info = await inCard(ids.team, "after accepting the edited line");

      // tableau: reject
      await tabTo(p, `[id="reject-btn-${ids.tableau}"]`);
      await p.keyboard.press("Enter");
      await poll(async () => (await cardLoc(p, ids.tableau).innerText()).includes("Rejected"), "tableau rejected");
      info = await inCard(ids.tableau, "after Reject");
      assert.ok(info.id.startsWith("undo-"));

      // crore: attest with confirmation
      await tabTo(p, `[id="attest-0-${ids.crore}"]`);
      await p.keyboard.press("Enter");
      info = await inCard(ids.crore, "after opening the attest confirmation");
      assert.equal(info.id, `confirm-yes-0-${ids.crore}`, "focus moves to the confirmation button");
      await p.keyboard.press("Enter");
      await poll(async () => {
        const issues = cardLoc(p, ids.crore).getByTestId("issues");
        return (await issues.count()) === 0 || !(await issues.innerText()).includes("5 crore");
      }, "5 crore attested by keyboard");
      await inCard(ids.crore, "after attesting");

      // export, by keyboard
      await tabTo(p, "#export-pdf", 200);
      const pdf = await downloadPdfText(p, () => p.keyboard.press("Enter"));
      assert.ok(pdf.includes(squash(NEW_WORDING)) && pdf.includes(squash(FAITHFUL_WORDING)), "keyboard-built PDF has both accepted lines");
      assertNoInvented(pdf);
      info = await assertFocusVisible(p, "after export");
      assert.equal(info.id, "export-pdf", "focus stays on Export PDF");
      await assertTargets(p, "review after actions");

      // privacy
      await go(p, "/app/privacy");
      await assertSkipLinkFirst(p, "privacy");
      await assertTargets(p, "privacy");
    } finally {
      await ctx.close();
      currentPage = page;
    }
  });

  await step("6. at 360 by 740: no sideways scroll on any screen, the menu opens and closes, review buttons are reachable", async () => {
    const anon = await newContext({ viewport: { width: 360, height: 740 } });
    try {
      for (const [url, label] of [["/", "landing"], ["/sign-in", "sign-in"]]) {
        await go(anon.page, url);
        const m = await noHorizontalScroll(anon.page);
        assert.ok(m.scroll <= m.client, `${label}: no horizontal scroll (${m.scroll} > ${m.client})`);
        await shot(anon.page, `${label}`, { dark: false });
      }
    } finally {
      await anon.ctx.close();
    }
    currentPage = page;

    await page.setViewportSize({ width: 360, height: 740 });
    const screens = [
      ["/app", "home-data"],
      ["/app/key", "key-saved"],
      ["/app/resume", "resume-review"],
      ["/app/tailor", "tailor-form"],
      [state.reviewUrl, "review"],
      ["/app/privacy", "privacy"],
    ];
    for (const [url, label] of screens) {
      await go(page, url);
      if (label === "key-saved") await enterKey(page);
      if (label === "review") await findCards(page);
      if (label === "resume-review") await page.getByText(/facts confirmed/).first().waitFor();
      if (label === "home-data") await page.getByText("Finance Analyst").first().waitFor();
      const m = await noHorizontalScroll(page);
      assert.ok(m.scroll <= m.client, `${label}: no horizontal scroll (${m.scroll} > ${m.client})`);
      await shot(page, label, { dark: false });

      // The menu button.
      const menu = page.getByRole("button", { name: /^(Menu|Close menu)$/ });
      assert.equal(await menu.getAttribute("aria-expanded"), "false", `${label}: menu starts closed`);
      assert.equal(await nav(page, "Privacy").isVisible(), false, `${label}: links hidden while closed`);
      await menu.click();
      assert.equal(await menu.getAttribute("aria-expanded"), "true", `${label}: aria-expanded true when open`);
      assert.equal(await nav(page, "Privacy").isVisible(), true, `${label}: links visible when open`);
      if (label === "key-saved") await shot(page, "menu-open", { dark: false });
      await menu.click();
      assert.equal(await menu.getAttribute("aria-expanded"), "false", `${label}: aria-expanded false when closed`);
    }

    // Every button in every review card can be scrolled to, is inside the screen width and is not covered.
    await go(page, state.reviewUrl);
    await findCards(page);
    const problems = await page.evaluate(async () => {
      const bad = [];
      for (const b of document.querySelectorAll('li[id^="sug-"] button')) {
        b.scrollIntoView({ block: "center" });
        await new Promise((r) => setTimeout(r, 30));
        const r = b.getBoundingClientRect();
        const name = (b.innerText || b.id).replace(/\s+/g, " ").slice(0, 40);
        if (r.left < 0 || r.right > window.innerWidth) bad.push(`${name}: outside the screen width (${Math.round(r.left)} to ${Math.round(r.right)})`);
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (!(b === hit || b.contains(hit))) bad.push(`${name}: covered by ${hit?.tagName}`);
      }
      return bad;
    });
    assert.deepEqual(problems, [], "review card buttons reachable at 360 wide");
    const small = await smallTargets(page);
    assert.deepEqual(small, [], "targets at 360 wide");
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  await step("j. sign-out clears the key: another user signing in in the same tab, without a reload, has no key", async () => {
    const third = await newContext();
    try {
      await signInByUi(third.page, "chitra.e2e@example.com");
      await enterKey(third.page);
      await assertNoStoredKey(third.page, "key in use");
      await switchUserWithoutReload(third.page, "dev.e2e@example.com", () => third.page.getByRole("button", { name: "Sign out" }).click());
      await assertNoKeyInUse(third.page, "after sign-out and a different sign-in");
      await assertNoStoredKey(third.page, "after switching user");
    } finally {
      await third.ctx.close();
      currentPage = page;
    }
  });

  await step("i. a second user sees none of the first user's data", async () => {
    // Run while the first user's data still exists, so the check means something.
    const second = await newContext();
    try {
      await signInByUi(second.page, "bala.e2e@example.com");
      await second.page.getByText("Nothing tailored yet").waitFor();
      assert.equal(await second.page.getByText("Finance Analyst").count(), 0, "no tailoring from the first user on the home screen");
      await checkpointOnly(second.page, "home-second-user");
      const items = await second.page.evaluate(() => fetch("/api/tailorings").then((r) => r.json()));
      assert.deepEqual(items.items, [], "the API lists nothing");
      const tailoringId = state.reviewUrl.split("/").pop();
      const peek = await second.page.evaluate((id) => fetch(`/api/tailorings/${id}`).then((r) => r.status), tailoringId);
      assert.equal(peek, 404, "the first user's tailoring is not reachable");
      await go(second.page, "/app/resume");
      await second.page.getByText("No facts yet").waitFor();
      assert.match(await second.page.getByText(/^\d+ of \d+ facts confirmed$/).innerText(), /^0 of 0/);
    } finally {
      await second.ctx.close();
      currentPage = page;
    }
  });

  await step("h. privacy: Delete stays off until DELETE is typed; deleting signs out and /app asks for sign-in", async () => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await go(page, "/app");
    await enterKey(page);
    await nav(page, "Privacy").click();
    await page.waitForURL("**/app/privacy");
    await settle(page);
    const del = page.getByRole("button", { name: "Delete my account and data" });
    assert.equal(await del.isDisabled(), true, "starts disabled");
    await checkpoint(page, "privacy");
    await page.locator("#delete-confirm").fill("delete");
    assert.equal(await del.isDisabled(), true, "lowercase does not unlock it");
    await page.locator("#delete-confirm").fill("DELETE");
    assert.equal(await del.isDisabled(), false, "enabled once DELETE is typed");
    // Deleting the account must also forget the key held in this tab. Delete,
    // then sign in as someone else in the same tab (no reload) and look for it.
    await page.evaluate(() => {
      window.__noReload = true;
    });
    await del.click();
    await page.waitForURL(`${base}/`, { timeout: 60_000 });
    await page.getByRole("link", { name: "Sign in" }).first().click();
    await page.waitForURL("**/sign-in");
    await page.locator("#dev-email").fill("esha.e2e@example.com");
    await page.getByRole("button", { name: "Development sign-in" }).click();
    await page.waitForURL("**/app", { timeout: 90_000 });
    await settle(page);
    assert.equal(await page.evaluate(() => window.__noReload === true), true, "no page load happened");
    await assertNoKeyInUse(page, "after deleting the account");
    await go(page, "/app");
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL(`${base}/`, { timeout: 60_000 });
    await go(page, "/app");
    assert.match(new URL(page.url()).pathname, /^\/sign-in/, "/app redirects to sign-in once signed out");
  });
} catch {
  // Reported by step().
} finally {
  // Findings gathered across all screens.
  await step(
    "4. accessibility (axe, WCAG 2.0/2.1/2.2 A and AA, light and dark): no violations on any screen state",
    async () => {
      assert.equal(axeFindings.length, 0, `${axeFindings.length} violation group(s):\n${describeAxe(axeFindings)}`);
    },
    { fatal: false },
  );
  await step(
    "5b. every interactive element is at least 24 by 24 CSS pixels",
    async () => {
      assert.deepEqual(sizeFindings, [], "controls smaller than 24x24");
    },
    { fatal: false },
  );
  await step(
    "9. no uncaught page errors, hydration errors or Content Security Policy violations in the browser console",
    async () => {
      for (const e of consoleErrors) console.log(`     console error (note): ${e}`);
      assert.deepEqual(pageErrors, [], "uncaught page errors");
      const hydration = consoleErrors.filter((e) => /hydrat|did not match|Minified React|Warning:/i.test(e));
      assert.deepEqual(hydration, [], "hydration or React warnings");
      assert.deepEqual(cspViolations, [], "Content Security Policy violations during the whole run");
    },
    { fatal: false },
  );

  await browser?.close().catch(() => {});
  killServerSync();
  restoreGenerated();
  await closeBrowser().catch(() => {});
  if (failures && serverOutput) {
    console.log("\n--- last server output ---");
    console.log(serverOutput.slice(-3000));
  }
  fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
}

async function checkpointOnly(page, label) {
  await runAxe(page, appDir, label, axeFindings);
  await shot(page, label);
}

const passed = steps.filter(([, ok]) => ok).length;
console.log(`\n${failures ? "FAIL" : "PASS"}: ${passed} of ${steps.length} steps passed${failures ? "" : " (all)"}`);
process.exit(failures ? 1 : 0);
