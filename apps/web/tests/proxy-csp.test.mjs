import { test, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

// proxy.ts is TypeScript with a "next/server" import and an "@/" alias. A small
// resolver hook lets node load it as it is, so the test reads the real policy.
const src = new URL("../src/", import.meta.url).href;
const hook = `
export async function resolve(specifier, context, next) {
  if (specifier === "next/server") return next("next/server.js", context);
  if (specifier.startsWith("@/")) return next(${JSON.stringify(src)} + specifier.slice(2), context);
  return next(specifier, context);
}`;
register("data:text/javascript," + encodeURIComponent(hook), pathToFileURL("./"));

let proxy;
before(async () => {
  ({ proxy } = await import("../src/proxy.ts"));
});

const KEYS = ["NODE_ENV", "K_SERVICE", "ROLEWRIGHT_DEPLOYED"];

/** Runs the proxy with exactly this environment and returns the policy it sets. */
function cspFor(env) {
  const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, env);
  try {
    const res = proxy(new Request("http://localhost/app"));
    return res.headers.get("Content-Security-Policy");
  } finally {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

const relaxed = (csp) => csp.includes("'unsafe-eval'") || /connect-src[^;]*\bws:/.test(csp);

test("a developer machine gets the relaxed policy", () => {
  assert.ok(relaxed(cspFor({ NODE_ENV: "development" })));
  assert.ok(relaxed(cspFor({})));
});

test("production is strict", () => {
  assert.equal(relaxed(cspFor({ NODE_ENV: "production" })), false);
});

test("a deployed host is strict whatever NODE_ENV says", () => {
  for (const nodeEnv of ["development", "test", undefined]) {
    const base = nodeEnv ? { NODE_ENV: nodeEnv } : {};
    assert.equal(relaxed(cspFor({ ...base, K_SERVICE: "web" })), false, `K_SERVICE, NODE_ENV=${nodeEnv}`);
    assert.equal(relaxed(cspFor({ ...base, ROLEWRIGHT_DEPLOYED: "1" })), false, `ROLEWRIGHT_DEPLOYED, NODE_ENV=${nodeEnv}`);
  }
});

test("the strict policy never allows inline or eval scripts", () => {
  const csp = cspFor({ NODE_ENV: "development", K_SERVICE: "web" });
  const script = csp.split("; ").find((d) => d.startsWith("script-src"));
  assert.match(script, /'nonce-/);
  assert.doesNotMatch(script, /unsafe-/);
});
