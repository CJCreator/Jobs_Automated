import { test } from "node:test";
import assert from "node:assert/strict";
import { clientIp, ipSubject } from "../src/lib/server/client-ip.mjs";

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

test("ipSubject is a SHA-256 hex and never the address", () => {
  const s = ipSubject("203.0.113.9");
  assert.match(s, /^[0-9a-f]{64}$/);
  assert.ok(!s.includes("203"));
  assert.equal(s, ipSubject("203.0.113.9"));
});
