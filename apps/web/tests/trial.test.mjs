// P1-2: the free trial. Counting (concurrency, refunds), who may use it, the fallback between
// trial providers, row-level isolation, and that our trial keys never leave the server.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDb } from "../src/lib/db/index.mjs";
import { TRIAL_TAILORINGS, TRIAL_UPLOADS, isVerified, refund, reserve, status } from "../src/lib/db/trial.mjs";
import { TRIAL_UNAVAILABLE, TrialError, assertTrialAvailable, runWithTrial, trialConfig, withReservation } from "../src/lib/server/trial.mjs";
import { LlmError } from "../src/lib/llm/index.mjs";
import { complete } from "../src/lib/llm/providers.mjs";
import { en } from "../src/i18n/en.ts";

const GEMINI_KEY = "AIzaTRIALGEMINIKEYSECRET0001";
const OPENROUTER_KEY = "sk-or-TRIALOPENROUTERKEYSECRET0002";
const ENV = {
  ROLEWRIGHT_TRIAL_GEMINI_KEY: GEMINI_KEY,
  ROLEWRIGHT_TRIAL_GEMINI_MODEL: "gemini-trial-model",
  ROLEWRIGHT_TRIAL_OPENROUTER_KEY: OPENROUTER_KEY,
  ROLEWRIGHT_TRIAL_OPENROUTER_MODEL: "vendor/free-model:free",
};
const KEYS = [GEMINI_KEY, OPENROUTER_KEY];
const config = trialConfig(ENV);

let db;
let n = 0;
const addUser = async (verified = false) =>
  (await db.system.query("INSERT INTO users (email, email_verified) VALUES ($1, $2) RETURNING id", [`u${++n}@example.com`, verified ? new Date() : null])).rows[0].id;
const used = async (userId) =>
  (await db.system.query("SELECT tailorings_used, uploads_used FROM trial_counters WHERE user_id = $1", [userId])).rows[0];
const usedUp = { usedUpMessage: en.trial.usedUp };

const realFetch = globalThis.fetch;
const realConsole = { log: console.log, error: console.error, warn: console.warn, info: console.info };
const logged = [];
before(async () => {
  db = await createDb();
  for (const k of Object.keys(realConsole)) console[k] = (...a) => logged.push(a.map(String).join(" "));
});
after(async () => {
  Object.assign(console, realConsole);
  globalThis.fetch = realFetch;
  await db.close();
});

test("the trial limits are 5 tailorings and 3 resume readings", () => {
  assert.equal(TRIAL_TAILORINGS, 5);
  assert.equal(TRIAL_UPLOADS, 3);
});

test("six concurrent reserves from a fresh account: exactly 5 succeed and the model is called 5 times", async () => {
  const u = await addUser(true);
  let modelCalls = 0;
  const attempt = () =>
    withReservation(db, u, "tailorings", async () => {
      const r = await runWithTrial(async () => { modelCalls++; return "ok"; }, { config });
      return r.value;
    }, usedUp);
  const results = await Promise.allSettled(Array.from({ length: 6 }, attempt));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 5);
  const rejected = results.filter((r) => r.status === "rejected");
  assert.equal(rejected.length, 1);
  assert.ok(rejected[0].reason instanceof TrialError);
  assert.equal(rejected[0].reason.code, "trial_used_up");
  assert.equal(rejected[0].reason.message, en.trial.usedUp);
  assert.equal(modelCalls, 5);
  assert.equal((await used(u)).tailorings_used, 5);
  assert.deepEqual(await status(db, u), { verified: true, tailoringsLeft: 0, uploadsLeft: 3 });
});

test("resume readings are counted apart: 3 of 5 concurrent reserves succeed", async () => {
  const u = await addUser(true);
  const results = await Promise.all(Array.from({ length: 5 }, () => reserve(db, u, "uploads")));
  assert.equal(results.filter(Boolean).length, 3);
  assert.deepEqual(await used(u), { tailorings_used: 0, uploads_used: 3 });
  assert.equal(await reserve(db, u, "tailorings"), true, "readings do not use up tailorings");
});

test("a failure after the reserve refunds it; a success does not; refund never goes below 0", async () => {
  const u = await addUser(true);
  await assert.rejects(
    withReservation(db, u, "tailorings", async () => { throw new LlmError("bad_response", "x"); }, usedUp),
    (e) => e instanceof LlmError,
  );
  assert.equal((await used(u))?.tailorings_used, 0);
  await withReservation(db, u, "tailorings", async () => "done", usedUp);
  assert.equal((await used(u)).tailorings_used, 1);
  await refund(db, u, "tailorings");
  await refund(db, u, "tailorings");
  await refund(db, u, "tailorings");
  assert.equal((await used(u)).tailorings_used, 0);
  const fresh = await addUser(true);
  await refund(db, fresh, "uploads");
  assert.equal(await used(fresh), undefined, "refund creates no row");
  assert.deepEqual(await status(db, fresh), { verified: true, tailoringsLeft: 5, uploadsLeft: 3 });
});

