import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { clientIp, emailSubject, ipSubject } from "../src/lib/server/client-ip.mjs";

// http.ts is TypeScript with an "@/" alias. A small resolver hook lets node load it
// as it is, so the 503 test below goes through the real route wrapper.
const src = new URL("../src/", import.meta.url).href;
const hook = `
export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) return next(${JSON.stringify(src)} + specifier.slice(2), context);
  return next(specifier, context);
}`;
register("data:text/javascript," + encodeURIComponent(hook), pathToFileURL("./"));

let route;
before(async () => {
  ({ route } = await import("../src/lib/server/http.ts"));
});

const h = (xff) => new Headers(xff == null ? {} : { "x-forwarded-for": xff });

test("hops 0: the rightmost entry is used and spoofed left entries are ignored", () => {
  assert.equal(clientIp(h("6.6.6.6, 7.7.7.7, 203.0.113.9"), {}), "203.0.113.9");
  assert.equal(clientIp(h("203.0.113.9"), {}), "203.0.113.9");
});

test("hops 1: the second entry from the right", () => {
  const env = { ROLEWRIGHT_TRUSTED_PROXY_HOPS: "1" };
  assert.equal(clientIp(h("6.6.6.6, 203.0.113.9, 10.0.0.1"), env), "203.0.113.9");
  assert.equal(clientIp(h("203.0.113.9"), env), "unknown");
});

test("IPv6 literals are accepted", () => {
  assert.equal(clientIp(h("1.1.1.1, 2001:DB8::1"), {}), "2001:db8::1");
});

test("junk, empty and missing values give unknown", () => {
  for (const v of [null, "", "  ", "not-an-ip", "1.2.3.4:80", "999.1.1.1", "1.1.1.1, <script>", "1.1.1.1,"]) {
    assert.equal(clientIp(h(v), {}), "unknown", String(v));
  }
  assert.equal(clientIp(undefined, {}), "unknown");
});

test("a bad hops setting is treated as 0", () => {
  for (const v of ["x", "-1", "1.5", ""]) {
    assert.equal(clientIp(h("6.6.6.6, 203.0.113.9"), { ROLEWRIGHT_TRUSTED_PROXY_HOPS: v }), "203.0.113.9");
  }
});

test("plain header objects work", () => {
  assert.equal(clientIp({ "x-forwarded-for": "9.9.9.9" }, {}), "9.9.9.9");
});

const KEY_A = "a".repeat(32);
const KEY_B = "b".repeat(32);

test("ipSubject is a keyed hash: 64 hex, not plain SHA-256, never the address", () => {
  const s = ipSubject("203.0.113.9", { ROLEWRIGHT_RATE_LIMIT_KEY: KEY_A });
  assert.match(s, /^[0-9a-f]{64}$/);
  assert.notEqual(s, createHash("sha256").update("203.0.113.9").digest("hex"));
  assert.equal(s, ipSubject("203.0.113.9", { ROLEWRIGHT_RATE_LIMIT_KEY: KEY_A }));
});

test("the key changes the output", () => {
  assert.notEqual(
    ipSubject("203.0.113.9", { ROLEWRIGHT_RATE_LIMIT_KEY: KEY_A }),
    ipSubject("203.0.113.9", { ROLEWRIGHT_RATE_LIMIT_KEY: KEY_B }),
  );
  assert.notEqual(
    emailSubject("a@example.com", { ROLEWRIGHT_RATE_LIMIT_KEY: KEY_A }),
    emailSubject("a@example.com", { ROLEWRIGHT_RATE_LIMIT_KEY: KEY_B }),
  );
});

test("emailSubject ignores case and spaces, and is a keyed hash, not plain SHA-256", () => {
  const env = { ROLEWRIGHT_RATE_LIMIT_KEY: KEY_A };
  assert.equal(emailSubject(" A@Example.com ", env), emailSubject("a@example.com", env));
  assert.notEqual(emailSubject("a@example.com", env), createHash("sha256").update("a@example.com").digest("hex"));
});

test("strict environment: a missing or short key fails closed with 503", () => {
  for (const key of [undefined, "", "short", "x".repeat(31), " ".repeat(32), "x".repeat(31) + "   "]) {
    const env = { NODE_ENV: "production", ROLEWRIGHT_RATE_LIMIT_KEY: key };
    for (const call of [() => ipSubject("1.2.3.4", env), () => emailSubject("a@example.com", env)]) {
      assert.throws(call, (err) => err.status === 503 && err.code === "rate_limit_unavailable");
    }
  }
  assert.match(ipSubject("1.2.3.4", { NODE_ENV: "production", ROLEWRIGHT_RATE_LIMIT_KEY: KEY_A }), /^[0-9a-f]{64}$/);
});

test("non-strict environment falls back to a dev key", () => {
  const a = ipSubject("1.2.3.4", { NODE_ENV: "development" });
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(a, ipSubject("1.2.3.4", {}));
});

test("strict environment without a key: a route answers 503 rate_limit_unavailable, not 500", async () => {
  const handler = route("test.client-ip", async () => {
    ipSubject("1.2.3.4", { NODE_ENV: "production" });
    return new Response("unreachable");
  });
  const saved = console.error;
  const savedWarn = console.warn;
  console.error = () => {};
  console.warn = () => {};
  let res;
  try {
    res = await handler(new Request("http://localhost/api/test"), { params: Promise.resolve({}) });
  } finally {
    console.error = saved;
    console.warn = savedWarn;
  }
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.equal(body.error.code, "rate_limit_unavailable");
  assert.equal(body.error.message, "Rolewright could not check its usage limits just now. Try again in a moment.");
});
