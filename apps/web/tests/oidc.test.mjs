// verifyGoogleOidc: RS256 only, with an injected key set (no network).
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createSign } from "node:crypto";
import { verifyGoogleOidc } from "../src/lib/server/oidc.mjs";

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
