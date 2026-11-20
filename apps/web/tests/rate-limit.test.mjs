import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDb } from "../src/lib/db/index.mjs";
import { LONGEST_WINDOW_MS, spend, sweepRateEvents, take } from "../src/lib/db/rate-events.mjs";
import { LIMITS, RateLimitUnavailableError, chargeGate, decide, failClosed } from "../src/lib/server/rate-limit-core.mjs";

let db;
before(async () => {
  db = await createDb();
});
after(() => db.close());

const limit = { max: 5, windowMs: 60_000 };
const count = async (bucket, subject) =>
  Number((await db.system.query("SELECT COUNT(*) AS n FROM rate_events WHERE bucket=$1 AND subject=$2", [bucket, subject])).rows[0].n);

test("LIMITS match the plan", () => {
  const m = (k) => [LIMITS[k].max, LIMITS[k].windowMs];
  assert.deepEqual(m("ai"), [20, 60_000]);
  assert.deepEqual(m("upload"), [10, 3_600_000]);
  assert.deepEqual(m("tailoring"), [40, 60_000]);
  assert.deepEqual(m("coverage"), [60, 60_000]);
  assert.deepEqual(m("keyCheck"), [10, 600_000]);
  assert.deepEqual(m("export"), [20, 3_600_000]);
  assert.deepEqual(m("gateMs"), [20_000, 60_000]);
  assert.deepEqual(m("trialIp"), [50, 86_400_000]);
  assert.deepEqual(m("signInIp"), [20, 600_000]);
  assert.deepEqual(m("emailSend"), [5, 3_600_000]);
});

test("decide: allowed below max, refused at max", () => {
  assert.equal(decide(limit, 4, 0, 1000).allowed, true);
  assert.equal(decide(limit, 5, 0, 1000).allowed, false);
});

test("decide: Retry-After counts to the oldest event leaving the window, at least 1", () => {
  assert.equal(decide(limit, 5, 0, 10_000).retryAfterS, 50);
  assert.equal(decide(limit, 5, 0, 59_999).retryAfterS, 1);
  assert.equal(decide(limit, 5, 0, 60_000 - 1).retryAfterS, 1);
  assert.equal(decide(limit, 5, 0, 70_000).retryAfterS, 1);
  assert.equal(decide(limit, 5, null, 5).retryAfterS, 60);
});

test("decide: cost sums are compared as given", () => {
  const gate = { max: 20_000, windowMs: 60_000 };
  assert.equal(decide(gate, 19_999, 0, 1).allowed, true);
  assert.equal(decide(gate, 20_000, 0, 1).allowed, false);
  assert.equal(decide(gate, 35_000, 0, 1).allowed, false);
});

test("take: max succeed in a row, then one is refused with a Retry-After", async () => {
  const t0 = 1_000_000;
  for (let i = 0; i < 5; i++) assert.equal((await take(db, "ai", "seq", 1, limit, t0 + i)).allowed, true);
  const refused = await take(db, "ai", "seq", 1, limit, t0 + 10);
  assert.equal(refused.allowed, false);
  assert.ok(refused.retryAfterS >= 1 && refused.retryAfterS <= 60);
  assert.equal(await count("ai", "seq"), 5, "a refused take leaves no event behind");
});

test("take: 2 x max concurrent takes let exactly max through", async () => {
  const now = 5_000_000;
  const results = await Promise.all(Array.from({ length: 10 }, () => take(db, "tailoring", "burst", 1, limit, now)));
  assert.equal(results.filter((r) => r.allowed).length, 5);
  assert.equal(await count("tailoring", "burst"), 5);
});

test("take: two independent callers share one database and one budget", async () => {
  const callerA = () => Promise.all(Array.from({ length: 5 }, () => take(db, "upload", "shared", 1, limit, 9_000_000)));
  const callerB = () => Promise.all(Array.from({ length: 5 }, () => take(db, "upload", "shared", 1, limit, 9_000_000)));
  const [a, b] = await Promise.all([callerA(), callerB()]);
  assert.equal([...a, ...b].filter((r) => r.allowed).length, 5);
});

test("take: events expire with an injected clock, at the exact window edge", async () => {
  const t0 = 20_000_000;
  for (let i = 0; i < 5; i++) await take(db, "export", "clock", 1, limit, t0);
  assert.equal((await take(db, "export", "clock", 1, limit, t0 + 59_999)).allowed, false);
  assert.equal((await take(db, "export", "clock", 1, limit, t0 + 60_000)).allowed, true);
  assert.equal(await count("export", "clock"), 1, "expired rows are deleted, the new one stays");
});

