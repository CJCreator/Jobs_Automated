import { getDb } from "@/lib/db/index.mjs";
import { route } from "@/lib/server/http";
import { handlePurge } from "@/lib/server/purge-endpoint.mjs";

export const runtime = "nodejs";

// No session: the caller is Google Cloud Scheduler, proved by an OIDC token.
// Nothing here logs the token or an email address.
export const POST = route("internal.purge", async (req) => handlePurge(req, { env: process.env, db: await getDb() }));
