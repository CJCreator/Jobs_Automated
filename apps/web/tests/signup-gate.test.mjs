import { test } from "node:test";
import assert from "node:assert/strict";
import { maySignIn, parseAllowlist, signupMode } from "../src/lib/server/signup-gate.mjs";

const prod = (extra = {}) => ({ NODE_ENV: "production", ...extra });
const list = (v, extra = {}) => ({ ROLEWRIGHT_SIGNUPS: "allowlist", ROLEWRIGHT_SIGNUP_ALLOWLIST: v, ...extra });
const NEW = (email) => ({ email, existingUser: false });
const OLD = (email) => ({ email, existingUser: true });

test("signupMode: unset or unknown is allowlist when strict, open otherwise", () => {
  assert.equal(signupMode(prod()), "allowlist");
  assert.equal(signupMode(prod({ ROLEWRIGHT_SIGNUPS: "maybe" })), "allowlist");
  assert.equal(signupMode({ ROLEWRIGHT_DEPLOYED: "1" }), "allowlist");
  assert.equal(signupMode({}), "open");
  assert.equal(signupMode({ ROLEWRIGHT_SIGNUPS: "maybe" }), "open");
});

test("signupMode: the three named modes win, whatever the environment", () => {
  for (const m of ["closed", "allowlist", "open"]) {
    assert.equal(signupMode(prod({ ROLEWRIGHT_SIGNUPS: m })), m);
    assert.equal(signupMode({ ROLEWRIGHT_SIGNUPS: ` ${m.toUpperCase()} ` }), m);
  }
});

test("parseAllowlist: trims, lower-cases and drops malformed entries", () => {
  const env = { ROLEWRIGHT_SIGNUP_ALLOWLIST: " A@Example.com , @Corp.IN,,notanaddress,@nodot,two@@x.com,a b@x.com, @ " };
  assert.deepEqual(parseAllowlist(env), ["a@example.com", "@corp.in"]);
  assert.deepEqual(parseAllowlist({}), []);
});

test("open admits anyone with an address", () => {
  const env = { ROLEWRIGHT_SIGNUPS: "open" };
  assert.equal(maySignIn(NEW("x@y.com"), env), true);
  assert.equal(maySignIn(OLD("x@y.com"), env), true);
});

test("closed admits existing users only", () => {
  const env = { ROLEWRIGHT_SIGNUPS: "closed", ROLEWRIGHT_SIGNUP_ALLOWLIST: "x@y.com" };
  assert.equal(maySignIn(OLD("x@y.com"), env), true);
  assert.equal(maySignIn(NEW("x@y.com"), env), false);
});

test("allowlist admits listed addresses, new or existing, and nobody else", () => {
  const env = list("a@example.com");
  assert.equal(maySignIn(NEW("a@example.com"), env), true);
  assert.equal(maySignIn(OLD("a@example.com"), env), true);
  assert.equal(maySignIn(NEW("b@example.com"), env), false);
  assert.equal(maySignIn(OLD("b@example.com"), env), false);
});

test("allowlist ignores case and whitespace in both the list and the address", () => {
  const env = list("  Alice@Example.COM ,@Corp.in");
  assert.equal(maySignIn(NEW("  ALICE@example.com "), env), true);
  assert.equal(maySignIn(NEW("Bob@CORP.IN"), env), true);
});

test("a domain entry does not match look-alike domains or subdomains", () => {
  const env = list("@example.com");
  assert.equal(maySignIn(NEW("a@example.com"), env), true);
  assert.equal(maySignIn(NEW("a@evil-example.com"), env), false);
  assert.equal(maySignIn(NEW("a@example.com.evil.org"), env), false);
  assert.equal(maySignIn(NEW("a@mail.example.com"), env), false);
  assert.equal(maySignIn(NEW("a@x@example.com"), env), false);
});

test("an empty or missing list admits nobody", () => {
  assert.equal(maySignIn(NEW("a@example.com"), list("")), false);
  assert.equal(maySignIn(OLD("a@example.com"), list(" , ")), false);
  assert.equal(maySignIn(NEW("a@example.com"), { ROLEWRIGHT_SIGNUPS: "allowlist" }), false);
  assert.equal(maySignIn(NEW("a@example.com"), prod()), false);
});

test("an empty or missing email is refused in every mode", () => {
  for (const m of ["open", "closed", "allowlist"]) {
    const env = list("@example.com", { ROLEWRIGHT_SIGNUPS: m });
    for (const email of ["", "  ", null, undefined]) {
      assert.equal(maySignIn({ email, existingUser: true }, env), false);
    }
  }
});
