// P2-1: event analytics (ADR 0010, 0016). Allowlisted props only, row-level isolation, append-only
// for the app role, cascade on user delete, a tracker that never throws, and the routes pass
// no request text.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDb } from "../src/lib/db/index.mjs";
import { recordEvent, listEvents } from "../src/lib/db/events.mjs";
import { track } from "../src/lib/server/track.mjs";

let db;
let n = 0;
const addUser = async () => (await db.system.query("INSERT INTO users (email) VALUES ($1) RETURNING id", [`e${++n}@example.com`])).rows[0].id;
before(async () => { db = await createDb(); });
after(async () => { await db.close(); });

test("a valid event is stored with its props and listed for its owner", async () => {
  const a = await addUser();
  await recordEvent(db, a, "export_succeeded", { coverage_before: 40, coverage_after: 72 });
  await recordEvent(db, a, "resume_uploaded", { provider: "trial" });
  await recordEvent(db, a, "export_blocked", { reason: "fact_gate" });
  await recordEvent(db, a, "tailoring_created");
  const rows = await listEvents(db, a);
  assert.deepEqual(rows.map((r) => r.name).sort(), ["export_blocked", "export_succeeded", "resume_uploaded", "tailoring_created"]);
  assert.deepEqual(rows.find((r) => r.name === "export_succeeded").props, { coverage_before: 40, coverage_after: 72 });
});

test("an unknown name, an unknown key, a free-text value and out-of-range or non-integer numbers are refused", async () => {
  const a = await addUser();
  const bad = [
    ["login", {}],
    ["resume_uploaded", { email: "x@example.com" }],
    ["resume_uploaded", { provider: "Jane Doe, Acme Corp" }],
    ["resume_uploaded", { provider: 5 }],
    ["export_blocked", { reason: "because the resume said Python" }],
    ["export_succeeded", { coverage_before: 101 }],
    ["export_succeeded", { coverage_after: -1 }],
    ["export_succeeded", { coverage_before: 50.5 }],
    ["export_succeeded", { coverage_before: "50" }],
    ["export_succeeded", { __proto__: null, toString: 1 }],
    ["export_succeeded", []],
  ];
  for (const [name, props] of bad) {
    await assert.rejects(() => recordEvent(db, a, name, props), TypeError, JSON.stringify([name, props]));
  }
  assert.equal((await listEvents(db, a)).length, 0);
});

test("user B reads none of A's events", async () => {
  const a = await addUser();
  const b = await addUser();
  await recordEvent(db, a, "tailoring_created", { provider: "trial" });
  assert.deepEqual(await listEvents(db, b), []);
  const { rows } = await db.withUser(b, (q) => q.query("SELECT count(*)::int AS n FROM events"));
  assert.equal(rows[0].n, 0);
  // B cannot write a row for A either.
  await assert.rejects(() => db.withUser(b, (q) => q.query("INSERT INTO events (user_id, name) VALUES ($1, 'export_blocked')", [a])));
});

test("the app role cannot UPDATE or DELETE events", async () => {
  const a = await addUser();
  await recordEvent(db, a, "tailoring_created");
  await assert.rejects(() => db.withUser(a, (q) => q.query("UPDATE events SET name = 'export_blocked'")), /permission denied/);
  await assert.rejects(() => db.withUser(a, (q) => q.query("DELETE FROM events")), /permission denied/);
  assert.equal((await listEvents(db, a)).length, 1);
});

test("deleting the user removes their events", async () => {
  const a = await addUser();
  await recordEvent(db, a, "resume_uploaded", { provider: "trial" });
  await db.system.query("DELETE FROM users WHERE id = $1", [a]);
  const { rows } = await db.system.query("SELECT count(*)::int AS n FROM events WHERE user_id = $1", [a]);
  assert.equal(rows[0].n, 0);
});

test("track swallows a database failure and logs only the event name", async () => {
  const logged = [];
  const orig = console.warn;
  console.warn = (...args) => logged.push(args.join(" "));
  try {
    const secret = "postgres://user:SECRETPASSWORD@host/db";
    const broken = { withUser: async () => { throw new Error(`connection to ${secret} failed`); } };
    assert.equal(await track("11111111-1111-4111-8111-111111111111", "export_blocked", { reason: "fact_gate" }, { db: broken }), undefined);
    // A refused prop is swallowed too.
    await track("11111111-1111-4111-8111-111111111111", "export_blocked", { reason: "free text" }, { db });
    await track("not-a-uuid", "export_blocked", {}, { db });
    assert.ok(logged.length >= 3);
    for (const line of logged) {
      assert.ok(!line.includes("SECRETPASSWORD") && !line.includes("free text"), line);
      assert.match(line, /export_blocked/);
    }
  } finally {
    console.warn = orig;
  }
});

test("track records an event through a working database", async () => {
  const a = await addUser();
  await track(a, "tailoring_created", { provider: "trial" }, { db });
  assert.equal((await listEvents(db, a)).length, 1);
});

test("the three routes pass no string from the request other than the provider id", () => {
  const src = (p) => readFileSync(new URL(`../src/app/api/${p}`, import.meta.url), "utf8");
  const files = ["resume/route.ts", "tailorings/route.ts", "tailorings/[id]/export/route.ts"];
  let calls = 0;
  for (const f of files) {
    for (const m of src(f).matchAll(/\btrack\(([^;]*)\);/g)) {
      calls++;
      const args = m[1];
      assert.match(args, /^userId, "(resume_uploaded|tailoring_created|export_succeeded|export_blocked)"(, (\{ provider: llm\.provider \}|\{ reason: "(fact_gate|facts_too_large|nothing_confirmed)" \}|props))?$/, `${f}: ${args}`);
    }
  }
  assert.equal(calls, 6);
});
