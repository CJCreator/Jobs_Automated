// Applies the database schema as the owner login (ADR 0009). Run it before
// deploying: on a deployed host the app runs no DDL and refuses to start
// against a database that is missing a table.
//
//   npm run db:migrate
//
// Connects with ROLEWRIGHT_MIGRATE_DATABASE_URL. Off a deployed host it falls
// back to DATABASE_URL; on a deployed host it never does, because DATABASE_URL
// there is the app login, which must not own the tables. Holds the same
// advisory lock as the app, so two runs never apply the schema at once. Prints
// one line and never prints the connection string or an error's text (which can
// echo it); exits non-zero on failure.

import { migrateDatabase } from "../src/lib/db/index.mjs";
import { isDeployed } from "../src/lib/server/env-guard.mjs";

const env = process.env;
const url = (env.ROLEWRIGHT_MIGRATE_DATABASE_URL ?? "").trim() || (isDeployed(env) ? "" : (env.DATABASE_URL ?? "").trim());

if (!url) {
  console.error(
    isDeployed(env)
      ? "db:migrate: ROLEWRIGHT_MIGRATE_DATABASE_URL is not set. Set it to the owner login's connection string."
      : "db:migrate: set ROLEWRIGHT_MIGRATE_DATABASE_URL (or DATABASE_URL) to a Postgres connection string.",
  );
  process.exit(1);
}

try {
  await migrateDatabase({ connectionString: url });
  console.log("db:migrate: schema applied.");
} catch (err) {
  const code = err && typeof err === "object" && "code" in err && typeof err.code === "string" ? err.code : "unknown";
  console.error(`db:migrate: failed (code ${code}).`);
  process.exitCode = 1;
}
