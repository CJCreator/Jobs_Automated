// Refuses to serve with settings that are only safe on a developer's machine.
//
// Pure (the environment is passed in) so it can be unit-tested, and plain
// .mjs so tests import it without a build step.
//
// `next build` runs with NODE_ENV=production and imports route modules while
// it collects page data, so the check is skipped in that phase: a build never
// serves a request, and failing it for a missing AUTH_SECRET would make every
// build machine hold the production secret. Next sets NEXT_PHASE before it
// starts the build workers, so they inherit it.

const BUILD_PHASE = "phase-production-build";

/** Thrown at server start or on the first request when the environment is unsafe. */
export class UnsafeEnvironmentError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = "UnsafeEnvironmentError";
    this.code = "unsafe_environment";
  }
}

/**
 * The problems with this environment, in plain words. Empty means safe.
 * @param {Record<string, string | undefined>} env
 * @returns {string[]}
 */
export function unsafeEnvProblems(env) {
  if (env.NEXT_PHASE === BUILD_PHASE) return [];
  if (env.NODE_ENV !== "production") return [];
  const problems = [];
  if (env.ROLEWRIGHT_DEV_LOGIN === "1") {
    problems.push(
      "ROLEWRIGHT_DEV_LOGIN=1 lets anyone sign in as any email address without proof. It is for local development only.",
    );
  }
  if (env.ROLEWRIGHT_ALLOW_MOCK_LLM === "1") {
    problems.push("ROLEWRIGHT_ALLOW_MOCK_LLM=1 turns on a fake AI provider that is for tests only.");
  }
  if (!(env.AUTH_SECRET ?? "").trim()) {
    problems.push("AUTH_SECRET is not set, so sessions cannot be signed. Generate one with `openssl rand -base64 32`.");
  }
  return problems;
}

/**
 * Throw if the server must not run with this environment.
 * @param {Record<string, string | undefined>} env usually `process.env`
 * @throws {UnsafeEnvironmentError}
 */
export function assertSafeEnv(env) {
  const problems = unsafeEnvProblems(env);
  if (problems.length) {
    throw new UnsafeEnvironmentError(
      `Rolewright will not run in production with these settings: ${problems.join(" ")} Fix them and restart.`,
    );
  }
}
