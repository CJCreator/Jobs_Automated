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
 * True on a hosted deployment, whatever NODE_ENV says. Read from the process
 * environment only, never from a request. Only the exact value "1" turns
 * ROLEWRIGHT_DEPLOYED on; any non-empty K_SERVICE (set by Cloud Run and
 * Knative hosts) counts.
 * @param {Record<string, string | undefined>} env
 */
export function isDeployed(env) {
  return env.ROLEWRIGHT_DEPLOYED === "1" || (env.K_SERVICE ?? "") !== "";
}

/**
 * True when the development conveniences must be off: a deployed host, or
 * NODE_ENV=production.
 * @param {Record<string, string | undefined>} env
 */
export function strictEnv(env) {
  return isDeployed(env) || env.NODE_ENV === "production";
}

/**
 * Whether the development sign-in is on: asked for, and the environment is not strict.
 * @param {Record<string, string | undefined>} env
 */
export function devLoginEnabled(env) {
  return env.ROLEWRIGHT_DEV_LOGIN === "1" && !strictEnv(env);
}

/**
 * The problems with this environment, in plain words. Empty means safe.
 * @param {Record<string, string | undefined>} env
 * @returns {string[]}
 */
export function unsafeEnvProblems(env) {
  if (env.NEXT_PHASE === BUILD_PHASE) return [];
  if (!strictEnv(env)) return [];
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
  if (isDeployed(env) && !(env.DATABASE_URL ?? "").trim()) {
    problems.push(
      "DATABASE_URL is not set, so the app would fall back to the embedded database, which is for development only. Set it to your Postgres connection string.",
    );
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
      `Rolewright will not run in production or on a deployed host with these settings: ${problems.join(" ")} Fix them and restart.`,
    );
  }
}
