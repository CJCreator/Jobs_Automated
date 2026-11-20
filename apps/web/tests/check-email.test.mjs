import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ipSubject } from "../src/lib/server/client-ip.mjs";
import { RateLimitUnavailableError } from "../src/lib/server/rate-limit-core.mjs";
import { gateSignInAction, gateSignInPost } from "../src/lib/server/signin-limit.mjs";

// auth.ts, the route and the page import next-auth and "@/" aliases that node --test cannot load,
// so the wiring is pinned from source, and the thrown error is exercised through the real helpers.

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const auth = read("../src/auth.ts");
const route = read("../src/app/api/auth/[...nextauth]/route.ts");
const page = read("../src/app/sign-in/check-email/page.tsx");
const en = read("../src/i18n/en.ts");

const deployedNoKey = { K_SERVICE: "web" };

test("with no key on a deployed host the sign-in gates throw RateLimitUnavailableError, not HttpError", async () => {
  const take = async () => assert.fail("limiter must not be reached");
  const origError = console.error;
  console.error = () => {};
  try {
    assert.throws(() => ipSubject("1.2.3.4", deployedNoKey), RateLimitUnavailableError);
    await assert.rejects(gateSignInPost({ headers: {}, env: deployedNoKey, take, handler: () => assert.fail("no handler") }), RateLimitUnavailableError);
    await assert.rejects(gateSignInAction({ headers: {}, env: deployedNoKey, take }), RateLimitUnavailableError);
  } finally {
    console.error = origError;
  }
});

test("the route maps RateLimitUnavailableError to a 503", () => {
  assert.match(route, /instanceof RateLimitUnavailableError/);
  assert.match(route, /rate_limit_unavailable[\s\S]{0,260}503\)/);
});

test("signIn() turns RateLimitUnavailableError into the bare AuthError", () => {
  const fn = auth.slice(auth.indexOf("export async function signIn"));
  assert.match(fn, /instanceof RateLimitUnavailableError\) \{[\s\S]*?throw new AuthError\("Sign-in limited\."\);/);
});

test("every email-link outcome lands on the app's own page, not Auth.js's built-in one", () => {
  assert.match(auth, /const CHECK_EMAIL_PATH = "\/sign-in\/check-email";/);
  assert.match(auth, /pages: \{[^}]*verifyRequest: CHECK_EMAIL_PATH/);
  // Must equal Auth.js's sent-path redirect (`${baseUrl}/verify-request?provider&type`, which
  // pages.verifyRequest then forwards), so the not-sent paths cannot be told apart by the first hop.
  assert.ok(
    auth.includes("`/api/auth/verify-request?${new URLSearchParams({ provider: account.provider, type: \"email\" })}`"),
  );
  // One redirect value serves the closed-mode unknown address, the rate-limited address and the
  // limiter-down paths, and they all return it.
  assert.equal([...auth.matchAll(/return verifyRequest;/g)].length, 3);
  assert.ok(existsPage());
});

function existsPage() {
  return page.includes("export default function CheckEmailPage");
}

test("the page says what the owner asked for and reads nothing from the request", () => {
  assert.match(en, /checkEmail: \{[\s\S]*?Check your email[\s\S]*?a few minutes[\s\S]*?limited/);
  assert.doesNotMatch(page, /searchParams|cookies\(|headers\(|auth\(\)/);
  assert.match(page, /<h1 /);
  assert.match(page, /id="main" tabIndex=\{-1\}/);
});
