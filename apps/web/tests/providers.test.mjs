import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { LlmError } from "../src/lib/llm/errors.mjs";
import { complete, isProviderAllowed, launchProviders, verifyKey } from "../src/lib/llm/providers.mjs";

const saved = { extra: process.env.ROLEWRIGHT_EXTRA_PROVIDERS, mock: process.env.ROLEWRIGHT_ALLOW_MOCK_LLM, node: process.env.NODE_ENV };
afterEach(() => {
  for (const [k, v] of [["ROLEWRIGHT_EXTRA_PROVIDERS", saved.extra], ["ROLEWRIGHT_ALLOW_MOCK_LLM", saved.mock], ["NODE_ENV", saved.node]]) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const ids = (env) => launchProviders(env).map((p) => p.id);

test("with no env, only gemini, openrouter and anthropic are offered, in that order", () => {
  delete process.env.ROLEWRIGHT_EXTRA_PROVIDERS;
  assert.deepEqual(ids(), ["gemini", "openrouter", "anthropic"]);
  assert.deepEqual(ids({}), ["gemini", "openrouter", "anthropic"]);
  assert.equal(isProviderAllowed("gemini"), true);
  assert.equal(isProviderAllowed("openrouter"), true);
  assert.equal(isProviderAllowed("anthropic"), true);
  assert.equal(isProviderAllowed("openai"), false);
  assert.equal(isProviderAllowed("groq"), false);
});

test("ROLEWRIGHT_EXTRA_PROVIDERS adds only the named providers; unknown names are ignored", () => {
  process.env.ROLEWRIGHT_EXTRA_PROVIDERS = "openai";
  assert.deepEqual(ids(), ["gemini", "openrouter", "anthropic", "openai"]);
  assert.equal(isProviderAllowed("openai"), true);
  assert.equal(isProviderAllowed("groq"), false);

  process.env.ROLEWRIGHT_EXTRA_PROVIDERS = " Groq , nope, mock, ,openai ,openai";
  assert.deepEqual(ids(), ["gemini", "openrouter", "anthropic", "openai", "groq"]);
  assert.equal(isProviderAllowed("nope"), false);

  process.env.ROLEWRIGHT_EXTRA_PROVIDERS = "nope,mock";
  assert.deepEqual(ids(), ["gemini", "openrouter", "anthropic"]);
  assert.equal(isProviderAllowed("mock"), false);
});

test("verifyKey and complete refuse a hidden provider before any fetch", async () => {
  delete process.env.ROLEWRIGHT_EXTRA_PROVIDERS;
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response("{}"); };
  try {
    for (const provider of ["openai", "groq"]) {
      await assert.rejects(verifyKey({ provider, key: "sk-test-abcdef123456" }), (e) => e instanceof LlmError && e.code === "not_allowed");
      await assert.rejects(complete({ provider, key: "sk-test-abcdef123456", model: "m", system: "s", user: "u" }), (e) => e instanceof LlmError && e.code === "not_allowed");
    }
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(calls, 0);
});

test("the mock provider rules are unchanged", () => {
  delete process.env.ROLEWRIGHT_ALLOW_MOCK_LLM;
  assert.equal(isProviderAllowed("mock"), false);
  process.env.ROLEWRIGHT_ALLOW_MOCK_LLM = "1";
  process.env.NODE_ENV = "production";
  assert.equal(isProviderAllowed("mock"), false);
  process.env.NODE_ENV = "test";
  assert.equal(isProviderAllowed("mock"), true);
  assert.deepEqual(ids(), ["gemini", "openrouter", "anthropic"]);
});