test("take: subjects and buckets are counted apart", async () => {
  for (let i = 0; i < 5; i++) await take(db, "ai", "one", 1, limit, 30_000_000);
  assert.equal((await take(db, "ai", "one", 1, limit, 30_000_000)).allowed, false);
  assert.equal((await take(db, "ai", "two", 1, limit, 30_000_000)).allowed, true);
  assert.equal((await take(db, "upload", "one", 1, limit, 30_000_000)).allowed, true);
});

test("gateMs: spend records cost, take with cost 0 only checks", async () => {
  const gate = { max: 20_000, windowMs: 60_000 };
  const t0 = 40_000_000;
  assert.equal((await take(db, "gateMs", "u", 0, gate, t0)).allowed, true);
  await spend(db, "gateMs", "u", 12_000, t0);
  assert.equal((await take(db, "gateMs", "u", 0, gate, t0 + 1)).allowed, true);
  await spend(db, "gateMs", "u", 15_000, t0 + 2); // overshoot is accepted
  const refused = await take(db, "gateMs", "u", 0, gate, t0 + 3);
  assert.equal(refused.allowed, false);
  assert.equal(await count("gateMs", "u"), 2, "a check records nothing");
  assert.equal((await take(db, "gateMs", "u", 0, gate, t0 + 60_001)).allowed, true);
});

test("a database error becomes 503 rate_limit_unavailable", async () => {
  const broken = { system: { query: async () => { throw new Error("connection to 10.0.0.1 refused"); } } };
  await assert.rejects(
    failClosed(() => take(broken, "ai", "x", 1, limit)),
    (err) => err instanceof RateLimitUnavailableError && err.status === 503 && err.code === "rate_limit_unavailable" && !/10\.0\.0\.1/.test(err.message),
  );
});

test("no raw address is stored: subjects in the table are what callers pass", async () => {
  const { rows } = await db.system.query("SELECT DISTINCT subject FROM rate_events");
  assert.ok(rows.every((r) => !/^\d+\.\d+\.\d+\.\d+$/.test(r.subject)));
});

const gateSpend = (subject) => (ms) => spend(db, "gateMs", subject, ms);
const gateTotal = async (subject) =>
  Number((await db.system.query("SELECT COALESCE(SUM(cost),0) AS n FROM rate_events WHERE bucket='gateMs' AND subject=$1", [subject])).rows[0].n);
const busy = (ms) => { const end = performance.now() + ms; while (performance.now() < end); };

test("chargeGate records gateMs when the gate work succeeds", async () => {
  const out = await chargeGate(gateSpend("ok"), (timed) => timed(() => { busy(5); return 7; }));
  assert.equal(out, 7);
  assert.ok((await gateTotal("ok")) >= 4);
});

test("chargeGate records gateMs when the gate work throws, and the original error survives", async () => {
  const boom = Object.assign(new Error("blocked"), { status: 409 });
  await assert.rejects(chargeGate(gateSpend("err"), (timed) => timed(() => { busy(5); throw boom; })), (e) => e === boom);
  assert.ok((await gateTotal("err")) >= 4, "the time of a throwing gate is still charged");
});

test("chargeGate: a failed charge on the error path does not mask the original error", async () => {
  const boom = new Error("original");
  const failing = async () => { throw new Error("db down"); };
  await assert.rejects(chargeGate(failing, (timed) => timed(() => { throw boom; })), (e) => e === boom);
});

test("chargeGate: a failed charge on the success path is an error (fail closed)", async () => {
  const failing = async () => { throw new RateLimitUnavailableError(); };
  await assert.rejects(chargeGate(failing, (timed) => timed(() => 1)), (e) => e instanceof RateLimitUnavailableError);
});

test("failClosed logs one line without the cause", async () => {
  const lines = [];
  const orig = console.error;
  console.error = (...a) => lines.push(a.join(" "));
  try {
    await assert.rejects(failClosed(async () => { throw new Error("password=hunter2 host=10.0.0.1"); }));
  } finally {
    console.error = orig;
  }
  assert.deepEqual(lines, ["rate limit store unavailable"]);
});

// ---- sweeping expired rows (P1-29) --------------------------------------------

const DAY = 86_400_000;
let sdb; // isolated database: the shared one holds rows from earlier tests with fake 1970 clocks
before(async () => { sdb = await createDb(); });
after(() => sdb.close());
const ins = (bucket, subject, atMs) =>
  sdb.system.query("INSERT INTO rate_events (bucket, subject, cost, at) VALUES ($1, $2, 1, to_timestamp($3::double precision / 1000))", [bucket, subject, atMs]);
