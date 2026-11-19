// handlePurge with an injected verifier and database: no network.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDb } from "../src/lib/db/index.mjs";
import * as repo from "../src/lib/db/repo.mjs";
import { handlePurge } from "../src/lib/server/purge-endpoint.mjs";

let db;
before(async () => { db = await createDb(); });
after(async () => { await db.close(); });

const ENV = { ROLEWRIGHT_PURGE_AUDIENCE: "https://rolewright.example", ROLEWRIGHT_PURGE_SERVICE_ACCOUNT: "p@x.iam.gserviceaccount.com" };
const req = (token) => new Request("https://rolewright.example/api/internal/purge", { method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {} });
const verifyOk = async () => ({ ok: true });
const verifyBad = async () => { throw new Error("bad"); };
const monthsAgo = (m) => { const d = new Date(); d.setUTCMonth(d.getUTCMonth() - m); return d.toISOString(); };
async function seed(email, lastSeen) {
  const u = await repo.upsertUserByEmail(db, { email });
  await db.system.query("UPDATE users SET last_seen_at = $2 WHERE id = $1", [u.id, lastSeen]);
  return u;
}
const exists = async (id) => (await db.system.query("SELECT count(*)::int AS n FROM users WHERE id = $1", [id])).rows[0].n === 1;

test("unconfigured env is refused with 401 and nothing is deleted", async () => {
  const old = await seed("e-old@example.com", monthsAgo(13));
  for (const env of [{}, { ROLEWRIGHT_PURGE_AUDIENCE: ENV.ROLEWRIGHT_PURGE_AUDIENCE }, { ROLEWRIGHT_PURGE_SERVICE_ACCOUNT: ENV.ROLEWRIGHT_PURGE_SERVICE_ACCOUNT }]) {
    const res = await handlePurge(req("tok"), { env, db, verify: verifyOk });
    assert.equal(res.status, 401);
  }
  assert.equal(await exists(old.id), true);
});

test("a missing or rejected token is a generic 401", async () => {
  const a = await handlePurge(req(), { env: ENV, db, verify: verifyOk });
  const b = await handlePurge(req("tok"), { env: ENV, db, verify: verifyBad });
  assert.equal(a.status, 401);
  assert.equal(b.status, 401);
  assert.deepEqual(await a.json(), await b.json());
});

test("a valid token purges the user idle 13 months, keeps the 11-month one, returns the count only", async () => {
  await db.system.query("DELETE FROM users");
  const old = await seed("v-old@example.com", monthsAgo(13));
  const recent = await seed("v-recent@example.com", monthsAgo(11));
  const res = await handlePurge(req("tok"), { env: ENV, db, verify: verifyOk });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { purged: 1 });
  assert.equal(await exists(old.id), false);
  assert.equal(await exists(recent.id), true);
});
