import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDb } from "../src/lib/db/index.mjs";
import { take as dbTake } from "../src/lib/db/rate-events.mjs";
import { LIMITS } from "../src/lib/server/rate-limit-core.mjs";
import { allowEmailLink, gateSignInPost } from "../src/lib/server/signin-limit.mjs";

// auth.ts and the route import next-auth and "@/" aliases, which node --test cannot load, so the
// logic lives in signin-limit.mjs (pure, takes the limiter as an argument) and is tested here
// against the real rate_events store. A source check at the end pins the wiring.

let db;
before(async () => {
  db = await createDb();
});
after(() => db.close());

// The same decision takeRateLimit makes, without the next/db aliases.
async function take(bucket, subject) {
  const limit = LIMITS[bucket];
  const v = await dbTake(db, bucket, subject, 1, limit);
  if (!v.allowed) {
    throw Object.assign(new Error(limit.message), {
      name: "HttpError",
      status: 429,
      code: "too_many_requests",
      headers: { "Retry-After": String(v.retryAfterS) },
    });
  }
}

const env = {}; // not strict: the development hash key applies
const rows = async (bucket) => (await db.system.query("SELECT subject FROM rate_events WHERE bucket=$1", [bucket])).rows.map((r) => r.subject);

test("the 21st sign-in POST in 10 minutes from one IP is refused and the handler is not called", async () => {
  const headers = new Headers({ "x-forwarded-for": "203.0.113.7" });
  let calls = 0;
  const handler = async () => (calls++, new Response("ok"));
  for (let i = 0; i < 20; i++) assert.equal(await (await gateSignInPost({ headers, env, take, handler })).text(), "ok");
  assert.equal(calls, 20);
  await assert.rejects(
    gateSignInPost({ headers, env, take, handler }),
    (e) => e.status === 429 && Number(e.headers["Retry-After"]) >= 1,
  );
  assert.equal(calls, 20);
});

test("a spoofed leftmost x-forwarded-for does not get a fresh bucket", async () => {
  let calls = 0;
  const handler = async () => (calls++, new Response("ok"));
  const real = "198.51.100.9"; // what the proxy appended
  for (let i = 0; i < 20; i++) {
    const headers = new Headers({ "x-forwarded-for": `10.0.0.${i + 1}, ${real}` });
    await gateSignInPost({ headers, env, take, handler });
  }
  await assert.rejects(
    gateSignInPost({ headers: new Headers({ "x-forwarded-for": `1.2.3.4, ${real}` }), env, take, handler }),
    (e) => e.status === 429,
  );
  assert.equal(calls, 20);
});

test("the 6th email link for one address in an hour is refused, whatever the case", async () => {
  for (let i = 0; i < 5; i++) assert.equal(await allowEmailLink({ email: "Asha@Example.com", take, env }), true);
  assert.equal(await allowEmailLink({ email: " asha@example.COM ", take, env }), false);
  // another address is unaffected
  assert.equal(await allowEmailLink({ email: "ravi@example.com", take, env }), true);
});

test("other failures (limiter unavailable) are not swallowed", async () => {
  const boom = async () => {
    throw Object.assign(new Error("down"), { name: "HttpError", status: 503 });
  };
  await assert.rejects(allowEmailLink({ email: "x@example.com", take: boom, env }), (e) => e.status === 503);
  await assert.rejects(gateSignInPost({ headers: new Headers(), env, take: boom, handler: async () => new Response() }), (e) => e.status === 503);
});

test("no raw IP or address is written to rate_events", async () => {
  const all = [...(await rows("signInIp")), ...(await rows("emailSend"))];
  assert.ok(all.length >= 3);
  for (const s of all) {
    assert.match(s, /^[0-9a-f]{64}$/);
    assert.ok(!/203\.0\.113|198\.51\.100|example\.com/i.test(s));
  }
});

test("wiring: route gates POST before the handler; the signIn callback limits only after the sign-up gate", () => {
  const route = readFileSync(new URL("../src/app/api/auth/[...nextauth]/route.ts", import.meta.url), "utf8");
  assert.match(route, /gateSignInPost\(/);
  assert.ok(route.indexOf("gateSignInPost(") < route.indexOf("handlers.POST"), "gate wraps the handler");
  assert.doesNotMatch(route.slice(route.indexOf("export async function GET"), route.indexOf("export async function POST")), /gateSignInPost/);
  const auth = readFileSync(new URL("../src/auth.ts", import.meta.url), "utf8");
  const gate = auth.indexOf("maySignIn({ email, existingUser");
  const limit = auth.indexOf("allowEmailLink(");
  assert.ok(gate > 0 && limit > gate, "email limit runs after maySignIn");
  assert.match(auth, /emailStep\?\.verificationRequest/);
});
