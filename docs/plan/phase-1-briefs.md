# Phase 1 briefs

Written by the advisor under ADR 0017 as amended by ADR 0018. Each worker reads the brief for its task plus "Common to every brief" and "Shared names".

Paths are repo-relative. `src/...` and `tests/...` mean `apps/web/src/...` and `apps/web/tests/...`.

## Common to every brief

- **Must not touch:** anything not listed. Ask the orchestrator if more is needed.
- **Build rule (ADR 0018):** run only the commands under "Run". No `npm test`, `test:flow`, `test:e2e`, `test:prod`, `next build`, `next dev`, Docker build, browser or `test-all`.
- **`en.ts`:** append new keys under a `// P1-x` comment in a new top-level object (for example `en.trial`). Never edit an existing key, and never add inside `en.app.privacy`, `en.notice` or `en.consent`.
- **`schema.mjs`:** append the block from your brief, unchanged, at the end of `SCHEMA_SQL` under `-- P1-x`. Do not edit earlier statements.
- **`takeRateLimit`:** if you own a route that calls it, write `await takeRateLimit(...)`.
- **Harness:** do not edit `tests/integration/run.mjs`, `tests/e2e/run.mjs` or `tests/integration/prod-smoke.mjs` (P1-22 excepted).
- **No new dependencies** (P1-6 excepted, for infrastructure tooling only).
- **Node:** 22.18 or later (the floor in `apps/web/package.json`).
- **Report:** files changed; tests added; each command run with pass and fail counts; "Harness impact" (which flow, e2e or smoke steps this change will break, and how they should change); anything left undone.

## Shared names

| Name | Value | Defined by | Used by |
|---|---|---|---|
| `ROLEWRIGHT_EXTRA_PROVIDERS` | comma list from `openai`, `groq` | P1-1 | P1-4, P1-6 |
| `launchProviders()` in `providers.mjs` | the offered providers | P1-1 | P1-2, P1-4 |
| `ROLEWRIGHT_SIGNUPS` | `closed`, `allowlist`, `open` | P1-14 | P1-6, P1-3b |
| `ROLEWRIGHT_SIGNUP_ALLOWLIST` | comma list of addresses and `@domain` entries | P1-14 | P1-6 |
| `takeRateLimit(bucket, subject)` | async; throws `HttpError` 429 | P1-3 | all routes |
| `spendRateLimit(bucket, subject, cost)` | async; records a cost | P1-3 | P1-3 |
| Buckets | `ai`, `upload`, `tailoring`, `keyCheck`, `export`, `gateMs`, `trialIp`, `signInIp`, `emailSend` | P1-3 | P1-2, P1-3b |
| `clientIp(headers, env)` in `src/lib/server/client-ip.mjs` | string or `"unknown"` | P1-3 | P1-2, P1-3b |
| `ROLEWRIGHT_TRUSTED_PROXY_HOPS` | integer, default 0 | P1-3 | P1-6 |
| Table `rate_events` | system table | P1-3 | P1-17 structural test |
| `SYSTEM_TABLES` exported from `schema.mjs` | `users`, `accounts`, `verification_tokens`, `rate_events` | P1-17 | checklist line 5 |
| Role `rolewright_system` | NOLOGIN; holds grants on system tables | P1-17, P1-3 | P1-6 |
| Roles `rolewright_owner`, `rolewright_login` | migration login; app login | P1-6 | P1-17 |
| `ROLEWRIGHT_MIGRATE_DATABASE_URL` | owner connection string | P1-17 | P1-6 |
| `npm run db:migrate` | `node scripts/migrate.mjs` | P1-17 | P1-6, P1-T1 |
| `GET /api/health` | 200 `{ "ok": true }` or 503 | P1-17 | P1-6, P1-22 |
| `requireConsent(userId, provider?)` | provider optional until P1-2 passes it everywhere | P1-15 | P1-2 |
| Consent purposes | `ai_processing`, `storage` | P1-15 | P1-2 |
| Consent provider value for the trial | `trial` | P1-15 | P1-2 |
| Columns `tailorings.lines_total`, `lines_sent`, `rewrites_returned` | integers, nullable | P1-16 | P1-5b |
| `MAX_LINES_SENT` in `tailoring.mjs` | 60 | P1-16 | P1-2 |
| Table `trial_counters` | RLS table | P1-2 | |
| `ROLEWRIGHT_TRIAL_GEMINI_KEY`, `ROLEWRIGHT_TRIAL_OPENROUTER_KEY`, `ROLEWRIGHT_TRIAL_GEMINI_MODEL`, `ROLEWRIGHT_TRIAL_OPENROUTER_MODEL` | secrets and model ids | P1-2 | P1-6, P1-4 |
| `x-llm-provider: trial` | request header value, no key | P1-2 | |
| `CLAIM_FAMILIES`, `COVERAGE_REASONS` exported from `verify-cv-facts.mjs` | lists | P1-19 | P1-20 |
| `unsupportedNumberContexts(text, sourceText)` in `src/lib/number-context.mjs` | `{ value, raw }[]` | P1-21 | P1-20 |
| `analyzeCoverage`, `keywordsFromJdText` in `src/lib/keyword-match.mjs` | same signatures as the engine | P1-5 | P1-5b, P1-4 |
| `SMOKE_BASE_URL` | remote mode for `test:prod` | P1-22 | P1-7 |

## Wave 1

```
Task: P1-1 Launch providers
Worker: Sonnet
Goal: Only Gemini, OpenRouter and Anthropic can be chosen or used; errors say what went wrong; the user sees
  which model is in use.
ADRs: 0003
Touches (only these):
  apps/web/src/lib/llm/providers.mjs
  apps/web/src/lib/llm/errors.mjs
  apps/web/src/app/api/providers/route.ts
  apps/web/src/lib/client/providers.ts
  apps/web/src/components/key-view.tsx
  apps/web/src/components/app-header.tsx
  apps/web/src/i18n/en.ts (append)
  apps/web/tests/llm.test.mjs
  apps/web/tests/providers.test.mjs (new)
Inputs: providers.mjs:11 lists five providers; isProviderAllowed (:33) accepts all five on every AI route.
Steps:
 1. Test first (providers.test.mjs): with no env, launchProviders() returns gemini, openrouter, anthropic in
    that order; isProviderAllowed("openai") and ("groq") are false; with ROLEWRIGHT_EXTRA_PROVIDERS="openai"
    openai is allowed and listed and groq is not; unknown names in the variable are ignored; "mock" rules are
    unchanged.
 2. providers.mjs: keep PROVIDERS; add launchProviders(env = process.env); isProviderAllowed and
    assertAllowed use it. verifyKey and complete therefore refuse a hidden provider.
 3. api/providers/route.ts lists launchProviders() only.
 4. errors.mjs: three distinct outcomes, each with its own code and message, and no provider response text:
      invalid_key     -> "<Provider> did not accept this key…" (exists)
      quota           -> "<Provider> says this key has no quota or credit left. Add credit, wait for the quota
                         to reset, or use another key."  (402; Gemini 429 whose JSON error.status is
                         RESOURCE_EXHAUSTED with a quota-type detail; OpenRouter 402)
      provider_error  -> outage wording for 5xx and network (exists; keep "Try again shortly")
    Read only the status and the fixed fields named above from a provider body; never copy text from it.
    Add tests in llm.test.mjs for each mapping with a stubbed fetch.
 5. key-view.tsx: key input gets autoComplete="new-password", data-1p-ignore, data-lpignore="true".
    Remove the dead `else` branch that sets t.saveFailed (setLlmKey always returns true).
 6. app-header.tsx: when a key is held, show "<Provider label> · <model>" (useLlmKey, providerLabel). New
    strings appended to en.ts. Do not change existing ids or roles.
 7. The Anthropic default at providers.mjs anthropicVerify stays as it is.
Run: cd apps/web && npm run typecheck && node --test tests/providers.test.mjs tests/llm.test.mjs
Done when: the tests in steps 1 and 4 fail before and pass after; typecheck passes.
Harness impact: any flow or e2e step that picks "openai" or "groq" from the provider list.
Risks: Gemini uses 429 for both rate and quota; when the body does not say which, keep rate_limited.
```

```
Task: P1-3 Shared rate limits
Worker: Sonnet
Goal: Rate limits are counted in Postgres, so they hold across Cloud Run instances, and a failure to count
  refuses the request.
ADRs: 0009
Touches (only these):
  apps/web/src/lib/server/rate-limit.ts
  apps/web/src/lib/server/rate-limit-core.mjs (new)
  apps/web/src/lib/server/client-ip.mjs (new)
  apps/web/src/lib/db/rate-events.mjs (new)
  apps/web/src/lib/db/schema.mjs (append)
  apps/web/src/app/api/keys/verify/route.ts
  apps/web/src/app/api/tailorings/[id]/route.ts
  apps/web/src/app/api/tailorings/[id]/suggestions/[sid]/route.ts
  apps/web/src/app/api/tailorings/[id]/export/route.ts
  apps/web/tests/rate-limit.test.mjs (new)
  apps/web/tests/client-ip.test.mjs (new)
Schema block (append unchanged):
  -- P1-3
  DO $$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'rolewright_system') THEN
      CREATE ROLE rolewright_system NOLOGIN;
    END IF;
  END $$;
  CREATE TABLE IF NOT EXISTS rate_events (
    id bigserial PRIMARY KEY,
    bucket text NOT NULL,
    subject text NOT NULL,
    cost integer NOT NULL DEFAULT 1,
    at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS rate_events_lookup_idx ON rate_events (bucket, subject, at);
  GRANT SELECT, INSERT, DELETE ON rate_events TO rolewright_system;
  GRANT USAGE, SELECT ON SEQUENCE rate_events_id_seq TO rolewright_system;
  The subject is a user id, or a SHA-256 hex of an IP or email address. Never a raw IP or address.
Steps:
 1. rate-limit-core.mjs (pure): LIMITS and decide({ max, windowMs }, usedCost, oldestAtMs, nowMs) ->
    { allowed, retryAfterS }. Unit tests for the window edge, Retry-After >= 1, and cost sums.
 2. LIMITS: ai 20/min; upload 10/h; tailoring 40/min; keyCheck 10/10 min; export 20/h;
    gateMs 20000 ms of cost per minute; trialIp 10/day; signInIp 20/10 min; emailSend 5/h.
 3. rate-events.mjs: take(db, bucket, subject, cost, limit) in one statement through db.system, safe under
    concurrency: a transaction with pg_advisory_xact_lock(hashtext(bucket || ':' || subject)), then sum the
    window, then insert when allowed. Also delete that subject's rows older than the window in the same call.
    If the embedded database lacks advisory locks, say so in the report and use a single-statement
    INSERT … SELECT … WHERE (sum) < max instead; the test in step 5 decides.
 4. rate-limit.ts: `export async function takeRateLimit(bucket, subject)` and
    `export async function spendRateLimit(bucket, subject, cost)`. Same 429 shape and messages as today, with
    Retry-After. Any database error -> HttpError 503 "rate_limit_unavailable" (fail closed). Remove the
    in-memory store.
 5. rate-limit.test.mjs on in-memory PGlite: two createDb handles… cannot share memory, so use ONE database
    and two independent callers issuing 2 x max concurrent takes: exactly max succeed. Window expiry with an
    injected clock. Database error -> 503.
 6. client-ip.mjs: clientIp(headers, env). Reads x-forwarded-for; takes the entry
    (1 + ROLEWRIGHT_TRUSTED_PROXY_HOPS) from the right; validates it as an IPv4 or IPv6 literal; otherwise
    "unknown". Never trusts the leftmost entry. Tests: spoofed left entries are ignored; hops 0 and 1; junk.
    Export ipSubject(ip) = SHA-256 hex.
 7. Routes you own: `await takeRateLimit(...)`. keys/verify uses "keyCheck". export uses "export" and
    "tailoring". In tailorings/[id] GET, the suggestions PATCH and export: measure the gate work with
    performance.now() and call spendRateLimit("gateMs", userId, ms) afterwards; call
    takeRateLimit("gateMs", userId) with cost 0 semantics (refuse when the window is already over) before it.
Run: cd apps/web && npm run typecheck && node --test tests/rate-limit.test.mjs tests/client-ip.test.mjs
Done when: step 5 and 6 tests pass; no caller of takeRateLimit in your routes lacks `await`.
Harness impact: flow steps that expect the old in-memory limit to reset between runs; the 429 step for
  tailorings (limits now persist in the test database for the window).
Risks: every limited request now costs one extra round trip. gateMs is charged after the work, so one request
  can overshoot; that is accepted.
```

