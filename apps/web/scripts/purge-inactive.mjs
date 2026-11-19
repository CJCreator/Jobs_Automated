// Deletes accounts nobody has signed in to for 12 months, with all their data.
// The privacy screen promises this, and the app does not run it by itself:
// schedule this script daily in production (see README.md).
//
//   npm run purge:inactive
//
// Prints only the number of accounts deleted. It never emails anyone and never
// prints who was deleted. Uses DATABASE_URL, or the embedded database
// (ROLEWRIGHT_DATA_DIR, default .data/pglite) when that is unset.

import { getDb } from "../src/lib/db/index.mjs";
import { purgeInactiveUsers } from "../src/lib/db/repo.mjs";

const db = await getDb();
try {
  const count = await purgeInactiveUsers(db, { months: 12 });
  console.log(count);
} finally {
  await db.close();
}
