// Runs once when the server starts (not during `next build`). An unsafe
// environment stops the process here instead of failing on the first request.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertSafeEnv } = await import("@/lib/server/env-guard.mjs");
    try {
      assertSafeEnv(process.env);
    } catch (err) {
      console.error(err);
      process.exit(1);
    }
  }
}
