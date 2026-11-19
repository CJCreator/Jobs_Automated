import { test } from "node:test";
import assert from "node:assert/strict";
import { UnsafeEnvironmentError, assertSafeEnv, unsafeEnvProblems } from "../src/lib/server/env-guard.mjs";

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
