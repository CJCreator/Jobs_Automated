import { auth } from "@/auth";
import { getDb } from "@/lib/db/index.mjs";
import { getUserById, touchUser } from "@/lib/db/repo.mjs";
import { HttpError, type RouteState } from "./http";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOUCH_EVERY_MS = 60 * 60 * 1000;

/**
 * The signed-in user's id, or a 401.
 *
 * A session cookie stays valid after the account is deleted, so the user row
 * is looked up on every request; that lookup also drives the hourly
 * last_seen_at update. Runs outside withUser: the users table has no
 * row-level security, and the embedded database deadlocks on a system query
 * inside a withUser transaction.
 */
export async function requireUser(state: RouteState): Promise<string> {
  const session = await auth();
  const id = session?.user?.id;
  const unauthorized = () => new HttpError(401, "unauthorized", "Sign in to continue.");
  if (typeof id !== "string" || !UUID_RE.test(id)) throw unauthorized();
  const db = await getDb();
  const user = await getUserById(db, id);
  if (!user) throw unauthorized();
  state.userId = id;
  const last = user.lastSeenAt ? Date.parse(user.lastSeenAt) : NaN;
  if (!Number.isFinite(last) || Date.now() - last > TOUCH_EVERY_MS) await touchUser(db, id);
  return id;
}
