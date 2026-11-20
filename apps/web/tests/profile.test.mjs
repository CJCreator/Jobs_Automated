import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDb } from "../src/lib/db/index.mjs";
import { SEGMENTS, getSegment, setSegment } from "../src/lib/db/profile.mjs";

let db;
let A;
let B;
const addUser = async (email) => (await db.system.query("INSERT INTO users (email) VALUES ($1) RETURNING id", [email])).rows[0].id;

before(async () => {
  db = await createDb();
  A = await addUser("a@example.com");
  B = await addUser("b@example.com");
});
after(() => db.close());

test("the segment is empty until chosen, then set, get and clear work", async () => {
  assert.equal(await getSegment(db, A), null);
  for (const s of SEGMENTS) {
    await setSegment(db, A, s);
    assert.equal(await getSegment(db, A), s);
  }
  await setSegment(db, A, null);
  assert.equal(await getSegment(db, A), null);
});

test("an invalid value is refused and changes nothing", async () => {
  await setSegment(db, A, "fresher");
  for (const bad of ["student", "", "FRESHER", undefined, 1, {}, ["fresher"]]) {
    await assert.rejects(setSegment(db, A, bad), TypeError);
  }
  assert.equal(await getSegment(db, A), "fresher");
  await assert.rejects(db.system.query("UPDATE users SET segment = 'other' WHERE id = $1", [A]), /check constraint/);
});

test("A's write leaves B unchanged", async () => {
  await setSegment(db, B, "switcher");
  await setSegment(db, A, "experienced");
  assert.equal(await getSegment(db, B), "switcher");
  await setSegment(db, A, null);
  assert.equal(await getSegment(db, B), "switcher");
});

test("SQL-shaped input is stored nowhere", async () => {
  const evil = "fresher'; DROP TABLE users; --";
  await assert.rejects(setSegment(db, A, evil), TypeError);
  assert.equal(await getSegment(db, A), null);
  assert.equal((await db.system.query("SELECT count(*)::int AS n FROM users")).rows[0].n, 2);
  assert.equal((await db.system.query("SELECT count(*)::int AS n FROM users WHERE segment IS NOT NULL")).rows[0].n, 1);
});
