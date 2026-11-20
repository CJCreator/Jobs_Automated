// Runs once when the server starts (not during `next build`). An unsafe
// environment stops the process here instead of failing on the first request.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertSafeEnv, isDeployed } = await import("@/lib/server/env-guard.mjs");
    try {
      assertSafeEnv(process.env);
      // On a deployed host, open the database now: the start-up role check
      // (superuser, BYPASSRLS, table ownership, missing tables) then stops the
      // process before it serves anything.
      if (isDeployed(process.env)) {
        const { getDb } = await import("@/lib/db/index.mjs");
        await getDb();
      }
    } catch (err) {
      console.error(err);
      process.exit(1);
    }
  }
}