```
Task: P1-5 Port keyword-match (library)
Worker: Sonnet
Goal: The engine's keyword coverage maths runs inside apps/web with identical results.
ADRs: 0012, 0016
Touches (only these):
  apps/web/src/lib/keyword-match.mjs (new)
  apps/web/tests/keyword-match-parity.test.mjs (new)
  apps/web/tests/fixtures/keyword-match/ (new: 6 JD texts, 6 resume texts, no real person's data)
  packages/engine/keyword-match.mjs (htmlToText only)
  packages/engine/tests/keyword-match-html-end-tags.test.mjs (new)
Steps:
 1. Port only the pure functions: SYNONYMS, normalizeText, countOccurrences, variantForms, expandTerms,
    keywordCount, analyzeCoverage, keywordsFromJdText, htmlToText. No fs, no network, no CLI, no report
    parsing (extractKeywords, archivedJdText, resolve*, gateUrlJdResult, parseMatchArgs stay in the engine).
 2. CodeQL finding at packages/engine/keyword-match.mjs:446: the script/style end-tag pattern misses end
    tags with attributes or spaces (`</script foo>`, `</script >`). Fix it in the engine and in the port in
    the same way; engine test first, seen failing.
 3. Parity test: import the engine file through importEngineFile (src/lib/server/engine.mjs) and compare
    deep-equal output of analyzeCoverage(keywordsFromJdText(jd), resume) for every fixture pair, plus
    htmlToText on 5 HTML snippets. One fixture uses Indian terms (CTC, GST, Tally).
 4. Header comment: the twin is packages/engine/keyword-match.mjs; the parity test is the control.
 5. Input caps: analyzeCoverage refuses (throws RangeError) text over 60,000 characters or more than 200
    keywords, so a caller cannot stall the process. Test it. The engine file keeps its behaviour.
Run: cd apps/web && node --test tests/keyword-match-parity.test.mjs
     cd packages/engine && node --test tests/keyword-match-html-end-tags.test.mjs tests/keyword-match*.test.mjs
Done when: parity holds on every fixture; the engine's existing keyword-match tests still pass.
Harness impact: none.
Risks: job-description text is untrusted; nothing in this module may build a RegExp from it without escaping.
```