test("a failure refunds even when the exhausted account is refused first", async () => {
  const u = await addUser(true);
  for (let i = 0; i < 5; i++) await withReservation(db, u, "tailorings", async () => i, usedUp);
  let called = false;
  await assert.rejects(withReservation(db, u, "tailorings", async () => { called = true; }, usedUp), TrialError);
  assert.equal(called, false, "no model call without a reserve");
  assert.equal((await used(u)).tailorings_used, 5, "a refused request is not refunded below the real count");
});

test("verified: confirmed email or Google account; never unverified or the development sign-in", async () => {
  const unverified = await addUser(false);
  const emailed = await addUser(true);
  const google = await addUser(false);
  await db.system.query("INSERT INTO accounts (provider, provider_account_id, user_id) VALUES ('google', 'g-1', $1)", [google]);
  const dev = await addUser(false);
  await db.system.query("INSERT INTO accounts (provider, provider_account_id, user_id) VALUES ('dev', 'd-1', $1)", [dev]);
  assert.equal(await isVerified(db, unverified), false);
  assert.equal(await isVerified(db, emailed), true);
  assert.equal(await isVerified(db, google), true, "Google-linked account with null email_verified");
  assert.equal(await isVerified(db, dev), false);
  assert.equal((await status(db, unverified)).verified, false);
  assert.equal((await status(db, google)).verified, true);
  assert.equal(await isVerified(db, "00000000-0000-4000-8000-000000000000"), false);
});

test("an unverified account is refused before anything is reserved (order of checks in requireTrialAccess)", () => {
  const src = readFileSync(new URL("../src/lib/server/llm-key.ts", import.meta.url), "utf8");
  const body = src.slice(src.indexOf("export async function requireTrialAccess"));
  const order = ["assertTrialAvailable(", "isVerified(", "trial_not_verified", 'requireConsent(userId, "trial")', 'takeRateLimit("trialIp"', "ipSubject(clientIp("].map((s) => body.indexOf(s));
  assert.ok(order.every((i) => i > 0), "every check is present");
  assert.deepEqual(order.slice(0, 5), [...order.slice(0, 5)].sort((a, b) => a - b), "in the specified order");
  for (const file of ["tailorings", "resume"]) {
    const route = readFileSync(new URL(`../src/app/api/${file}/route.ts`, import.meta.url), "utf8");
    assert.ok(route.indexOf("requireTrialAccess(") > 0 && route.indexOf("requireTrialAccess(") < route.indexOf("withReservation("), `${file}: access checks come before the reserve`);
    assert.ok(route.indexOf("withReservation(") < route.indexOf("throw trialHttpError("), file);
    assert.match(route, /await requireConsent\(userId, llm\.provider\)/);
  }
});

test("trialConfig: Gemini then OpenRouter, only providers with a key and a valid model", () => {
  assert.deepEqual(config.map((c) => [c.provider, c.model]), [["gemini", "gemini-trial-model"], ["openrouter", "vendor/free-model:free"]]);
  assert.deepEqual(trialConfig({}), []);
  assert.deepEqual(trialConfig({ ROLEWRIGHT_TRIAL_GEMINI_KEY: GEMINI_KEY }).length, 0, "a key with no model is not used");
  assert.deepEqual(trialConfig({ ...ENV, ROLEWRIGHT_TRIAL_GEMINI_MODEL: "../x" }).map((c) => c.provider), ["openrouter"]);
  assert.deepEqual(trialConfig({ ROLEWRIGHT_TRIAL_OPENROUTER_KEY: OPENROUTER_KEY, ROLEWRIGHT_TRIAL_OPENROUTER_MODEL: "m" }).map((c) => c.provider), ["openrouter"]);
  assert.throws(() => assertTrialAvailable([]), (e) => e instanceof LlmError && e.code === "quota" && e.message === en.trial.unavailable);
  assert.doesNotThrow(() => assertTrialAvailable(config));
});

