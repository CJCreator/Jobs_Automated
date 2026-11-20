// Event tracking (ADR 0010): awaited, never throws, never changes a response, and the
// only thing it ever logs is the event name.

import { getDb } from "../db/index.mjs";
import { recordEvent } from "../db/events.mjs";

/**
 * @param {string} userId
 * @param {string} name one of the four event names
 * @param {Record<string, string | number>} [props] allowlisted props only (see events.mjs)
 * @param {{ db?: any }} [opts] a database handle, for tests; the process database by default
 */
export async function track(userId, name, props = {}, opts = {}) {
  try {
    await recordEvent(opts.db ?? (await getDb()), userId, name, props);
  } catch {
    // The error text can carry user data or a connection detail, so only the name is logged.
    console.warn(`[rolewright] event not recorded: ${String(name).replace(/[^a-z_]/g, "").slice(0, 40)}`);
  }
}
