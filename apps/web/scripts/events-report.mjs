// Prints event totals for the owner (ADR 0010, 0016): counts only, never who or what.
//
//   npm run events:report
//
// Per-day counts by event name with distinct users, sign-ups per day (from users.created_at),
// and the segment split. Uses DATABASE_URL, or the embedded database when that is unset.

import { getDb } from "../src/lib/db/index.mjs";

const db = await getDb();
try {
  const events = await db.system.query(
    `SELECT to_char(date_trunc('day', at), 'YYYY-MM-DD') AS day, name,
            count(*)::int AS events, count(DISTINCT user_id)::int AS users
     FROM events GROUP BY 1, 2 ORDER BY 1, 2`,
  );
  const signups = await db.system.query(
    `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, count(*)::int AS signups
     FROM users GROUP BY 1 ORDER BY 1`,
  );
  // to_jsonb(u) so this runs before the segment column exists.
  const segments = await db.system.query(
    `SELECT COALESCE(to_jsonb(u)->>'segment', 'not set') AS segment, count(*)::int AS users
     FROM users u GROUP BY 1 ORDER BY 1`,
  );
  const section = (title, rows) => {
    console.log(`\n${title}`);
    if (rows.length) console.table(rows);
    else console.log("  none");
  };
  section("Events per day", events.rows);
  section("Sign-ups per day", signups.rows);
  section("Segments", segments.rows);
} finally {
  await db.close();
}