test("runWithTrial moves on only for quota, rate limit or provider error, and reports which one answered", async () => {
  for (const code of ["quota", "rate_limited", "provider_error"]) {
    const seen = [];
    const r = await runWithTrial(async (c) => { seen.push(c.provider); if (c.provider === "gemini") throw new LlmError(code, "m"); return "from openrouter"; }, { config });
    assert.deepEqual(seen, ["gemini", "openrouter"]);
    assert.deepEqual(r, { value: "from openrouter", provider: "openrouter", model: "vendor/free-model:free" });
  }
  const first = await runWithTrial(async (c) => c.provider, { config });
  assert.deepEqual([first.value, first.provider, first.model], ["gemini", "gemini", "gemini-trial-model"]);
  // Not the provider's fault: another provider would not help.
  for (const code of ["bad_response", "refused", "network"]) {
    const seen = [];
    await assert.rejects(runWithTrial(async (c) => { seen.push(c.provider); throw new LlmError(code, "m"); }, { config }), (e) => e.code === code);
    assert.deepEqual(seen, ["gemini"]);
  }
  // Our own key or model being wrong is not something the user can fix.
  const r = await runWithTrial(async (c) => { if (c.provider === "gemini") throw new LlmError("invalid_key", "Google Gemini did not accept this key."); return "ok"; }, { config });
  assert.equal(r.provider, "openrouter");
  for (const cfg of [config, []]) {
    await assert.rejects(runWithTrial(async () => { throw new LlmError("quota", "m"); }, { config: cfg }), (e) => e instanceof LlmError && e.code === "quota" && e.message === TRIAL_UNAVAILABLE);
  }
  await assert.rejects(runWithTrial(async () => { throw new LlmError("invalid_key", "Google Gemini did not accept this key."); }, { config }), (e) => e.code === "quota" && e.message === TRIAL_UNAVAILABLE, "never tells the user their key is wrong");
});

test("the message constant matches en.trial.unavailable", () => {
  assert.equal(TRIAL_UNAVAILABLE, en.trial.unavailable);
  assert.equal(en.trial.usedUp, "You have used your 5 free tailorings. Add your own AI key to continue.");
});

test("trial keys never appear in a response body, an error, a stored row or the console", async () => {
  const seen = [];
  const requests = [];
  let openrouterWorks = false;
  const bodyFor = (url) =>
    String(url).includes("googleapis")
      ? { error: { message: `bad key ${GEMINI_KEY}`, status: "PERMISSION_DENIED" } }
      : { error: { message: `bad key ${OPENROUTER_KEY}` } };
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), headers: init?.headers });
    // Gemini always fails with our key in its error text; OpenRouter fails until the second run.
    if (String(url).includes("googleapis") || !openrouterWorks) return new Response(JSON.stringify(bodyFor(url)), { status: 500 });
    return new Response(JSON.stringify({ choices: [{ message: { content: "{\"suggestions\":[]}" } }] }), { status: 200 });
  };
  const u = await addUser(true);
  const run = () =>
    withReservation(db, u, "tailorings", () =>
      runWithTrial((c) => complete({ provider: c.provider, key: c.key, model: c.model, system: "s", user: "u", json: true }), { config }), usedUp);
  // Both providers fail with the key in the provider's own error text.
  let failure;
  try { await run(); } catch (e) { failure = e; }
  assert.ok(failure instanceof LlmError);
  seen.push(String(failure.message), failure.stack ?? "", JSON.stringify({ ...failure }), JSON.stringify({ error: { code: failure.code, message: failure.message } }));
  assert.equal(failure.message, en.trial.unavailable);
  // Then one that works.
  openrouterWorks = true;
  const ok = await run();
  seen.push(JSON.stringify(ok));
  assert.equal(ok.provider, "openrouter");
  assert.ok(requests.some((r) => JSON.stringify(r.headers).includes(OPENROUTER_KEY)), "the key is used on the outbound call (headers only)");
  for (const table of ["users", "accounts", "trial_counters", "resumes", "fact_bases", "jobs", "tailorings", "consents", "rate_events"]) {
    seen.push(JSON.stringify((await db.system.query(`SELECT * FROM ${table}`)).rows));
  }
  seen.push(...logged, JSON.stringify(await status(db, u)));
  for (const text of seen) for (const k of KEYS) assert.ok(!text.includes(k), `a trial key leaked: ${text.slice(0, 80)}`);
  assert.ok(!seen.some((t) => t.includes("TRIAL")), "no part of any key leaked");
});

test("user B cannot read or change user A's counter", async () => {
  const A = await addUser(true);
  const B = await addUser(true);
  await reserve(db, A, "tailorings");
  const seen = await db.withUser(B, (q) => q.query("SELECT * FROM trial_counters"));
  assert.equal(seen.rows.length, 0);
  const upd = await db.withUser(B, (q) => q.query("UPDATE trial_counters SET tailorings_used = 0 WHERE user_id = $1 RETURNING 1", [A]));
  assert.equal(upd.rows.length, 0);
  await refund(db, B, "tailorings");
  assert.equal((await used(A)).tailorings_used, 1, "B's refund did not touch A");
  await assert.rejects(db.withUser(B, (q) => q.query("INSERT INTO trial_counters (user_id, tailorings_used) VALUES ($1, 0)", [A])));
  assert.equal((await status(db, B)).tailoringsLeft, 5);
  await assert.rejects(db.withUser(A, (q) => q.query("DELETE FROM trial_counters")), /permission denied/);
  await assert.rejects(db.withUser(A, (q) => q.query("UPDATE trial_counters SET tailorings_used = 6")), /check|violates/i);
});
