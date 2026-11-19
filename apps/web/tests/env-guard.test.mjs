import { test } from "node:test";
import assert from "node:assert/strict";
import { UnsafeEnvironmentError, assertSafeEnv, devLoginEnabled, isDeployed, strictEnv, unsafeEnvProblems } from "../src/lib/server/env-guard.mjs";

const SECRET = "a-real-secret-0123456789abcdef0123456789";
const prod = (extra = {}) => ({ NODE_ENV: "production", AUTH_SECRET: SECRET, ...extra });

test("a normal production environment passes", () => {
  assert.doesNotThrow(() => assertSafeEnv(prod()));
  assert.deepEqual(unsafeEnvProblems(prod()), []);
});

test("the development sign-in is refused in production", () => {
  assert.throws(() => assertSafeEnv(prod({ ROLEWRIGHT_DEV_LOGIN: "1" })), (err) => {
    assert.ok(err instanceof UnsafeEnvironmentError);
    assert.match(err.message, /ROLEWRIGHT_DEV_LOGIN=1/);
    return true;
  });
});

test("the mock AI provider is refused in production", () => {
  assert.throws(() => assertSafeEnv(prod({ ROLEWRIGHT_ALLOW_MOCK_LLM: "1" })), /ROLEWRIGHT_ALLOW_MOCK_LLM=1/);
});

test("a missing or blank AUTH_SECRET is refused in production", () => {
  assert.throws(() => assertSafeEnv({ NODE_ENV: "production" }), /AUTH_SECRET/);
  assert.throws(() => assertSafeEnv(prod({ AUTH_SECRET: "   " })), /AUTH_SECRET/);
});

test("every problem is named at once, so one restart fixes them all", () => {
  const problems = unsafeEnvProblems({ NODE_ENV: "production", ROLEWRIGHT_DEV_LOGIN: "1", ROLEWRIGHT_ALLOW_MOCK_LLM: "1" });
  assert.equal(problems.length, 3);
});

test("development and test runs are not affected by the flags or a missing secret", () => {
  for (const NODE_ENV of ["development", "test", undefined]) {
    assert.doesNotThrow(() => assertSafeEnv({ NODE_ENV, ROLEWRIGHT_DEV_LOGIN: "1", ROLEWRIGHT_ALLOW_MOCK_LLM: "1" }));
  }
});

test("`next build` (NODE_ENV=production in the build phase) is not broken, with or without the flags", () => {
  const build = { NODE_ENV: "production", NEXT_PHASE: "phase-production-build" };
  assert.doesNotThrow(() => assertSafeEnv(build));
  assert.doesNotThrow(() => assertSafeEnv({ ...build, ROLEWRIGHT_DEV_LOGIN: "1" }));
});

test("the production server phase is checked", () => {
  assert.throws(() => assertSafeEnv({ NODE_ENV: "production", NEXT_PHASE: "phase-production-server" }), /AUTH_SECRET/);
});

test("only the exact value 1 turns a flag on", () => {
  assert.doesNotThrow(() => assertSafeEnv(prod({ ROLEWRIGHT_DEV_LOGIN: "0", ROLEWRIGHT_ALLOW_MOCK_LLM: "" })));
});

test("the message never repeats the secret", () => {
  assert.throws(() => assertSafeEnv(prod({ ROLEWRIGHT_DEV_LOGIN: "1" })), (err) => !err.message.includes(SECRET));
});

// P0-7: a deployed host is strict whatever NODE_ENV says.
const DB = "postgres://rolewright_login:pw@db.example/rolewright";
const NODE_ENVS = ["production", "development", undefined];
const DEPLOYS = [
  ["K_SERVICE", { K_SERVICE: "web" }],
  ["ROLEWRIGHT_DEPLOYED", { ROLEWRIGHT_DEPLOYED: "1" }],
  ["neither", {}],
];

test("deployed host x NODE_ENV x flag table", () => {
  for (const NODE_ENV of NODE_ENVS) {
    for (const [label, deploy] of DEPLOYS) {
      const deployed = label !== "neither";
      const base = { NODE_ENV, ...deploy };
      const where = `${NODE_ENV} / ${label}`;
      const has = (env, re) => unsafeEnvProblems(env).some((p) => re.test(p));
      const safe = { ...base, AUTH_SECRET: SECRET, DATABASE_URL: DB };
      assert.equal(isDeployed(base), deployed, where);
      assert.equal(strictEnv(base), deployed || NODE_ENV === "production", where);
      assert.equal(has({ ...safe, ROLEWRIGHT_DEV_LOGIN: "1" }, /ROLEWRIGHT_DEV_LOGIN/), strictEnv(base), where);
      assert.equal(has({ ...safe, ROLEWRIGHT_ALLOW_MOCK_LLM: "1" }, /ROLEWRIGHT_ALLOW_MOCK_LLM/), strictEnv(base), where);
      assert.equal(has({ ...base, DATABASE_URL: DB }, /AUTH_SECRET/), strictEnv(base), where);
      assert.equal(has({ ...base, AUTH_SECRET: SECRET }, /DATABASE_URL/), deployed, where);
      assert.equal(devLoginEnabled({ ...base, ROLEWRIGHT_DEV_LOGIN: "1" }), !strictEnv(base), where);
      assert.equal(devLoginEnabled(base), false, where);
    }
  }
});

test("the reported repro: development NODE_ENV on a deployed host is refused", () => {
  const env = { NODE_ENV: "development", K_SERVICE: "web", ROLEWRIGHT_DEV_LOGIN: "1" };
  assert.ok(unsafeEnvProblems(env).length >= 1);
  assert.throws(() => assertSafeEnv(env), /ROLEWRIGHT_DEV_LOGIN/);
});

test("production that is not deployed has today's three problems and no DATABASE_URL problem", () => {
  const problems = unsafeEnvProblems({ NODE_ENV: "production", ROLEWRIGHT_DEV_LOGIN: "1", ROLEWRIGHT_ALLOW_MOCK_LLM: "1" });
  assert.equal(problems.length, 3);
  assert.ok(!problems.some((p) => /DATABASE_URL/.test(p)));
});

test("deployed with nothing set reports all four problems", () => {
  assert.equal(unsafeEnvProblems({ K_SERVICE: "web", ROLEWRIGHT_DEV_LOGIN: "1", ROLEWRIGHT_ALLOW_MOCK_LLM: "1" }).length, 4);
});

test("the build phase is still skipped, even when deployed", () => {
  assert.deepEqual(unsafeEnvProblems({ NODE_ENV: "production", K_SERVICE: "web", NEXT_PHASE: "phase-production-build" }), []);
  assert.deepEqual(unsafeEnvProblems({ K_SERVICE: "web", ROLEWRIGHT_DEV_LOGIN: "1", NEXT_PHASE: "phase-production-build" }), []);
});

test("only 1 turns ROLEWRIGHT_DEPLOYED on; any non-empty K_SERVICE counts", () => {
  for (const v of ["0", "true", "yes", "", "2"]) assert.equal(isDeployed({ ROLEWRIGHT_DEPLOYED: v }), false, v);
  assert.equal(isDeployed({ ROLEWRIGHT_DEPLOYED: "1" }), true);
  assert.equal(isDeployed({ K_SERVICE: "x" }), true);
  assert.equal(isDeployed({ K_SERVICE: "" }), false);
  assert.equal(isDeployed({}), false);
});

test("deployed never comes from a request header", () => {
  assert.equal(isDeployed({ "x-forwarded-host": "app.example", "x-rolewright-deployed": "1", host: "app.example" }), false);
});
