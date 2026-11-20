import { test } from "node:test";
import assert from "node:assert/strict";
import { assertDbEnv, getDb } from "../src/lib/db/index.mjs";
import { UnsafeEnvironmentError } from "../src/lib/server/env-guard.mjs";

const DIR = "/srv/app/.data/pglite";

test("a deployed host with no DATABASE_URL is refused before any database opens", () => {
  for (const env of [{ K_SERVICE: "web" }, { ROLEWRIGHT_DEPLOYED: "1" }, { NODE_ENV: "production", K_SERVICE: "web" }, { NODE_ENV: "development", K_SERVICE: "web" }]) {
    assert.throws(() => assertDbEnv(env, DIR, () => {}), (e) => e instanceof UnsafeEnvironmentError && /DATABASE_URL/.test(e.message));
  }
});

test("a deployed host with a DATABASE_URL is fine", () => {
  assert.doesNotThrow(() => assertDbEnv({ K_SERVICE: "web", DATABASE_URL: "postgres://x" }, DIR, () => {}));
});

test("production that is not deployed warns once about the embedded database, naming its directory", () => {
  const warnings = [];
  assertDbEnv({ NODE_ENV: "production" }, DIR, (m) => warnings.push(m));
  assert.equal(warnings.length, 1);
  assert.ok(warnings[0].includes(DIR));
  assertDbEnv({ NODE_ENV: "production" }, DIR, (m) => warnings.push(m));
  assert.equal(warnings.length, 1);
});

test("development and test with no DATABASE_URL neither throw nor warn", () => {
  const warnings = [];
  for (const NODE_ENV of ["development", "test", undefined]) assert.doesNotThrow(() => assertDbEnv({ NODE_ENV }, DIR, (m) => warnings.push(m)));
  assert.deepEqual(warnings, []);
});

test("getDb throws on a deployed host without DATABASE_URL and opens nothing", () => {
  const key = Symbol.for("rolewright.db");
  const savedDb = globalThis[key];
  const savedUrl = process.env.DATABASE_URL;
  const savedK = process.env.K_SERVICE;
  delete globalThis[key];
  delete process.env.DATABASE_URL;
  process.env.K_SERVICE = "web";
  try {
    assert.throws(() => getDb(), UnsafeEnvironmentError);
    assert.equal(globalThis[key], undefined);
  } finally {
    if (savedUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = savedUrl;
    if (savedK === undefined) delete process.env.K_SERVICE;
    else process.env.K_SERVICE = savedK;
    if (savedDb) globalThis[key] = savedDb;
  }
});
