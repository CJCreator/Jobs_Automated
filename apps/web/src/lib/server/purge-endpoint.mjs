// POST /api/internal/purge: runs the 12-month retention purge for Google's
// scheduler identity only. Fails closed: with either variable unset, or any
// problem with the token, the answer is one generic 401 and nothing is deleted.

import { purgeInactiveUsers } from "../db/repo.mjs";
import { verifyGoogleOidc } from "./oidc.mjs";

const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
const reply = (status, body) => new Response(JSON.stringify(body), { status, headers });
const unauthorized = () => reply(401, { error: { code: "unauthorized", message: "Not authorised." } });

/**
 * @param {Request} req
 * @param {{ env?: Record<string, string | undefined>, db: any, verify?: (token: string, opts: { audience: string, email: string }) => Promise<unknown> }} deps
 * @returns {Promise<Response>}
 */
export async function handlePurge(req, { env = process.env, db, verify = verifyGoogleOidc } = {}) {
  const audience = env.ROLEWRIGHT_PURGE_AUDIENCE;
  const email = env.ROLEWRIGHT_PURGE_SERVICE_ACCOUNT;
  if (!audience || !email) return unauthorized();
  const match = /^Bearer ([^\s]+)$/i.exec(req.headers.get("authorization") ?? "");
  if (!match) return unauthorized();
  try {
    await verify(match[1], { audience, email });
  } catch {
    return unauthorized();
  }
  const purged = await purgeInactiveUsers(db, { months: 12 });
  return reply(200, { purged });
}