const total = async (prefix) =>
  Number((await sdb.system.query("SELECT COUNT(*) AS n FROM rate_events WHERE subject LIKE $1", [`${prefix}%`])).rows[0].n);

test("the sweep window is the longest window in LIMITS", () => {
  assert.equal(LONGEST_WINDOW_MS, Math.max(...Object.values(LIMITS).map((l) => l.windowMs)));
  assert.equal(LONGEST_WINDOW_MS, 24 * 3_600_000);
});

test("sweep removes only rows older than the longest window, across buckets and subjects", async () => {
  const now = 900 * DAY;
  await ins("ai", "sw-a", now - LONGEST_WINDOW_MS - 1);
  await ins("export", "sw-b", now - 5 * DAY);
  await ins("trialIp", "sw-c", now - LONGEST_WINDOW_MS); // exactly at the edge: expired for every limit
  await ins("ai", "sw-keep1", now - LONGEST_WINDOW_MS + 1);
  await ins("gateMs", "sw-keep2", now - 1000);
  assert.equal(await sweepRateEvents(sdb, { nowMs: now, maxBatches: 10 }), 3);
  assert.equal(await total("sw-a") + (await total("sw-b")) + (await total("sw-c")), 0);
  assert.equal(await total("sw-keep"), 2);
});

test("sweep is bounded: one batch deletes at most `batch` rows, and more batches finish the job", async () => {
  const now = 950 * DAY;
  await sdb.system.query("DELETE FROM rate_events");
  for (let i = 0; i < 10; i++) await ins("ai", `bd-${i}`, now - 3 * DAY);
  assert.equal(await sweepRateEvents(sdb, { nowMs: now, batch: 3 }), 3);
  assert.equal(await total("bd-"), 7);
  assert.equal(await sweepRateEvents(sdb, { nowMs: now, batch: 3, maxBatches: 2 }), 6);
  assert.equal(await total("bd-"), 1);
  assert.equal(await sweepRateEvents(sdb, { nowMs: now, batch: 3, maxBatches: 5 }), 1);
});

test("take sweeps expired rows of other subjects by itself, at most once per interval", async () => {
  const fresh = await createDb();
  try {
    const now = 1000 * DAY;
    const n = async () => Number((await fresh.system.query("SELECT COUNT(*) AS n FROM rate_events WHERE subject LIKE 'op-%'")).rows[0].n);
    await fresh.system.query("INSERT INTO rate_events (bucket, subject, at) VALUES ('ai', 'op-old1', to_timestamp($1::double precision / 1000))", [now - 3 * DAY]);
    await take(fresh, "ai", "op-new", 1, limit, now);
    assert.equal(await n(), 1, "the first take swept op-old1; op-new remains");
    await fresh.system.query("INSERT INTO rate_events (bucket, subject, at) VALUES ('ai', 'op-old2', to_timestamp($1::double precision / 1000))", [now - 3 * DAY]);
    await take(fresh, "ai", "op-new", 1, limit, now + 60_000);
    assert.equal(await n(), 2, "no second sweep within 10 minutes");
    await take(fresh, "ai", "op-new", 1, limit, now + 11 * 60_000);
    assert.equal(await n(), 1, "swept again after the interval; op-new's own row stays");
  } finally {
    await fresh.close();
  }
});

test("take still enforces its limit right after a sweep", async () => {
  const fresh = await createDb();
  try {
    const now = 1100 * DAY;
    await fresh.system.query("INSERT INTO rate_events (bucket, subject, at) VALUES ('ai', 'lim-old', to_timestamp($1::double precision / 1000))", [now - 3 * DAY]);
    const out = [];
    for (let i = 0; i < 7; i++) out.push((await take(fresh, "ai", "lim", 1, limit, now + i)).allowed);
    assert.deepEqual(out, [true, true, true, true, true, false, false]);
  } finally {
    await fresh.close();
  }
});

test("a failing sweep does not fail take", async () => {
  const real = db.system.query.bind(db.system);
  const flaky = { system: { query: (sql, p) => (/DELETE FROM rate_events\s+WHERE id IN/.test(sql) ? Promise.reject(new Error("boom")) : real(sql, p)) } };
  assert.equal((await take(flaky, "ai", "flaky", 1, limit, 1200 * DAY)).allowed, true);
});
