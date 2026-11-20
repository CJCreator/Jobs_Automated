// verifyGoogleOidc: RS256 only, with an injected key set (no network).
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createSign } from "node:crypto";
import { verifyGoogleOidc, createKeyFetcher } from "../src/lib/server/oidc.mjs";

const AUD = "https://rolewright.example";
const EMAIL = "purge@proj.iam.gserviceaccount.com";
const NOW = 1_800_000_000_000;
const b64 = (v) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");

const good = generateKeyPairSync("rsa", { modulusLength: 2048 });
const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...good.publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256", use: "sig" };
const getKeys = async () => ({ keys: [jwk] });

function sign(payload = {}, { header = {}, key = good.privateKey } = {}) {
  const h = b64({ alg: "RS256", typ: "JWT", kid: "k1", ...header });
  const p = b64({ iss: "https://accounts.google.com", aud: AUD, email: EMAIL, email_verified: true, iat: NOW / 1000 - 10, exp: NOW / 1000 + 3000, ...payload });
  const sig = createSign("RSA-SHA256").update(`${h}.${p}`).sign(key).toString("base64url");
  return `${h}.${p}.${sig}`;
}
const opts = { audience: AUD, email: EMAIL, getKeys, now: () => NOW };
const ok = (t) => verifyGoogleOidc(t, opts);

test("a valid token passes, with either Google issuer", async () => {
  assert.ok(await ok(sign()));
  assert.ok(await ok(sign({ iss: "accounts.google.com" })));
});

test("every bad token is refused", async () => {
  const hs = (() => {
    const h = b64({ alg: "HS256", typ: "JWT", kid: "k1" });
    const p = b64({ iss: "https://accounts.google.com", aud: AUD, email: EMAIL, email_verified: true, exp: NOW / 1000 + 3000, iat: NOW / 1000 });
    return `${h}.${p}.${b64("x")}`;
  })();
  const none = `${b64({ alg: "none", kid: "k1" })}.${b64({ iss: "accounts.google.com", aud: AUD, email: EMAIL, email_verified: true, exp: NOW / 1000 + 3000 })}.`;
  const cases = {
    "no token": undefined,
    empty: "",
    malformed: "abc.def",
    "not json": "a.b.c",
    "alg none": none,
    "alg HS256": hs,
    "unknown kid": sign({}, { header: { kid: "zzz" } }),
    "bad signature": sign({}, { key: other.privateKey }),
    expired: sign({ exp: NOW / 1000 - 1 }),
    "issued in the future": sign({ iat: NOW / 1000 + 120 }),
    "signature with padding": `${sign()}==`,
    "nbf in the future": sign({ nbf: NOW / 1000 + 120 }),
    "nbf not a number": sign({ nbf: "0" }),
    "wrong aud": sign({ aud: "https://evil.example" }),
    "wrong iss": sign({ iss: "https://evil.example" }),
    "wrong email": sign({ email: "other@proj.iam.gserviceaccount.com" }),
    "email_verified false": sign({ email_verified: false }),
  };
  for (const [name, token] of Object.entries(cases)) {
    await assert.rejects(() => ok(token), undefined, name);
  }
});

test("a getKeys that throws refuses the token", async () => {
  await assert.rejects(() => verifyGoogleOidc(sign(), { ...opts, getKeys: async () => { throw new Error("offline"); } }));
});

test("a token whose nbf is in the past passes", async () => {
  assert.ok(await ok(sign({ nbf: NOW / 1000 - 5 })));
});

function fakeFetch(responses) {
  const calls = { n: 0 };
  const impl = async (_url, init) => {
    calls.n += 1;
    calls.init = init;
    const r = responses.shift();
    if (r instanceof Error) throw r;
    return { ok: r.ok ?? true, json: async () => r.body, headers: new Headers({ "cache-control": r.cc ?? "public, max-age=100" }) };
  };
  return { impl, calls };
}
const KEYS = { keys: [{ kid: "k1", kty: "RSA" }] };

test("key cache: caches for max-age, fetches with no-store, then refetches", async () => {
  let t = 0;
  const f = fakeFetch([{ body: KEYS }, { body: KEYS }]);
  const get = createKeyFetcher({ fetchImpl: f.impl, now: () => t });
  await get();
  await get();
  assert.equal(f.calls.n, 1);
  assert.equal(f.calls.init.cache, "no-store");
  t = 101_000;
  await get();
  assert.equal(f.calls.n, 2);
});

test("key cache: max-age is capped at one day", async () => {
  let t = 0;
  const f = fakeFetch([{ body: KEYS, cc: "max-age=999999999" }, { body: KEYS }]);
  const get = createKeyFetcher({ fetchImpl: f.impl, now: () => t });
  await get();
  t = 86_400_000 + 1;
  await get();
  assert.equal(f.calls.n, 2);
});

test("key cache: an empty or malformed set is not cached and counts as a failure", async () => {
  let t = 0;
  const f = fakeFetch([{ body: { keys: [] } }, { body: KEYS }]);
  const get = createKeyFetcher({ fetchImpl: f.impl, now: () => t });
  await assert.rejects(get);
  t = 61_000;
  assert.deepEqual(await get(), KEYS);
  assert.equal(f.calls.n, 2);
});

test("key cache: concurrent callers share one fetch", async () => {
  const f = fakeFetch([{ body: KEYS }]);
  const get = createKeyFetcher({ fetchImpl: f.impl, now: () => 0 });
  await Promise.all([get(), get(), get()]);
  assert.equal(f.calls.n, 1);
});

test("key cache: after a failed fetch it refuses without refetching until the backoff ends", async () => {
  let t = 0;
  const f = fakeFetch([new Error("down"), { body: KEYS }]);
  const get = createKeyFetcher({ fetchImpl: f.impl, now: () => t });
  await assert.rejects(get);
  t = 20_000;
  await assert.rejects(get);
  assert.equal(f.calls.n, 1);
  t = 61_000;
  await get();
  assert.equal(f.calls.n, 2);
});