```
Task: P1-6 Google Cloud setup as code
Worker: Sonnet
Goal: One image and one Terraform configuration that the owner can apply to an empty staging or production
  project in asia-south1.
ADRs: 0003, 0004, 0009
Touches (only these):
  apps/web/Dockerfile (new)
  apps/web/.dockerignore (new)
  infra/terraform/** (new)
  infra/sql/bootstrap-roles.sql (new)
  .github/workflows/deploy.yml (new)
  docs/runbook/gcp.md (new)
Decisions (advisor): Terraform, not gcloud scripts, because the advisor reviews a diff and a declarative file
  shows the end state. Node 24 in the image (App CI is green on 24; the gate-cost margin fails on 22.18).
Steps:
 1. Dockerfile, built from the repo root context: base node:24-bookworm-slim pinned by digest; install
    apps/web with `npm ci`; copy packages/engine and run `npm install --ignore-scripts --omit=dev` there;
    install Chromium for the engine's pinned Playwright with system libraries; `next build`; run as a
    non-root user; CAREER_OPS_CODE_ROOT points at the copied engine; NODE_ENV=production; no NODE_OPTIONS;
    CMD `npm run start` on $PORT. packages/engine/web, tests and fixtures are excluded.
 2. Terraform, one root module with `staging.tfvars` and `production.tfvars`, region asia-south1:
    - Cloud Run service: memory 2Gi, cpu 2, concurrency 10, request timeout 180 s, min instances 0 (staging)
      and 1 (production), startup and liveness probes on HTTP GET /api/health, unauthenticated invoker
      allowed, no IAM check on the service (the purge route verifies its own token).
    - Cloud SQL Postgres 16: private IP only, automated backups with point-in-time recovery, deletion
      protection, direct VPC egress from Cloud Run.
    - Secret Manager: AUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, AUTH_RESEND_KEY, DATABASE_URL (login
      role), ROLEWRIGHT_MIGRATE_DATABASE_URL (owner role), ROLEWRIGHT_TRIAL_GEMINI_KEY,
      ROLEWRIGHT_TRIAL_OPENROUTER_KEY, ROLEWRIGHT_SIGNUP_ALLOWLIST. Terraform creates the secrets, never the
      values. No secret value in state, tfvars or the repo.
    - Plain variables: ROLEWRIGHT_SIGNUPS (default "allowlist"), ROLEWRIGHT_EXTRA_PROVIDERS (default ""),
      ROLEWRIGHT_TRUSTED_PROXY_HOPS (0), ROLEWRIGHT_TRIAL_*_MODEL, ROLEWRIGHT_GRIEVANCE_NAME and _EMAIL
      (default ""), EMAIL_FROM, ROLEWRIGHT_PURGE_AUDIENCE, ROLEWRIGHT_PURGE_SERVICE_ACCOUNT.
    - Cloud Run job `rolewright-migrate`: same image, command `npm run db:migrate`, only the owner secret.
      The service does not receive the owner secret.
    - Cloud Scheduler: daily POST to <service URL>/api/internal/purge, OIDC token from a dedicated service
      account, audience = the service URL, retry count 3, minimum backoff 60 s.
    - Alert: a log-based metric on failed purge calls and on scheduler job failure, with an email channel
      from a variable.
    - Service accounts with the least roles each needs.
 3. infra/sql/bootstrap-roles.sql: rolewright_owner (LOGIN), rolewright_login (LOGIN NOSUPERUSER NOCREATEDB
    NOCREATEROLE NOBYPASSRLS), rolewright_app and rolewright_system (NOLOGIN); GRANT rolewright_app,
    rolewright_system TO rolewright_login; database owned by rolewright_owner; CONNECT and schema USAGE for
    the login. Passwords are psql variables.
 4. deploy.yml: `workflow_dispatch` with an environment input: build, push to Artifact Registry, run the
    migrate job, deploy, using workload identity federation (no key file). Separate jobs on pull_request for
    paths `apps/web/Dockerfile`, `infra/**`: `docker build` without push, and `terraform fmt -check` plus
    `terraform validate` (no backend). persist-credentials false; least permissions.
 5. Runbook: first-time order (projects, bootstrap SQL, secrets, apply, migrate, deploy); how to add an
    address to the allowlist; how to test the purge alert; rollback; the HSTS includeSubDomains note
    (decide before mapping an apex domain); request logs must not include headers, and a load balancer added
    later must keep it that way.
Run: nothing executable is required. If `terraform` is on PATH, `terraform fmt -check`. Otherwise report that
  validation waits for the TEST wave.
Done when: the diff matches every bullet in step 2; no secret value appears anywhere.
Harness impact: none.
Risks: this is unexecuted until the TEST wave and P1-7. Chromium makes the image large and the first export
  slow after a cold start.
```

```
Task: P1-14 Sign-up allowlist
Worker: Sonnet
Goal: On a deployed host nobody new can create an account unless their address is on a list, and sign-ups
  cannot be opened without a grievance contact.
ADRs: 0004, 0006
Touches (only these):
  apps/web/src/auth.ts
  apps/web/src/lib/server/signup-gate.mjs (new)
  apps/web/src/lib/server/env-guard.mjs
  apps/web/src/app/sign-in/page.tsx
  apps/web/src/i18n/en.ts (append)
  apps/web/tests/signup-gate.test.mjs (new)
  apps/web/tests/env-guard.test.mjs
Inputs: auth.ts:155 lets any verified Google or email user in.
Steps:
 1. signup-gate.mjs (pure, env passed in):
      signupMode(env): ROLEWRIGHT_SIGNUPS in {closed, allowlist, open}. Unset or anything else -> "allowlist"
        on a strict environment (strictEnv), "open" otherwise.
      parseAllowlist(env): ROLEWRIGHT_SIGNUP_ALLOWLIST, comma separated, trimmed, lower-cased; entries are
        full addresses or "@domain". Malformed entries are dropped.
      maySignIn({ email, existingUser }, env) -> boolean:
        open: true. closed: existingUser. allowlist: on the list (address or domain), existing or not.
    Tests first: each mode; case and whitespace; "@example.com" does not match "a@evil-example.com" or
    "a@example.com.evil.org"; empty list admits nobody; an empty or missing email is refused.
 2. auth.ts signIn callback: after the Google email_verified check, resolve the email (profile.email for
    Google, user.email for the email provider, including the verificationRequest call), look up
    getUserByEmail, and return maySignIn(...). The dev provider is exempt (it is already refused on strict
    environments).
 3. Second layer: adapter.createUser throws when maySignIn({ email, existingUser: false }) is false, so a path
    that skips the callback still creates no row. For the email provider the refusal must happen before a
    verification token is stored and before an email is sent; say in the report how you confirmed the order.
 4. A refused sign-in lands on /sign-in?error=AccessDenied. sign-in/page.tsx shows an appended string:
    "Sign-ups are by invitation for now. If you were invited, use the address the invitation was sent to."
    The same message whether or not the address has an account.
 5. env-guard.mjs unsafeEnvProblems, on a strict environment:
      ROLEWRIGHT_SIGNUPS set to a value outside the three -> a problem.
      ROLEWRIGHT_SIGNUPS=open without a valid ROLEWRIGHT_GRIEVANCE_NAME and _EMAIL -> a problem
      (import grievanceContact from ../notice.mjs).
    Tests for both, and that staging values (allowlist, no grievance contact) start.
Run: cd apps/web && npm run typecheck && node --test tests/signup-gate.test.mjs tests/env-guard.test.mjs
Done when: the tests in steps 1 and 5 fail before and pass after.
Harness impact: prod-smoke runs NODE_ENV=production with no ROLEWRIGHT_SIGNUPS, so the mode is "allowlist"
  with an empty list; its sign-in steps use the dev provider, which is refused there already. Check step 2b
  and 11b expectations for the new start-up problems.
Risks: Auth.js calls signIn twice for email links; both calls must agree. P1-3b edits auth.ts in wave 2.
```

```
Task: P1-15 Consent record: provider and storage; notice lock
Worker: Sonnet
Goal: The consent record says which AI provider the user agreed to; saving facts needs a recorded storage
  consent; notice text cannot change without a version bump.
ADRs: 0004
Touches (only these):
  apps/web/src/lib/db/consents.mjs
  apps/web/src/lib/db/schema.mjs (append)
  apps/web/src/lib/server/consent.ts
  apps/web/src/app/api/consent/route.ts
  apps/web/src/app/api/facts/route.ts
  apps/web/src/app/api/resume/route.ts
  apps/web/src/components/resume-view.tsx
  apps/web/src/components/tailor-form.tsx
  apps/web/src/i18n/en.ts (append, as en.consentStorage)
  apps/web/tests/consent.test.mjs
  apps/web/tests/notice-lock.test.mjs (new)
  apps/web/tests/fixtures/notice-lock.json (new)
Schema block (append unchanged):
  -- P1-15
  ALTER TABLE consents ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT '';
  ALTER TABLE consents DROP CONSTRAINT IF EXISTS consents_user_id_notice_version_purpose_key;
  CREATE UNIQUE INDEX IF NOT EXISTS consents_user_version_purpose_provider_key
    ON consents (user_id, notice_version, purpose, provider);
Steps:
 1. consents.mjs: export STORAGE_PURPOSE = "storage". recordConsent and hasConsent take
    { noticeVersion, purpose, provider = "" }; ON CONFLICT uses the four columns. Allowed provider values:
    "" (storage only), a provider id matching /^[a-z]{2,20}$/, or "trial".
 2. consent.ts: requireConsent(userId, provider?: string). With a provider: needs an ai_processing row for
    that provider and the current version. Without: any ai_processing row for the current version (kept only
    until P1-2 passes the provider on every call). Add requireStorageConsent(userId): 403 with code
    "storage_consent_required".
 3. api/consent: GET takes ?provider= and answers { noticeVersion, accepted, storageAccepted }. POST takes
    { noticeVersion, purpose, provider }; a stale version is still 400. Recording ai_processing also records
    storage in the same call.
 4. api/resume/route.ts: requireConsent(userId, llm.provider); `await takeRateLimit("upload", userId)`.
 5. api/facts PUT: requireStorageConsent before anything is read from the body. GET is unchanged.
 6. tailor-form.tsx and resume-view.tsx: send the chosen provider with the consent POST and re-ask when the
    provider changes (the GET is keyed on provider). resume-view.tsx: when storageAccepted is false, saving
    hand-typed facts shows a checkbox with en.consentStorage.lead ("I agree that Rolewright stores what I
    enter here, as described in the privacy notice.") and posts purpose "storage" first.
 7. consent.test.mjs: a row for gemini does not satisfy anthropic; legacy rows (provider '') do not satisfy a
    named provider; PUT /api/facts logic refuses without storage consent (test requireStorageConsent and the
    db functions; no server); user A's rows are invisible to user B.
 8. notice-lock.test.mjs: SHA-256 over JSON.stringify of en.app.privacy, en.notice and en.consent, compared
    with tests/fixtures/notice-lock.json { "version": NOTICE_VERSION, "sha256": … }. Fails with the message
    "The notice text changed. Bump NOTICE_VERSION in src/lib/notice.mjs and update notice-lock.json." Also
    fails if the version in the lock differs from NOTICE_VERSION.
Run: cd apps/web && npm run typecheck && node --test tests/consent.test.mjs tests/notice-lock.test.mjs
Done when: step 7 and 8 tests fail before and pass after; changing one character of en.app.privacy locally
  makes the lock test fail (state this in the report, then revert).
Harness impact: every flow and e2e step that PUTs facts or uploads now needs a storage consent and a
  provider-specific consent first; e2e step k (consent asked from hand-typed facts) changes.
Risks: existing consent rows have provider '' and will be asked again. That is intended before launch.
```

```
Task: P1-16 Tailoring input cap and notice
Worker: Sonnet
Goal: The model never receives more than 60 lines, and the user is told how many lines were considered and
  how many rewrites were kept.
ADRs: 0005
Touches (only these):
  apps/web/src/lib/tailoring.mjs
  apps/web/src/app/api/tailorings/route.ts
  apps/web/src/lib/db/repo.mjs
  apps/web/src/lib/db/schema.mjs (append)
  apps/web/src/lib/server/views.ts
  apps/web/src/lib/client/types.ts
  apps/web/src/components/review-view.tsx
  apps/web/src/i18n/en.ts (append)
  apps/web/tests/tailoring.test.mjs
  apps/web/tests/tailoring-cap.test.mjs (new)
Schema block (append unchanged):
  -- P1-16
  ALTER TABLE tailorings ADD COLUMN IF NOT EXISTS lines_total integer;
  ALTER TABLE tailorings ADD COLUMN IF NOT EXISTS lines_sent integer;
  ALTER TABLE tailorings ADD COLUMN IF NOT EXISTS rewrites_returned integer;
Inputs: tailoring.mjs:121 stops at MAX_SUGGESTIONS without telling anyone; tailorings/route.ts sends every
  confirmed line (up to about 751) to the model.
Steps:
 1. tailoring.mjs: export MAX_LINES_SENT = 60 and selectLines(lines) -> { sent, total }: the summary first,
    then bullets in fact order (most recent job first), cut at 60. buildSuggestions is unchanged except that
    it also returns nothing new; add countUsable(rawRewrites, lines) so the route can store how many usable
    rewrites came back before the cap of 20.
 2. tailorings/route.ts: select lines before the model call; pass only `sent`; store lines_total, lines_sent
    and rewrites_returned through createJobWithTailoring (repo.mjs: three optional integers, validated as
    non-negative integers). Write `await takeRateLimit("ai", userId)`.
 3. repo.mjs getTailoring and views.ts tailoringView return the three numbers (null for old rows).
    types.ts: optional fields on the tailoring type.
 4. review-view.tsx: one info notice above the cards when lines_sent < lines_total or rewrites_returned >
    suggestions.length. Appended strings, plain words, for example: "Your resume has 74 confirmed lines. The
    first 60 were considered." and "The AI suggested 31 changes. The first 20 are shown." No notice for old
    rows or when nothing was cut.
 5. Tests: selectLines order and cut; counts stored and returned; one user cannot read another's counts
    (the existing RLS policy covers the row; assert it through getTailoring).
Run: cd apps/web && npm run typecheck && node --test tests/tailoring.test.mjs tests/tailoring-cap.test.mjs
Done when: tests fail before and pass after; MAX_SUGGESTIONS and GATE_BUDGET_MS are unchanged.
Harness impact: none expected; the mock provider returns few rewrites.
Risks: P1-2 edits tailorings/route.ts in wave 2 and must keep the selection before the model call.
```

```
Task: P1-17 Database foundation: migrations, role split, start-up role check
Worker: Opus
Goal: On a deployed host the app connects as a login that does not own the tables, runs no DDL, and refuses
  to serve if its login could bypass row-level security.
ADRs: 0009
Touches (only these):
  apps/web/src/lib/db/index.mjs
  apps/web/src/lib/db/role-check.mjs (new)
  apps/web/src/lib/db/schema.mjs (append; plus the exported SYSTEM_TABLES constant above SCHEMA_SQL)
  apps/web/scripts/migrate.mjs (new)
  apps/web/package.json (scripts only)
  apps/web/src/instrumentation.ts
  apps/web/src/app/api/health/route.ts (new)
  apps/web/tests/db.test.mjs
  apps/web/tests/db-role-check.test.mjs (new)
  apps/web/tests/db-structure.test.mjs (new)
  .github/workflows/app-ci.yml
Inputs: index.mjs runs SCHEMA_SQL (including DROP/CREATE POLICY) on every start; schema.mjs assumes the
  connecting user owns the tables; nothing checks rolsuper or rolbypassrls.
Schema block (append unchanged; the orchestrator keeps it as the last block):
  -- P1-17
  DO $$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'rolewright_system') THEN
      CREATE ROLE rolewright_system NOLOGIN;
    END IF;
  END $$;
  DO $$ BEGIN
    EXECUTE format('GRANT rolewright_system TO %I', current_user);
  EXCEPTION WHEN OTHERS THEN NULL;
  END $$;
  GRANT SELECT, INSERT, UPDATE, DELETE ON users, accounts, verification_tokens TO rolewright_system;
Steps:
 1. role-check.mjs (pure): roleProblems({ rolsuper, rolbypassrls, memberOfApp, memberOfSystem,
    ownedUserTables }, { deployed }) -> string[]. Problems: superuser; BYPASSRLS; not a member of
    rolewright_app; and, when deployed, not a member of rolewright_system or owning any RLS table. Also
    export ROLE_QUERY, the single SQL statement that returns those fields for current_user. Unit tests: one
    per problem, and the clean case.
 2. index.mjs createPgDb({ connectionString, migrate }): migrate defaults to !isDeployed(process.env). When
    false, no DDL runs; instead run ROLE_QUERY and a schema probe (to_regclass on every table the app needs,
    including rate_events) and throw UnsafeEnvironmentError listing the problems. When true (development, CI
    owner mode), apply the schema as today and then run the role check with deployed=false. PGlite always
    migrates and skips the role check (it runs as a superuser by design; say so in a comment).
 3. scripts/migrate.mjs and `"db:migrate": "node scripts/migrate.mjs"`: connects with
    ROLEWRIGHT_MIGRATE_DATABASE_URL (falls back to DATABASE_URL off a deployed host), takes the advisory lock,
    applies SCHEMA_SQL, prints one line with no connection string, exits non-zero on failure.
 4. schema.mjs: export const SYSTEM_TABLES = ["users", "accounts", "verification_tokens", "rate_events"].
 5. instrumentation.ts: on a deployed host, after assertSafeEnv, await getDb() so a bad role stops the
    process at start (same console.error and process.exit(1) path).
 6. api/health GET: no session; awaits getDb() and `SELECT 1` through db.system; 200 { ok: true } or 503
    { ok: false } with no detail. Cache-Control no-store. It must not reveal the problem text.
 7. db-structure.test.mjs (PGlite, runs after all wave 1 blocks merge; in your worktree it sees your
    tables): every table in the public schema is either relrowsecurity and relforcerowsecurity with a
    policy and a user_id column, or listed in SYSTEM_TABLES with no privilege granted to rolewright_app.
 8. db.test.mjs: add a non-owner mode. When ROLEWRIGHT_TEST_OWNER_URL is set, the suite migrates with it and
    then runs every isolation and row-lock test through ROLEWRIGHT_TEST_DATABASE_URL as a login that owns
    nothing; it also asserts purgeInactiveUsers and deleteUserData still cascade (foreign-key actions run as
    the table owner). Add tests/consent.test.mjs to the Postgres legs by the same environment variables.
 9. app-ci.yml: create rolewright_owner and rolewright_system; add a third test step "as a non-owner login"
    with ROLEWRIGHT_TEST_OWNER_URL set. Keep the existing two steps. Do not change the Node matrix.
Run: cd apps/web && npm run typecheck && node --test tests/db-role-check.test.mjs tests/db-structure.test.mjs
     tests/db.test.mjs tests/db-guard.test.mjs
     Exception to the build rule, approved in this brief: you may start a throwaway Postgres 16 with initdb in
     a temporary directory on a spare port and run tests/db.test.mjs against it in both modes. Stop it and
     delete the directory before reporting.
Done when: each role problem has a failing-then-passing test; on real Postgres, both modes pass with nothing
  skipped; a login with BYPASSRLS is refused in a test.
Harness impact: prod-smoke and flow use PGlite and are unaffected; prod-smoke step 2b (deployed, no
  DATABASE_URL) must still exit non-zero; /api/health is new and public.
Risks: a deployed host with an unmigrated database now refuses to start; the runbook order (migrate, then
  deploy) is the control. Wave 1 blocks from P1-3, P1-15 and P1-16 are not in your worktree; write the
  structural test so it holds once they merge.
```

```
Task: P1-19 Engine fact gate: verbs, magnitudes, forms, exported lists
Worker: Sonnet (may escalate to Opus after one failed review round)
Goal: The engine alone blocks participation-to-ownership inflation and Indian-format figures, exports its
  lists for the sync test, and costs less per call.
ADRs: 0005
Touches (only these):
  packages/engine/verify-cv-facts.mjs
  packages/engine/tests/verify-cv-facts-phase1.test.mjs (new)
Inputs: apps/web/tests/fixtures/honest-lines.mjs (SOURCE, SOURCE_V, HONEST) may be imported by the new test.
  Measured today with { sourceText } only: "Led vendor contracts" passes when the source says "Assisted with
  vendor contracts".
Steps:
 1. Test first, seen failing. S2 = SOURCE plus bullets "- Assisted with vendor contracts" and "- Supported the
    audit of 12 branches".
    MUST BLOCK (unsupportedFacts kind "scope"):
      "Led vendor contracts", "Drove vendor contracts", "Headed vendor contracts",
      "Spearheaded vendor contracts", "Was in charge of vendor contracts"         against S2
    MUST BLOCK (invented):
      "Served 5 lakh customers" when the source says "Served 5 customers"
      "Handled 3 crore transactions" when the source says "Handled 3 transactions"
      "Processed 10k invoices" when the source says "Processed 1,000 invoices"
    MUST PASS:
      every HONEST line against SOURCE (including "Led a four-person analyst team", "Directed a team of 4
      analysts.", "Oversaw a team of four analysts", "Spearheaded month-end close improvements using Power BI")
      "Processed 10k invoices" when the source says "Processed 10,000 invoices"
      "Managed vendor contracts" against S2
    MUST REPORT: "Processed 14M evaluations for users" names 14m evaluations, not "14m users".
 2. SCOPE_VERB_TIERS: add tier 1 assist, aid, participate, shadow, observe (all inflections) and the phrases
    "involved in", "part of", "member of" in SCOPE_PHRASE_TIERS; add tier 3 head, spearhead, champion (as
    verbs) and the phrases "in charge of", "leader of". Do not place manage, direct, oversee or supervise
    below tier 3, and do not add them at all unless a test needs it: the honest fixture uses them against a
    "Managed" source. Keep the check one-directional (block only on positive evidence of a weaker source).
 3. Magnitudes: lakh, lac, crore, cr, mn are magnitudes for counts as well as money; 10k equals 10,000 after
    normalisation on both sides.
 4. CLAIM_FAMILIES additions (the app's P1-20 mirrors them exactly): plurals and variants "principals",
    "gurus", "veterans", "diplomas", "toppers", "seniors", "heads of", "seniormost", "senior-most",
    "expertly"; "ph d"; "post graduate" and "post-graduate" in the postgraduate family; seniority "mgr",
    "gm", "general manager", "avp", "svp", "evp", "c-suite", "cxo"; scope "pan-india", "pan india".
    Not blocked: "executive summary", "enterprise reporting", "award-winning" — add a small exemption for
    these three exact phrases, with a test each.
 5. Export CLAIM_FAMILIES (frozen) and COVERAGE_REASONS (every value `coverage.reason` can take). Update the
    twin-list comment to name apps/web/tests/claim-lists-sync.test.mjs as the control.
 6. Cost: builtinClaimWordFacts builds one RegExp per form per call. Precompile per form at module load and
    cache the stripped, normalised source by its string (a one-entry cache is enough). Report ms per call
    before and after on SOURCE at 30,000 characters, on your Node version.
 7. Add matching cases to runSelfTest().
Run: cd packages/engine && node verify-cv-facts.mjs --self-test
     node --test tests/verify-cv-facts-*.test.mjs tests/fact-gate-*.test.mjs tests/nonmetric-fact-gate.test.mjs
       tests/cover-fact-gate.test.mjs
     cd apps/web && node --test tests/engine-gate.test.mjs tests/engine-bypass.test.mjs tests/gate-cost.test.mjs
Done when: step 1 fails before and passes after; the listed suites pass; gate-cost.test.mjs is not edited.
Harness impact: none.
Risks: tests/verify-cv-facts-at-employer.test.mjs and the cover-letter cases must stay green. The verdict for
  a coverage gap stays "warn" in the engine; the app decides to block (P1-20).
```

```
Task: P1-21 Numbers in context (library)
Worker: Sonnet
Goal: A figure passes only when the facts use the same figure about the same thing.
ADRs: 0005
Touches (only these):
  apps/web/src/lib/number-context.mjs (new)
  apps/web/tests/number-context.test.mjs (new)
Inputs: numberClaims and cleanText from src/lib/claims.mjs (import, do not edit). Today "Led a team of 12
  analysts" passes if any fact holds a 12. Advisor prototype on the 116 honest lines (92 non-year figures),
  comparing content words within N tokens of the figure with the same window around the same figure in a
  fact line: N=3 blocks "Managed a team of 12 analysts" and "Reduced costs by 30%" with 3 honest false blocks
  ("Reduced month-end close time by 30%. Managed 4 analysts." / "Reporting & month-end close specialist
  (4 yrs)" / "Delivered a 30% reduction in month-end close time using SQL and Power BI"); N=4 has 1 false
  block and misses the team case; whole-line overlap has none and misses most.
Steps:
 1. export function unsupportedNumberContexts(text, sourceText) -> { value, raw }[]. It only judges figures
    whose key (value and unit) IS in the facts; a figure absent from the facts is the existing check's job.
    Years are exempt.
 2. Rule to start from: nouns near the figure (not verbs, not stop words), within the same sentence, on both
    sides; supported when any fact line holding the same key shares one stemmed noun with it. Unit words count
    as context ("4 yrs" and "4 years"). A fact line that is only the figure and its noun phrase (an added
    fact such as "12 analysts") supports that phrase.
 3. `value` is the figure with its nearest noun phrase ("12 analysts", "30% costs"), at most 60 characters,
    so that confirming it as a fact unblocks the line. Test that: adding value as a line to sourceText clears
    the result.
 4. Tests, facts = SOURCE plus "- Supported the audit of 12 branches" and "- Supported 3 audits":
    MUST BLOCK: "Managed a team of 12 analysts"; "Led a team of 12 analysts"; "Reduced costs by 30%";
      "Grew revenue 30% using SQL"; "Managed budgets of 4 crore" is out of scope (key not in facts) and must
      return nothing here.
    MUST PASS: every HONEST line against SOURCE; "Audited 12 branches"; "Supported audits of 12 branches".
    KNOWN GAP (assert as a documented pass, in a KNOWN_GAPS list): "Led 12 analysts across branches" if your
      rule cannot block it without an honest false block.
 5. Header comment: what is covered, what is not, and the measured false-block count on HONEST (must be 0).
 6. Cost: one call on a 600-character line against 30,000 characters of facts takes under 2 ms; precompute
    per sourceText (cache the last one).
Run: cd apps/web && node --test tests/number-context.test.mjs
Done when: all lists hold; 0 honest false blocks; the attest test in step 3 passes.
Harness impact: none (not wired in until P1-20).
Risks: precision. If 0 false blocks and the two team cases cannot both hold, stop and report the trade-off
  with numbers instead of weakening a list.
```

```
Task: P1-22 Test harness plumbing
Worker: Sonnet
Goal: The three harnesses never leak a server, and `test:prod` can check a deployed URL.
ADRs: 0003, 0009
Touches (only these):
  apps/web/tests/integration/run.mjs
  apps/web/tests/integration/prod-smoke.mjs
  apps/web/tests/e2e/run.mjs
  apps/web/tests/e2e/helpers.mjs
Steps:
 1. integration/run.mjs and prod-smoke.mjs: start the server detached and kill the process group, as
    e2e/run.mjs:99-112 does. prod-smoke step 2b timeout path: set `child = null` after killTree(proc).
 2. All three: before starting, fail fast with a clear message if the port is in use or another `next`
    process has this app directory as its working directory. e2e: on a retry, log the mtimes of tsconfig.json
    and next-env.d.ts. Remove "Target closed" from the e2e transient-error pattern.
 3. prod-smoke.mjs comment at step 11b: ROLEWRIGHT_GRIEVANCE_* in the parent environment without
    ROLEWRIGHT_EXPECT_GRIEVANCE=1 fails the step.
 4. Remote mode: when SMOKE_BASE_URL is set (https only), build and start nothing, and run only steps that
    need no sign-in and write nothing:
      - GET / and /sign-in: 200, HSTS present, CSP with a nonce, no dev sign-in form.
      - GET /privacy: 200; the grievance check under the existing ROLEWRIGHT_EXPECT_GRIEVANCE rule.
      - GET /api/health: 200 { ok: true }.
      - GET /api/facts with no cookie: 401. POST /api/internal/purge with no token: 401.
      - POST /api/auth/callback/dev (the dev provider): refused.
      - GET /api/providers with no cookie: 401.
    Print which steps were skipped and why. Remote mode never sends an x-llm-key header.
 5. Remote, signed-in, opt-in: when SMOKE_SESSION_COOKIE is also set (the owner's own staging session, read
    from the environment, never printed): time one GET of a tailoring id given in SMOKE_TAILORING_ID and print
    the milliseconds (the gate-timing line for P1-7).
Run: cd apps/web && node --check tests/integration/run.mjs && node --check tests/integration/prod-smoke.mjs
     && node --check tests/e2e/run.mjs && node --check tests/e2e/helpers.mjs
Done when: syntax checks pass; the diff changes no assertion of an existing local step.
Harness impact: this is the harness. P1-T1 proves it with two same-port runs back to back.
Risks: written without running it. Keep the change small; do not restructure the files.
```

```
Task: P1-23 Docs pass 1
Worker: Haiku
Goal: The READMEs and ADR 0004 say only what the code does.
ADRs: 0003, 0004, 0005
Touches (only these):
  README.md
  apps/web/README.md
  docs/adr/0004-data-protection-dpdp.md
  package.json (repo root, engines only)
Steps:
 1. README.md:3 "so nothing invented reaches a recruiter" -> "The export is refused when a changed line states
    something your confirmed facts do not. The check catches invented employers, figures, credentials and
    seniority words; it does not understand meaning, so you still review every change."
    Search both READMEs for "nothing invented", "never invent", "guarantee" and fix each the same way.
 2. README.md:17 provider list -> "Gemini, OpenRouter or Anthropic".
 3. apps/web/README.md:9 "Node 22.13 or later" -> "Node 22.18 or later (24 recommended)". Root package.json
    engines.node -> the same range as apps/web/package.json.
 4. LR P1-12 wording, apps/web/README.md:25: state plainly that the embedded database is refused only on a
    deployed host (K_SERVICE or ROLEWRIGHT_DEPLOYED=1); with NODE_ENV=production elsewhere it is allowed and
    logs one warning. Add: "Do not run a public server that way."
 5. ADR 0004 line 17: the purge is scheduled by Cloud Scheduler calling POST /api/internal/purge;
    `npm run purge:inactive` is the fallback. Add a dated "Amended" note; do not change the decision.
 6. apps/web/README.md:157: keep the sentence that Google and email-link sign-in have never been run.
Run: none.
Done when: each numbered sentence is changed and nothing else is.
Harness impact: none.
Risks: do not describe Phase 1 features; P1-24 does that after they exist.
```

```
Task: P1-26 Delete the legacy UI (only if the owner approves)
Worker: Haiku
Goal: packages/engine/web and its CI are gone, with ADR 0007 amended to say so.
ADRs: 0007
Touches (only these):
  packages/engine/web/** (delete)
  .github/workflows/web-ci.yml (delete)
  packages/engine/tests/* that import from web/ or test only it (delete; list each in the report)
  packages/engine/AGENTS.md, packages/engine/README.md, packages/engine/test-all.mjs (remove references)
  .github/workflows/app-ci.yml is NOT yours (P1-17); report the `!packages/engine/web/**` filter for P1-T1
  docs/adr/0007-application-tracker.md (dated "Amended" note: deleted in Phase 1 by owner decision)
Steps:
 1. `git grep -n "packages/engine/web\|web/src\|web-ci"` and list every hit before deleting.
 2. Delete; remove references; keep headless-permission text that names web/src only as history if a test
    reads it, and report it.
Run: cd packages/engine && node --check test-all.mjs; git grep for the deleted paths returns only docs/reviews
  and ADR history.
Done when: no code or workflow refers to the deleted paths.
Harness impact: engine test-all sections for the web UI disappear; P1-25 updates the baseline.
Risks: AGENTS.md says headless permission rules live in web/src/lib/claude-invocation.mjs; say in the report
  what replaced that reference.
```

## Wave 2

```
Task: P1-2 Free trial
Worker: Sonnet
Goal: A verified account with no key gets 5 tailorings on our keys, counted so that concurrency and failures
  cannot give a sixth or lose one unfairly, and our keys never leave the server.
ADRs: 0003
Touches (only these):
  apps/web/src/lib/server/llm-key.ts
  apps/web/src/lib/server/trial.mjs (new)
  apps/web/src/lib/db/trial.mjs (new)
  apps/web/src/lib/db/schema.mjs (append)
  apps/web/src/app/api/tailorings/route.ts
  apps/web/src/app/api/resume/route.ts
  apps/web/src/app/api/trial/route.ts (new)
  apps/web/src/lib/client/trial.ts (new)
  apps/web/src/components/key-view.tsx
  apps/web/src/components/tailor-form.tsx
  apps/web/src/components/resume-view.tsx
  apps/web/src/i18n/en.ts (append, as en.trial)
  apps/web/tests/trial.test.mjs (new)
  apps/web/tests/consent-callsites.test.mjs (new)
Schema block (append unchanged):
  -- P1-2
  CREATE TABLE IF NOT EXISTS trial_counters (
    user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    tailorings_used integer NOT NULL DEFAULT 0 CHECK (tailorings_used BETWEEN 0 AND 5),
    uploads_used integer NOT NULL DEFAULT 0 CHECK (uploads_used BETWEEN 0 AND 3),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  ALTER TABLE trial_counters ENABLE ROW LEVEL SECURITY;
  ALTER TABLE trial_counters FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS trial_counters_isolation ON trial_counters;
  CREATE POLICY trial_counters_isolation ON trial_counters
    USING (user_id = current_setting('app.user_id')::uuid)
    WITH CHECK (user_id = current_setting('app.user_id')::uuid);
  GRANT SELECT, INSERT, UPDATE ON trial_counters TO rolewright_app;
Definitions:
  Verified account: users.email_verified is set, OR the user has an accounts row with provider "google"
  (auth.ts admits Google only when email_verified is true, but Auth.js leaves users.email_verified null for
  Google). The development sign-in is never verified. Read through db.system in db/trial.mjs.
  Owner question open: whether the trial pays for resume reading. Built as TRIAL_UPLOADS = 3; with 0 the
  upload route refuses trial requests.
Steps:
 1. db/trial.mjs:
      reserve(db, userId, kind) — one statement inside withUser:
        INSERT INTO trial_counters (user_id, tailorings_used) VALUES ($1, 1)
        ON CONFLICT (user_id) DO UPDATE SET tailorings_used = trial_counters.tailorings_used + 1,
          updated_at = now() WHERE trial_counters.tailorings_used < 5 RETURNING tailorings_used
        (and the same for uploads_used < 3). No row returned = exhausted.
      refund(db, userId, kind): decrement, never below 0.
      status(db, userId) -> { verified, tailoringsLeft, uploadsLeft }.
 2. trial.mjs: trialConfig(env) -> ordered list of { provider, key, model } from the four ROLEWRIGHT_TRIAL_*
    variables (Gemini first, then OpenRouter); empty when no key is set. runWithTrial(fn): try each in order;
    move to the next only on LlmError quota, rate_limited or provider_error; map final failure to LlmError
    "quota" with en.trial.unavailable ("The free trial is not available right now. Add your own AI key to
    continue.").
 3. llm-key.ts readLlmHeaders: `x-llm-provider: trial` with NO x-llm-key header returns { provider: "trial" }.
    A request that sends both is refused. Nothing else changes for user keys.
 4. tailorings/route.ts and resume/route.ts, trial path, in this order: requireUser; verified check (403
    "trial_not_verified"); requireConsent(userId, "trial"); await takeRateLimit("trialIp",
    ipSubject(clientIp(req.headers, process.env))); the existing per-user limit; reserve (402 "trial_used_up",
    message en.trial.usedUp: "You have used your 5 free tailorings. Add your own AI key to continue.");
    model call through runWithTrial; on ANY failure after the reserve and before the tailoring row is
    written, refund in a finally path. Store provider and model actually used on the tailoring row.
    User-key path: pass llm.provider to requireConsent. Keep P1-16's line selection before the model call.
 5. api/trial GET: status for the signed-in user plus `available` (trialConfig non-empty). No key, no model
    secret. client/trial.ts: a hook for it.
 6. UI: key-view.tsx shows tailorings left and says the trial uses Google Gemini or OpenRouter free models,
    which may pass the fact check less often; tailor-form.tsx and resume-view.tsx send `x-llm-provider: trial`
    when no key is held and the trial is available, show what is left, and at zero show the "add your key"
    link. The consent text for the trial names both providers (en.trial.consentLead).
 7. Tests (PGlite; model calls stubbed by injecting the complete function):
      - six concurrent reserves from a fresh account: exactly 5 succeed; the model stub is called 5 times.
      - a model failure refunds; a success does not; refund never goes below 0.
      - unverified account: refused before any reserve or model call. Google-linked account with null
        email_verified: allowed.
      - trial keys: serialise every response body, every thrown error and every stored row from the tests and
        assert the key strings are absent; console output captured during the tests does not contain them.
      - user B cannot read or change user A's counter.
      - consent-callsites.test.mjs: every `requireConsent(` call under src/app passes two arguments.
Run: cd apps/web && npm run typecheck && node --test tests/trial.test.mjs tests/consent-callsites.test.mjs
     tests/consent.test.mjs tests/llm.test.mjs
Done when: step 7 tests fail before and pass after.
Harness impact: flow step for "no key -> error" changes when trial keys are configured (they are not in the
  harness, so `available` is false; assert that path); new e2e step needed for the trial UI with the mock.
Risks: a crash between reserve and refund costs the user one trial; accepted. Deleting and re-creating an
  account resets the counter; accepted until the deletion-record ADR. scrub() must cover trial keys in
  provider error paths.
```

```
Task: P1-3b Sign-in and email-link limits
Worker: Sonnet
Goal: Sign-in attempts are limited per IP and email-link sends per address, counted in the shared store.
ADRs: 0006
Touches (only these):
  apps/web/src/auth.ts
  apps/web/src/app/api/auth/[...nextauth]/route.ts
  apps/web/tests/signin-limit.test.mjs (new)
Steps:
 1. [...nextauth]/route.ts: wrap POST only. Before calling the Auth.js handler:
    await takeRateLimit("signInIp", ipSubject(clientIp(req.headers, process.env))). On refusal answer 429 with
    Retry-After and a plain message. GET is untouched (session reads, callbacks).
 2. auth.ts adapter.createVerificationToken: before storing, await takeRateLimit("emailSend",
    ipSubject(identifier.toLowerCase())) (the same hashing helper; the subject is a hash of the address).
    This runs after P1-14's allowlist refusal, so a refused address spends nothing. Confirm in the report that
    Auth.js stores the token before it sends, so a throw here sends no email.
 3. Tests: the 21st POST in 10 minutes from one IP is 429 and the handler is not called; a spoofed leftmost
    x-forwarded-for does not get a fresh bucket; the 6th token for one address in an hour throws and stores
    nothing; no raw IP or address is written to rate_events.
Run: cd apps/web && npm run typecheck && node --test tests/signin-limit.test.mjs tests/signup-gate.test.mjs
Done when: step 3 tests fail before and pass after; P1-14's tests still pass.
Harness impact: e2e and flow sign in many times from one IP through the dev provider; 20 per 10 minutes may be
  hit. Report the count so P1-T1 can decide whether the harness needs a higher test-only limit through an
  environment variable that env-guard refuses on a strict environment.
Risks: users behind one office or campus IP share the sign-in bucket.
```

```
Task: P1-4 Provider parity script
Worker: Sonnet
Goal: One command measures fact-gate pass rate and keyword coverage per provider and model, offline against
  the mock and with real keys when the owner runs it.
ADRs: 0003
Touches (only these):
  apps/web/scripts/provider-parity.mjs (new)
  apps/web/tests/fixtures/parity/ (new: 5 synthetic resumes as facts JSON, 5 job descriptions)
  apps/web/tests/provider-parity.test.mjs (new)
  docs/reviews/provider-parity.md (new, template with an empty table)
Steps:
 1. Usage: node scripts/provider-parity.mjs --provider <id> [--model <id>] [--out <file>]. The key is read
    from PARITY_KEY in the environment only; never from an argument; never printed, logged or written.
    --provider mock needs ROLEWRIGHT_ALLOW_MOCK_LLM=1 and no key.
 2. For each fixture pair: tailorableLines -> selectLines -> suggestRewrites -> buildSuggestions with the real
    engine gate (loadFactGate). Record: rewrites returned; share with verdict pass, warn, block; issue kinds
    for blocks; keyword coverage before and after (src/lib/keyword-match.mjs) with every non-blocked rewrite
    applied; elapsed time. No resume or job text in the output, only counts and fixture ids.
 3. Output: a markdown table row per fixture and a summary row, appended to --out or printed.
 4. Test: runs the script's exported run() against the mock for all fixtures; asserts the table shape and
    that the output contains no fixture text and no key.
 5. provider-parity.md: how to run it, what "accepted" means (owner signs the row), and that a provider or a
    trial model stays hidden until its row exists.
Run: cd apps/web && ROLEWRIGHT_ALLOW_MOCK_LLM=1 node --test tests/provider-parity.test.mjs
Done when: the test passes; the script exits non-zero when the engine gate cannot load.
Harness impact: none.
Risks: fixtures must be invented people. Free models may return too little to measure; report counts, not
  only rates.
```

```
Task: P1-5b Keyword coverage in the review screen
Worker: Sonnet
Goal: The review screen shows how many of the job's keywords the resume covers before and after the accepted
  changes.
ADRs: 0016
Touches (only these):
  apps/web/src/app/api/tailorings/[id]/coverage/route.ts (new)
  apps/web/src/components/keyword-coverage.tsx (new)
  apps/web/src/components/review-view.tsx
  apps/web/src/lib/client/types.ts
  apps/web/src/i18n/en.ts (append)
  apps/web/tests/coverage-view.test.mjs (new)
Steps:
 1. Route GET: requireUser; await takeRateLimit("tailoring", userId); getTailoring (404 for another user's
    id, same notFound as the sibling routes); keywords = keywordsFromJdText(jdText); before = resumeText of
    buildResume(facts, []); after = resumeText of buildResume(facts, suggestions). Answer
    { before: { covered, total }, after: { covered, total }, missing: string[] (at most 30) }. The fact gate
    is not run here and nothing is stored.
 2. keyword-coverage.tsx: "Job keywords covered: 14 of 22 before, 17 of 22 with your accepted changes", and
    the missing list under a disclosure. A line under it: "Missing keywords are shown for information. Add one
    only if it is true for you." No control that inserts a keyword.
 3. review-view.tsx: render the component under the stats; refetch after an accept, reject or edit.
 4. Test the pure part: a helper coverageFor(facts, suggestions, jdText) exported from the route's sibling
    module or from keyword-match.mjs consumers; before/after differ when an accepted suggestion adds a JD
    term; job-description text with regex characters does not throw.
Run: cd apps/web && npm run typecheck && node --test tests/coverage-view.test.mjs tests/keyword-match-parity.test.mjs
Done when: tests pass; the route file contains no write.
Harness impact: a new e2e check for the coverage line (P1-T1 adds it).
Risks: coverage must never nudge invention; the copy in step 2 is the control and P1-24 does not soften it.
```

```
Task: P1-18 Erasure below account level
Worker: Sonnet
Goal: A user can delete one tailoring with its job description, and the stored text of their uploaded
  resumes, without deleting the account.
ADRs: 0004
Touches (only these):
  apps/web/src/app/api/tailorings/[id]/route.ts
  apps/web/src/app/api/resumes/route.ts (new)
  apps/web/src/lib/db/repo.mjs
  apps/web/src/components/home-view.tsx
  apps/web/src/app/app/privacy/page.tsx
  apps/web/src/components/delete-resume-text.tsx (new)
  apps/web/src/i18n/en.ts (append)
  apps/web/tests/erasure.test.mjs (new)
Steps:
 1. repo.mjs: deleteTailoring(db, userId, id) inside withUser: delete the tailoring, then its job when no
    other tailoring uses it; returns whether a row was deleted. deleteResumeTexts(db, userId): deletes the
    user's resumes rows; returns the count. Confirmed facts are not touched by either.
 2. DELETE /api/tailorings/[id]: requireUser; await takeRateLimit("tailoring", userId); 404 when nothing was
    deleted (same answer for a missing id and another user's id); 204 on success.
    DELETE /api/resumes: requireUser; 200 { deleted: n }.
 3. home-view.tsx: a "Delete" control per tailoring with a confirm step that names the job title; focus moves
    to the list heading afterwards. privacy page: a "Delete my uploaded resume text" section using the new
    component, which says the confirmed facts stay.
 4. Tests (PGlite): user B cannot delete user A's tailoring (404, row still there); deleting removes the job
    row; a job shared by two tailorings survives the first delete; deleteResumeTexts removes only the caller's
    rows; both run as rolewright_app (through withUser), never through db.system.
Run: cd apps/web && npm run typecheck && node --test tests/erasure.test.mjs
Done when: tests fail before and pass after.
Harness impact: new e2e steps for both deletions; prod-smoke step 13 (account deletion on /app/privacy) must
  still find its control.
Risks: the page now has two destructive controls; wording must make the difference plain.
```

```
Task: P1-20 App fact gate: credentials, ranks, tenure, languages, unreadable text, sync test
Worker: Sonnet (may escalate to Opus after one failed review round)
Goal: The strict layer blocks the owner's listed categories, refuses text it cannot read, treats an engine
  coverage gap as a block, and stays in step with the engine's lists.
ADRs: 0005
Touches (only these):
  apps/web/src/lib/claims.mjs
  apps/web/src/lib/tailoring.mjs
  apps/web/src/components/suggestion-card.tsx
  apps/web/src/i18n/en.ts (append)
  apps/web/tests/fixtures/honest-lines.mjs (add lines only)
  apps/web/tests/claims-phase1.test.mjs (new)
  apps/web/tests/claim-lists-sync.test.mjs (new)
  apps/web/tests/claims.test.mjs
  apps/web/tests/tailoring.test.mjs
Inputs: merged P1-19 (engine exports) and P1-21 (number-context.mjs). All of these pass both layers today
  against SOURCE_V: "Completed a bachelor's degree in commerce"; "Ranked 1st among analysts"; "Ranked first in
  the region"; "Second-highest rated analyst"; "Over a decade of experience in finance"; "fluent in german and
  french"; "Bilingual analyst who managed vendor contracts"; a full Devanagari line.
Steps:
 1. claims-phase1.test.mjs first, seen failing. Against SOURCE_V unless stated.
    MUST BLOCK (issue value shown after the arrow; value must be a phrase the user can confirm as a fact):
      "Completed a bachelor's degree in commerce"          -> bachelor's degree
      "holds a master's degree in finance"                 -> master's degree
      "b.tech graduate who managed vendor contracts"       -> b.tech
      "pmp and cfa charterholder"                          -> pmp, cfa
      "Ranked 1st among analysts"                          -> Ranked 1st
      "Ranked first in the region"                         -> Ranked first
      "Second-highest rated analyst"                       -> Second-highest
      "top 5 performer in the team"                        -> top 5
      "Best performer award"                               -> Best performer, award
      "Over a decade of experience in finance"             -> decade
      "several years of experience in finance"             -> several years
      "extensive experience across many years"             -> many years
      "fluent in german and french"                        -> german, french
      "Bilingual analyst who managed vendor contracts"     -> Bilingual
      "native tamil speaker"                               -> tamil
      "Assistant manager for vendor contracts" with facts adding the bullet
          "- Reported to the Finance Manager"              -> manager (a bullet does not support a title word)
      "Certified expеrt in vendor management"          -> the mixed-script token, kind "unreadable"
      a line wholly in Devanagari                           -> kind "unreadable"
      any line, when the engine result has coverage.reason "scope-not-checked" or a reason not in the
          allow list                                        -> kind "coverage"
      "Led a team of 12 analysts" with facts adding "- Supported the audit of 12 branches" -> 12 analysts
      "Led vendor contracts" with facts adding "- Assisted with vendor contracts" (through the engine gate)
    MUST PASS: every HONEST line (strict alone and with the engine); and, with the fact added:
      facts add extra "Ranked 1st among analysts"          : "Ranked 1st among analysts"
      facts add extra "bachelor's degree in commerce"       : "Completed a bachelor's degree in commerce"
      facts add extra "Fluent in German"                    : "Fluent in German and English" blocks only English
      facts with title "**Assistant Manager**"              : "Assistant manager for vendor contracts"
      facts title "VP" : "Vice President of finance"; facts title "Senior Manager" : "Sr. Manager"
      facts containing a Devanagari token verbatim          : a line reusing exactly that token
    ATTEST: for one case each of rank, tenure, language, credential and number-context, applyAction "attest"
      with the issue value unblocks the suggestion (tailoring.test.mjs).
 2. CLAIM_FAMILIES: mirror P1-19's additions exactly. Add kinds:
      credential: degree(s); bachelor('s)/bachelors; master's/masters (never bare "master"); b.tech/btech;
        m.tech/mtech; b.e.; b.sc/bsc; m.sc/msc; b.com/bcom; m.com/mcom; bba; bca; mca; pgdm; pgdba; mbbs; llb;
        cpa; cfa; pmp; frm; acca; cma; icwa; honours/honors; distinction; "first class"; "gold medal";
        "rank holder"; valedictorian; "cum laude"; "dean's list". Not "graduate", not "qualified" (HONEST).
      rank: ranked/rank/ranking; ordinals 1st to 10th and first to tenth when within 3 words of ranked,
        placed, stood, secured, position, rank, highest, best, top; "top N" and "top N%"; best; highest;
        "#1"; "number one"; "no. 1"; winner. Stop deleting ordinals in prepNumbers for this check only.
      tenure: decade(s); several/many/multiple/numerous/countless/a few/couple of + years; "long-standing";
        "years of experience" with no figure before it.
      language: the names Hindi, English, Tamil, Telugu, Kannada, Malayalam, Marathi, Bengali, Gujarati,
        Punjabi, Urdu, Odia, Assamese, Sanskrit, French, German, Spanish, Mandarin, Chinese, Japanese, Korean,
        Arabic, Russian, Portuguese, Italian, Dutch; and bilingual, trilingual, multilingual, polyglot,
        "mother tongue", "native speaker". "fluent" and "proficient" are not listed (honest lines say
        "fluency in SQL"); the language name carries the block.
    Engine-only kinds stay out of the engine list: the sync test compares the four shared kinds and requires
    the app-only kinds to be declared in an APP_ONLY_KINDS constant.
 3. Seniority support: a seniority word is supported only by a title line (`**…**`), the summary, or the
    "Additional facts stated by the candidate" section of sourceText. Other kinds keep whole-text support.
 4. Name check: skip a name-shaped word that is a claim form whose family is supported (covers Sr./Senior and
    VP/Vice President).
 5. Unreadable text: after cleanText, a token with letters from two scripts blocks always. A token wholly
    outside Latin blocks unless that exact token is in factTokenSet(sourceText). Kind "unreadable", value ""
    (not attestable), message: "This line has text the fact check cannot read (letters outside the English
    alphabet). Rewrite it in English letters, or remove it."
 6. Engine coverage: export NON_BLOCKING_COVERAGE = ["no-count-claims-recognized"] with a comment giving the
    reason (the strict layer checks every figure itself). Any other non-null coverage.reason adds an issue of
    kind "coverage", value "", with the message: "The fact check could not read this line fully, so it is
    blocked. Rewrite it in plain English."
 7. Wire unsupportedNumberContexts into checkText: kind "number", value from the library.
 8. claim-lists-sync.test.mjs: load the engine through importEngineFile; for the four shared kinds the
    families deep-equal the app's (order-insensitive); every engine COVERAGE_REASONS value is either in
    NON_BLOCKING_COVERAGE or covered by the blocking test; fails with a message naming both files.
    Export CLAIM_FAMILIES from claims.mjs for the test.
 9. tailoring.mjs: issues with an empty value are never attestable or markable (currentIssue ignores them).
    suggestion-card.tsx: no "This is true" or "I can't confirm" buttons for an issue whose value is empty
    (covers facts_too_large, engine, coverage, unreadable); the message and the edit control remain.
10. Gate cost. tests/gate-cost.test.mjs fails on Node 22.18 in CI today (25.7 ms x 20 = 514 ms against 500)
    and must pass unchanged on both Node legs after this task. In checkText, compute everything derived only
    from sourceText once per source (factTokenSet, numberClaims(sourceText), the claim predicate, the
    seniority subset) behind a one-entry cache keyed on the string. Report ms per call before and after. If
    the margin still does not hold, stop and report; lowering MAX_SUGGESTIONS is an owner decision and
    relaxing the assert is not allowed.
11. Update the header comment of claims.mjs: covered, not covered. Add at least 20 new HONEST lines that use
    nearby innocent words ("first", "top-level summary", "master data", "English-language reports" is NOT
    honest unless in facts, so do not add it) and confirm each passes.
Run: cd apps/web && npm run typecheck && node --test tests/claims-phase1.test.mjs tests/claim-lists-sync.test.mjs
     tests/claims.test.mjs tests/claims-bypass.test.mjs tests/engine-gate.test.mjs tests/engine-bypass.test.mjs
     tests/tailoring.test.mjs tests/gate-cost.test.mjs tests/number-context.test.mjs
Done when: every MUST BLOCK fails before and passes after; every MUST PASS and all HONEST lines pass; the sync
  test fails when one word is removed from either list (state this, then revert); gate-cost passes unedited.
Harness impact: flow and e2e fixtures whose accepted lines now block (any using first/top/best, a language
  name, a degree word or a figure in a new context); e2e step g3 wording for grouped issues.
Risks: more honest lines blocked; that is the decision (ADR 0005). Report every HONEST line that needed a list
  change. Do not remove a word from a list to make a fixture pass without saying so.
```

```
Task: P1-24 Copy pass and docs pass 2
Worker: Haiku
Goal: The privacy notice and READMEs describe Phase 1 as merged, and the notice version moves with the text.
ADRs: 0003, 0004
Touches (only these):
  apps/web/src/i18n/en.ts (existing keys; you are the only editor of them)
  apps/web/src/lib/notice.mjs (NOTICE_VERSION only)
  apps/web/tests/fixtures/notice-lock.json
  apps/web/tests/notice.test.mjs
  README.md
  apps/web/README.md
Inputs: the wave 2 briefs above (P1-2, P1-15, P1-16, P1-18) and the merged wave 1 code.
Steps:
 1. en.app.privacy: (a) "What goes to your AI provider" also covers the free trial: text goes to Google Gemini
    or OpenRouter on Rolewright's key; (b) recipients list gains OpenRouter and names the trial; (c) stored
    data gains: the consent record now includes the provider named, a count of free-trial uses, and
    short-lived rate-limit records keyed by a scrambled form of the IP or email address; (d) deletion: one
    tailoring or the uploaded resume text can be deleted on its own. Do NOT restore the "scheduled job"
    sentence (P1-27 does, after staging).
 2. Bump NOTICE_VERSION to today's date with suffix .1; update notice-lock.json (version and hash; the lock
    test prints the new hash); update notice.test.mjs expectations that count recipients.
 3. apps/web/README.md: environment table rows for every name in "Shared names" that is an environment
    variable; a "Sign-ups" section (three modes, the deployed default, how to add an address); a "Migrations
    and database roles" section (owner and login roles, `npm run db:migrate`, the start-up role check); under
    "Adding a table": a table with user data needs RLS and a policy; a table without it goes in
    SYSTEM_TABLES; tests/db-structure.test.mjs enforces this. Root README: one line on the free trial.
 4. Plain English throughout; no claim the code does not back.
Run: cd apps/web && node --test tests/notice.test.mjs tests/notice-lock.test.mjs
Done when: both tests pass; the advisor can match each notice sentence to code.
Harness impact: prod-smoke and e2e steps that match notice text or the version string.
Risks: this text is public and unreviewed by a lawyer; keep to facts.
```

```
Task: P1-25 Engine baseline cleanup
Worker: Sonnet
Goal: The engine workflow is green: each of the known failures is fixed, or its test is removed with a reason.
ADRs: 0012, 0013
Touches (only these):
  packages/engine/** EXCEPT verify-cv-facts.mjs, keyword-match.mjs and tests/verify-cv-facts-*,
    tests/fact-gate-*, tests/keyword-match*
  docs/reviews/test-baseline.md
Inputs: docs/reviews/test-baseline.md "Known pre-existing engine failures"; the failing names from the engine
  job on draft PR #8 (27 failures: tracker-service missing imports, README structure and usage tests, skill
  entrypoint copies, walk-tree, the legacy web doctor route, writer-scripts-data-root, set-status tests).
  If P1-26 ran, the legacy web failures are already gone.
Steps:
 1. For each failure, pick one and say which in the report: (a) fix the code or the committed file mode or
    symlink; (b) fix the test where the restructure moved what it reads; (c) delete the test because the
    feature was removed from this fork (name the commit or ADR). Never weaken an assertion to pass.
 2. Lock-timeout tests that fail only under parallel load: fix the cause if it is in the test's set-up;
    otherwise leave them on the baseline list with the reason.
 3. Update test-baseline.md: a new row, and the remaining list (aim: empty).
 4. CodeQL: the six alerts in test helpers and the scaffolder are false positives; do not change code for
    them. List them in the report so the owner can dismiss them.
Run: cd packages/engine && node --test <each file you touched>; npm run lint
Done when: every previously failing file passes alone, or is deleted with a recorded reason.
Harness impact: test-all counts change; P1-T1 compares by name against the updated baseline.
Risks: a deleted test may have guarded something still used by apps/web (the fact gate, the renderer). Check
  `git grep` for the tested module under apps/web before deleting.
```

## TEST wave

```
Task: P1-T1 TEST wave runner
Worker: Sonnet
Goal: Run every suite once on the merged branch, bring the harness in line with the briefed behaviour
  changes, and report each failure precisely enough to brief a fix.
ADRs: 0017, 0018
Touches (only these):
  apps/web/tests/integration/run.mjs
  apps/web/tests/integration/prod-smoke.mjs
  apps/web/tests/e2e/run.mjs
  apps/web/tests/e2e/helpers.mjs
  .github/workflows/app-ci.yml (only the paths filter, and only if P1-26 ran)
  docs/reviews/test-baseline.md (new measurement row)
Must not touch: any file under src/, packages/engine, or a unit test. A failing unit test or product bug is
  reported, not fixed.
You may: start servers, browsers and the local Postgres 16 cluster.
Steps:
 1. cd apps/web && npm ci && npm run typecheck.
 2. npm test (embedded database). Record counts and every failing test name.
 3. Postgres: start the local cluster (pg_ctlcluster 16 main start, or initdb in a temporary directory);
    create the roles from infra/sql/bootstrap-roles.sql with test passwords.
    (a) owner mode: ROLEWRIGHT_REQUIRE_PG=1 with ROLEWRIGHT_TEST_DATABASE_URL and ROLEWRIGHT_TEST_ADMIN_URL.
    (b) non-owner mode: add ROLEWRIGHT_TEST_OWNER_URL. Nothing may skip in either.
 4. Harness alignment. Collect every "Harness impact" line from the merged briefs and the workers' reports.
    Change the harness only for those. Typical: consent now needs a provider and a storage consent; provider
    list has three entries; sign-in limit; new steps for trial UI (mock), coverage line, the two deletions,
    the truncation notice, /api/health; one check that after client-side navigation to /privacy in the
    production build the first Tab lands on the skip link. Anything else that fails is reported for triage.
 5. npm run test:flow; npm run build; PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=… npm run test:e2e; the same for
    npm run test:prod. Run test:flow twice back to back on the same port to prove no server leaks.
 6. cd packages/engine && npm run lint && node verify-cv-facts.mjs --self-test && node test-all.mjs --quick.
    Compare failing names with docs/reviews/test-baseline.md.
 7. Commit the harness changes on task/P1-T1 for advisor review. After merge and push, read CI on the draft
    PR: App CI on 22.18 and 24 (0 skipped, gate-cost passing), the engine workflow, deploy.yml's image-build
    and Terraform-validate jobs, CodeQL. Docker is not available locally; the image is proven there.
 8. cd apps/web && ROLEWRIGHT_ALLOW_MOCK_LLM=1 node scripts/provider-parity.mjs --provider mock.
Report: one table: step, command, pass and fail counts, duration. Then one entry per failure: suite, test or
  step name, first error lines, the file and line you believe is at fault, and your classification (briefed
  harness change you made; unbriefed harness change needed; product bug; flake after one re-run).
Re-runs: after the orchestrator merges fix tasks (P1-F1, …), re-run the failed suite plus typecheck and
  npm test; when clean, run steps 2 to 7 once in full. Stop after three full passes that are not clean.
Done when: one full pass is clean, or the stop rule is reached and reported.
Risks: the harness was edited blind in the build wave (P1-22); expect the first run of each harness to need
  work. Keep each harness change traceable to a brief line in the commit message.
```

## After the TEST wave

```
Task: P1-7 Staging deploy and smoke
Who: the owner deploys; the orchestrator checks. No worker has Google Cloud credentials.
Steps (also in docs/runbook/gcp.md):
 1. Owner: create the staging project, run bootstrap-roles.sql, put the secrets in Secret Manager (including
    the owner's own address in ROLEWRIGHT_SIGNUP_ALLOWLIST), terraform apply with staging.tfvars, run the
    migrate job, deploy. ROLEWRIGHT_SIGNUPS stays "allowlist".
 2. Orchestrator: SMOKE_BASE_URL=<staging URL> npm run test:prod. All remote steps pass.
 3. Owner, signed in on staging (manual checklist): Google sign-in works; an address not on the list is
    refused; add a key and check it; upload a resume; confirm facts; tailor; accept a change; export a PDF;
    try the free trial without a key; delete one tailoring; then give the orchestrator a session cookie and a
    tailoring id for the gate-timing step (within 2x of the local figure, or the caps are revisited).
 4. Owner: trigger the Cloud Scheduler job once; confirm 200 and `{ "purged": n }` in the logs; break the
    audience on purpose once and confirm the alert email arrives; restore it.
 5. Orchestrator and owner: search the request logs for "x-llm-key" and for the first 8 characters of the key
    used in step 3: no hits. Confirm Cloud Run and Cloud SQL are in asia-south1.
 6. Record the results in the EXECUTION.md log. Then dispatch P1-27.
```

```
Task: P1-27 Restore the scheduler sentence
Worker: Haiku
Goal: The notice again says a scheduled job checks for inactive accounts once a day, now that it does.
Touches (only these): apps/web/src/i18n/en.ts (the retention line), apps/web/src/lib/notice.mjs,
  apps/web/tests/fixtures/notice-lock.json, apps/web/tests/notice.test.mjs
Steps: restore the sentence; bump NOTICE_VERSION; update the lock and any test that matches the line.
Run: cd apps/web && node --test tests/notice.test.mjs tests/notice-lock.test.mjs
Done when: both pass. Only after P1-7 step 4 is recorded.
```

## Touches check (file -> tasks, per wave)

Wave 1, files with more than one task: `en.ts` (append rule); `schema.mjs` (append rule: P1-3, P1-15, P1-16,
P1-17). No other file appears twice. Route ownership in wave 1: keys/verify, tailorings/[id], suggestions,
export -> P1-3; tailorings (collection) -> P1-16; resume, facts, consent -> P1-15; providers -> P1-1; health ->
P1-17. `auth.ts` and `env-guard.mjs` -> P1-14. `client/types.ts`, `views.ts`, `repo.mjs`, `tailoring.mjs`,
`review-view.tsx` -> P1-16. `key-view.tsx`, `app-header.tsx` -> P1-1. `tailor-form.tsx`, `resume-view.tsx` ->
P1-15. `apps/web/package.json`, `app-ci.yml`, `db/index.mjs`, `instrumentation.ts`, `tests/db.test.mjs` ->
P1-17. READMEs -> P1-23. Harness files -> P1-22. `verify-cv-facts.mjs` -> P1-19. Engine `keyword-match.mjs` ->
P1-5. `packages/engine/web/**` -> P1-26.

Wave 2, files with more than one task: `en.ts` (append; P1-24 edits existing keys). No other file appears
twice. tailorings (collection), resume route, `llm-key.ts`, `key-view.tsx`, `tailor-form.tsx`,
`resume-view.tsx`, `schema.mjs` -> P1-2. `auth.ts`, nextauth route -> P1-3b. `tailorings/[id]/route.ts`,
`repo.mjs`, `home-view.tsx`, privacy page -> P1-18. `review-view.tsx`, `client/types.ts` -> P1-5b.
`claims.mjs`, `tailoring.mjs`, `suggestion-card.tsx`, `honest-lines.mjs`, `tests/claims.test.mjs`,
`tests/tailoring.test.mjs` -> P1-20. `notice.mjs`, `notice-lock.json`, `tests/notice.test.mjs`, READMEs ->
P1-24. Engine files other than the gate and keyword-match -> P1-25.

## Follow-up map (every unowned Phase 0 follow-up)

Rows already closed inside Phase 0 (owner column names a merged P0 task, "Merge order", or "Accepted") are not repeated. Every other row:

| From | Item (start of row) | Goes to |
|---|---|---|
| P0-7 | "Cloud Run startup and health probes must hit an app route" | P1-17 (`/api/health`) and P1-6 (probes) |
| P0-5 | "Stale second tab keeps user A's key" | Phase 2 (`BroadcastChannel`). Accepted for the closed beta: needs two accounts on one browser |
| P0-5 | "Legacy `rolewright.llm` item removed only when an `/app/*` page loads" | Accepted: no public build ever stored it; e2e step b checks removal |
| P0-5 | "Key input may be offered to password managers" | P1-1 |
| P0-5 | "Dead `saveFailed` branch in `key-view.tsx`" | P1-1 |
| P0-1a | "Claim word supported by any token in the facts… require same role or title line" | P1-20 (seniority words need a title line, the summary or an added fact) |
| P0-1a | "Missing variants: principals, gurus, veterans…" | P1-19 and P1-20 |
| P0-1a | "Missing Indian-market titles and scope: mgr, gm, avp…" | P1-19 and P1-20 |
| P0-1a | "Homoglyphs… mixed-script token check" | P1-20 |
| P0-1a | "Name check blocks family-supported tokens (Sr. Manager)" | P1-20 |
| P0-1a re | "\"ph d\" (space, no dots) passes" | P1-19 and P1-20 |
| P0-1a re | "\"Vice President\" vs facts \"VP\" false-blocks" | P1-20 |
| P0-6 | "Set Cloud Run memory, request timeout and concurrency explicitly" | P1-6 |
| P0-6 | "Upload rate limit is per process" | P1-3 (call site awaited by P1-15) |
| P0-4 | "One real Cloud Scheduler call end to end" | P1-7 |
| P0-4 | "Log-only code to tell 'keys unavailable' from a bad token" | Phase 2 ops. Accepted: the P1-6 alert fires on either |
| P0-4 | "Alert when the daily purge stops succeeding" | P1-6 |
| P0-4 | "`getDb()` runs before auth, so a DB outage shows 500 not 401" | Accepted: both refuse; no data is exposed |
| P0-4 | "ADR 0004 line 17 still describes the purge as a host-scheduled script" | P1-23 |
| P0-4 re | "Cloud Scheduler job: at least 3 retries, minimum backoff 60 s" | P1-6 |
| P0-4 re | "Floor the key cache at 300 s" | Accepted: Google has always sent `max-age`; a miss costs one fetch |
| P0-10 | "Contact: per-field 'not found' marker; check phone, location, links" | Phase 2 facts task |
| P0-10 | "Job fields matched anywhere in the text" | Phase 2 facts task |
| P0-10 | "A skill only in a pasted job description counts as found" | Accepted: known limit of text matching; the user still confirms each skill |
| P0-10 | "User-added items inside sections are dropped on re-upload" | Phase 2 (product decision) |
| P0-10 | "A singly confirmed model item is unconfirmed again on every re-upload" | Accepted: as briefed; revisit on user feedback |
| P0-10 | "One manual run with a real model key" | P1-4 (owner's real-key run) |
| P0-3a | "Retention sentence is public: scheduler must run… lawyer review" | P1-7 and P1-27; lawyer review at the launch gate |
| P0-6b | "Size Cloud Run memory and concurrency from the bomb numbers" | P1-6 |
| P0-6b | "`execArgv: []` on the Worker" | Accepted, with a P1-6 rule: the image sets no `NODE_OPTIONS` |
| P0-6c | "Cloud Run memory at least 2 GiB, explicit concurrency, Node pinned" | P1-6 (Node floor already merged in `794dcc5`) |
| P0-6c | "Pass the request abort signal into `pdfText`" | Phase 2. Accepted: the queue is bounded by the concurrency cap |
| P0-6c | "Route-level test that a plain Error from `pdfText` becomes 500" | Phase 2. Accepted: covered by a source check today |
| P0-6c re | "503 `pdf_busy` has no `Retry-After`" | Phase 2. Accepted: the message tells the user to retry |
| P0-1b | "Cover letters: pass target role and company to the gate" | Phase 3 (ADR 0015) |
| P0-1b | "Indian magnitudes: lakh, crore, Mn" | P1-19 |
| P0-1b | "\"10k\" vs \"10,000\" not equal" | P1-19 |
| P0-1b | "Employer suffixes and cities block as unknown employers" | Phase 2 gate task (a false block, one click to confirm) |
| P0-1b | "Title-cased phrases after 'at' read as employers" | Phase 2 gate task (a false block) |
| P0-1b | "Old quadratic regex… confirm the app caps engine input size" | Accepted: closed by P0-13 (600-character lines, 30,000-character fact cap) |
| P0-1b | "Precompile per-family regex in `builtinClaimWordFacts`" | P1-19 |
| P0-1b | "\"Post Graduate Diploma\"… 'Executive summary', 'Enterprise reporting', 'award-winning'" | P1-19 and P1-20 |
| P0-1b | "Should an unsourced title in the engine's structured title slot block" | Owner question 4; default: stays a warning |
| P0-3b | "Retention notice drops 'A scheduled job checks…'" | P1-27 after P1-7 |
| P0-6d | "If the memory-bomb test flakes again" | Accepted: watch in the TEST wave; a second flake becomes a P1-Fx |
| P0-9a | "HSTS `includeSubDomains`: decide before mapping to an apex domain" | Owner decision at custom-domain time; recorded in the P1-6 runbook |
| P0-9a | "`console.error` + `process.exit(1)` can lose the message" | Accepted: only if prod-smoke step 2b flakes |
| P0-9a re | "Step 2b timeout path: set `child = null`" | P1-22 |
| P0-9a re | "Comment that `ROLEWRIGHT_GRIEVANCE_*` in the parent env… fails 11b" | P1-22 |
| P0-1b re | "Engine-only misses from the stop list" | Phase 3 (ADR 0015); the app strict layer catches them |
| P0-1b re | "\"Processed 14M evaluations for users\" reported as `14m users`" | P1-19 |
| P0-1b re | "Blank-line linear-time test is wall-clock based" | Accepted: watch in CI |
| P0-2 | "Proof of consent after deletion… tombstone" | Launch gate: owner and lawyer, new ADR |
| P0-2 | "Consent withdrawal other than account deletion" | Launch gate: same ADR |
| P0-2 | "Data export must include consent rows" | Phase 2 data export |
| P0-8 | "App CI has never run" | Done on PR #8: Node 24 green with 0 skipped. The Node 22.18 gate-cost failure goes to P1-19 and P1-20 |
| P0-8 | "Required check or informative" | Owner question 5 |
| P0-8 | "Run `tests/consent.test.mjs` on real Postgres too" | P1-17 |
| P0-8 | "Structural RLS check only finds tables with `user_id`" | P1-17 (structural test) and P1-24 (README guidance) |
| P0-8 | "Still unproven: app served through `pg` end to end, several server processes, Cloud SQL" | TEST wave step 3 and P1-7 |
| P0-8 | "Optional: second `changeFacts` lock probe" | Accepted: the first-row probe covers the lock path |
| P0-8 | "One unexplained PGlite `npm test` failure" | Accepted: watch; capture the name if it recurs in the TEST wave |
| P0-12 | "Notice says 'Google Cloud (Mumbai region)': confirm" | P1-7 |
| P0-13 | "Per-account gate load… per-user gate-time bucket" | P1-3 (`gateMs`) |
| P0-13 | "POST /api/tailorings sends up to 751 lines" | P1-16 |
| P0-13 | "Suggestion card shows confirm buttons for issues with an empty value" | P1-20 |
| P0-13 | "Unit test for the rate limiter (pure core)" | P1-3 |
| P0-11 | "`tests/integration/run.mjs`… kill only the parent process" | P1-22 |
| P0-11 | "After client-side navigation to `/privacy`, first Tab landed on the dev overlay" | P1-T1 (one check in the production build) |
| P0-13 re | "With MAX_SUGGESTIONS 20… the user is not told" | P1-16 |
| P0-13 re | "Caps proven on the test machine only: gate-timing line in the staging smoke" | P1-22 (remote step) and P1-7 |
| P0-11 re | "e2e dev reload loop" | P1-22 |
| P0-11 re | "Drop 'Target closed' from the e2e transient-error regex" | P1-22 |

Exit-report items with no follow-up row: sign-ups (P1-14); `PUT /api/facts` consent and provider on the record (P1-15); role assumption and DDL at start-up (P1-17); Node floor (merged `794dcc5`; P1-6 and P1-23 follow it); list-sync and notice-version tests (P1-20, P1-15); README overclaims and LR P1-12 wording (P1-23); P0-6d and P0-fix-e2e merged without a brief (accepted: test-only, reviewed, logged).

## Things the advisor could not verify

- Whether Auth.js stores the email-link token before sending, and calls `signIn` before `createVerificationToken` (P1-14 step 3, P1-3b step 2 ask the worker to confirm).
- Whether PGlite supports `pg_advisory_xact_lock` (P1-3 step 3 has a fallback).
- That foreign-key cascades still delete child rows when the login is not the table owner. Postgres runs those actions as the table owner without forced RLS, so it should hold; P1-17 step 8 tests it on real Postgres.
- The number-context rule has no clean setting in my prototype; P1-21 may come back with a trade-off instead of a pass.
- P1-6 is unexecuted until CI builds the image and the owner applies Terraform.
- The 27 engine failures: I used the coordinator's list, not the CI log.
