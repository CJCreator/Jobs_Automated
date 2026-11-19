# Execution plan: Phases 0 and 1

How the launch blockers (Phase 0) and bring-your-own-key, the free trial and the first engine port (Phase 1) get built by agents. The roles and the gates come from ADR 0017. The product decisions come from the ADRs cited on each task.

## Decisions this plan rests on

| Decision | Value | ADR |
|---|---|---|
| Hosting | Cloud Run + Cloud SQL Postgres + Secret Manager + Cloud Scheduler, `asia-south1` | 0009 |
| Fact gate | Block and explain: export refused, each failing line shown with the unconfirmed word, no override | 0005 |
| Launch providers | Gemini, OpenRouter, Anthropic (OpenAI and Groq hidden) | 0003 |
| Free trial | 5 tailorings per verified account, lifetime | 0003 |
| Grievance contact | Config placeholder; the launch checklist blocks until it is filled | 0004 |
| Repository | Private until the Phase 1 exit review | 0014 |
| Timeline | No deadline; work is ordered by dependency, not by date | |

## Roles

| Role | Who | Does | Does not |
|---|---|---|---|
| Owner | You | Approves each phase; supplies accounts, keys and the grievance contact | Review every task |
| Orchestrator | Main session | Runs waves, dispatches workers, merges, runs phase checks, updates the log below | Write product code |
| Advisor | Fable | Writes the task graph and each brief; reviews each diff; runs the phase-exit review | Write product code |
| Builder | Sonnet worker | Security, data, gate, auth, schema, infra tasks | Edit files outside its brief |
| Clerk | Haiku worker | Copy, docs, config wiring, test triage | Touch auth, keys, schema or the gate |

## The loop for every task

```
advisor writes brief
  -> orchestrator starts worker in its own worktree (task branch)
  -> worker builds, adds tests, runs the brief's checks, reports
  -> advisor reviews the diff against the brief, the ADRs and the checklist
       approve       -> orchestrator merges into the working branch and runs the app checks
       changes (<=2) -> back to the same worker with the advisor's notes
       third failure -> advisor re-briefs or splits the task
```

At most 4 workers run at once. Two tasks in the same wave never edit the same file; the "Touches" column below is how the advisor checks that.

## Brief template (the advisor fills one per task)

```
Task: P0-1 Fact gate: block and explain
Worker: Sonnet
Goal: one sentence, the outcome.
ADRs: 0005
Touches (only these): apps/web/src/lib/claims.mjs, packages/engine/verify-cv-facts.mjs, ...
Must not touch: anything else; ask the orchestrator if more is needed.
Inputs: the review finding it fixes (docs/reviews/...), reproduction steps.
Steps: numbered, smallest first. Regression test before the fix.
Done when:
  - named tests exist and pass
  - apps/web: npm run typecheck && npm test && npm run test:flow
  - packages/engine (if touched): node test-all.mjs --quick adds no failure vs docs/reviews/test-baseline.md
Report: files changed, tests added, commands run with their pass/fail counts, anything left undone.
```

## Advisor review checklist

The advisor approves a diff only when every line holds:

1. It does what the brief says and edits only the listed files.
2. It matches the ADRs. A change to an accepted decision comes with a new ADR.
3. No fabrication path: generated text still passes through the fact gate before export.
4. Keys: no user key is written to the database, logs, errors, analytics or browser storage.
5. Every new table has row-level security and a test that one user cannot read another's rows.
6. User content (resume, job description, model output) is treated as data, never as instructions or SQL.
7. The tests named in the brief exist, fail without the change and pass with it.
8. No unrelated refactors, renames or dependency upgrades.
9. The user-facing text is plain English, and the privacy text still matches what the code does.

## Phase 0: launch blockers

No public sign-ups until every Phase 0 task is merged and the phase is approved.

### Task graph

```
Wave A (parallel)    P0-1  P0-3  P0-5  P0-6  P0-7
Wave B (parallel)    P0-2 (after P0-3)    P0-4 (after P0-3)    P0-9
Wave C               P0-8 (after P0-2, P0-4)
Exit                 advisor phase review -> owner gate
```

### Tasks

| ID | Task | Worker | Touches | Done when | From |
|---|---|---|---|---|---|
| P0-1 | **Fact gate: block and explain.** Close the reproduced bypasses ("Global", "Certified", "Expert", invented employers such as "at Acme Corp", unit-bearing figures such as "14M evaluations per month"). Credentials, seniority and scope words, capitalised names, tools and numbers in a changed line must appear in confirmed facts. Return each failing line with the offending words; the UI lists them and links to edit the line or confirm a fact. Run the forbidden-phrase checks even without `config/cv-facts.json`. | Sonnet | `apps/web/src/lib/claims.mjs`, `packages/engine/verify-cv-facts.mjs`, the export route, the tailoring review view, tests | One regression test per reproduced bypass, written first and seen failing; honest rewordings in the fixture set still pass; export refuses and the reason is shown | Launch review P0-1, claims audit, ADR 0005 |
| P0-3 | **Notice before collection.** Move the privacy page out of the signed-in layout; link it from the landing and sign-in pages. Name the AI provider transfer for both the resume and the job description. Add the grievance contact from config (`ROLEWRIGHT_GRIEVANCE_NAME`, `ROLEWRIGHT_GRIEVANCE_EMAIL`), with a visible "not yet set" marker in non-production. Version the notice text (`NOTICE_VERSION`). | Haiku | `src/app` privacy route and layouts, `src/i18n/en.ts`, env docs | The page renders signed out; links are present; the grievance value comes from config | Launch review P0-4, P0-5, P2-18 |
| P0-5 | **Session-only key.** Replace `localStorage` in `src/lib/client/llm-key.ts` with an in-memory store that clears on reload. | Sonnet | `src/lib/client/llm-key.ts`, its callers, `tests/integration` | `test:flow` asserts nothing is in `localStorage`, `sessionStorage` or IndexedDB after key entry; existing key-hygiene checks still pass | ADR 0003, launch review P2-14 |
| P0-6 | **PDF expansion cap.** Stop parsing once extracted text exceeds a cap (default 200,000 characters) or a page count, before the whole file is decoded; return a clear 413 error. | Sonnet | `src/lib/server/pdf-text.mjs`, the upload route, tests | The reproduced 175 KB file is rejected in under 1 s with bounded memory; normal resumes are unaffected | Launch review P1-6 |
| P0-7 | **Production safety switches.** Refuse to start in a deployed environment without `DATABASE_URL` and `AUTH_SECRET`; no silent fallback to the embedded database. Dev sign-in only when the host is `localhost` and an explicit flag is set, whatever `NODE_ENV` says. | Sonnet | `src/lib/server/env-guard.mjs`, `src/lib/db/index.mjs`, tests | Unit tests cover every combination; `test:prod` still passes | Launch review P1-7, P1-12 |
| P0-2 | **Consent record.** A `consents` table (user id, notice version, accepted-at, purpose). The upload route refuses without a consent for the current notice version; a new notice version asks again. | Sonnet | `src/lib/db/schema.mjs`, `repo.mjs`, the resume route, `resume-view.tsx`, tests | Upload without consent returns 403; the record exists after consent; RLS test for the new table | Launch review P0-3, ADR 0004 |
| P0-4 | **Retention purge for real.** A `POST /api/internal/purge` endpoint that accepts only a Google-signed OIDC token from the configured scheduler service account and runs the 12-month purge. Align the privacy text with what runs. Also delete verification tokens on account deletion. | Sonnet | new internal route, `scripts/purge-inactive.mjs` (shared logic), `src/i18n/en.ts` retention line, tests | Unauthenticated and wrong-audience calls get 401; a seeded idle account is purged; tokens are gone after deletion | Launch review P0-2, P2-17 |
| P0-9 | **Small hardening.** HSTS header in production; re-uploading a resume keeps already-confirmed facts confirmed when the text still contains them. | Haiku (HSTS), Sonnet (facts) | `next.config` headers, `src/lib/facts.mjs`, tests | Header present in `test:prod`; re-upload test passes | Launch review P2-15, P2-16 |
| P0-8 | **Prove isolation on real Postgres.** A CI job with a Postgres service runs the schema, the app connects as a non-owner role, and the skipped negative control in `tests/db.test.mjs` runs: user A cannot read, update or delete user B's rows in every table, and row locks hold under concurrent updates. | Sonnet | `tests/db.test.mjs`, `.github/workflows/web-ci.yml` (or a new app workflow), schema grants | The negative control runs and passes in CI, not skipped | Launch review P1-13 |

### Phase 0 exit (what the owner sees at the gate)

- Every task merged, each with its advisor review recorded below.
- `apps/web`: typecheck, `npm test`, `test:flow`, `test:prod`, `build` all pass.
- Engine: no failure added relative to `docs/reviews/test-baseline.md`.
- The advisor's phase review: a fresh read of the launch-review P0 and P1 items, each marked fixed, still open (with a reason) or moved.
- Still open by design: the grievance contact value and the legal review of the notice.

## Phase 1: bring your own key, free trial, first engine port, Google Cloud

### Task graph

```
Wave A (parallel)    P1-1  P1-3  P1-5  P1-6
Wave B (parallel)    P1-2 (after P1-1, P1-3)    P1-4 (after P1-1, P1-5)
Wave C               P1-7 staging deploy (after all) -> advisor phase review -> owner gate
```

### Tasks

| ID | Task | Worker | Touches | Done when | From |
|---|---|---|---|---|---|
| P1-1 | **Launch providers.** Show only Gemini, OpenRouter and Anthropic; OpenAI and Groq stay in code behind `ROLEWRIGHT_EXTRA_PROVIDERS`. The key check (`/api/keys/verify`) gives a specific message for an invalid key, an exhausted quota and a provider outage. Show which model is in use. | Sonnet | `src/lib/llm/providers.mjs`, `src/app/api/providers`, `src/app/api/keys/verify`, the key UI, tests | Provider list test; each error class maps to its message; quota exhaustion says "bring your own key" | ADR 0003 |
| P1-3 | **Shared rate limits.** Move the in-process limiter to Postgres (a `rate_events` table or a counter with a window), so limits hold across Cloud Run instances. Add limits for sign-in, export and the key check. | Sonnet | `src/lib/server/rate-limit.ts`, schema, auth and export routes, tests | Two app processes share one limit in the integration test; 429 carries `Retry-After` | Launch review P1-10, P1-11 |
| P1-5 | **Port `keyword-match`.** Port `packages/engine/keyword-match.mjs` into `apps/web/src/lib` with a parity test that runs both on the same fixtures and compares output; show keyword coverage before and after tailoring. The engine script stays until the port is approved. | Sonnet | new `src/lib/keyword-match.mjs`, parity test, tailoring view | Parity test passes on every fixture; coverage shows in the UI | ADR 0012, ADR 0016 |
| P1-6 | **Google Cloud setup as code.** A production Dockerfile for `apps/web` (Node 22, Chromium, the engine copied in), a scripted setup (Terraform or `gcloud` scripts, the advisor picks one in the brief) for Cloud Run, Cloud SQL (private IP, backups), Secret Manager, Cloud Scheduler and the purge service account, in `asia-south1`, for `staging` and `production`. A deploy workflow on manual dispatch. | Sonnet | `apps/web/Dockerfile`, `infra/`, `.github/workflows/deploy.yml`, `docs/` runbook | The image builds and serves `/` and a PDF export locally against Postgres; the scripts plan cleanly against an empty project | ADR 0009 |
| P1-2 | **Free trial.** Our Gemini and OpenRouter keys from Secret Manager, used only when the user has no key, only for verified accounts. A per-account counter of 5 tailorings, incremented atomically in the same transaction as the tailoring; a per-IP daily cap behind it. The UI shows tailorings left and asks for a key at zero. | Sonnet | `src/lib/llm/index.mjs`, schema, tailorings route, the key UI, tests | Six concurrent requests from a fresh account produce exactly 5 trial tailorings; unverified accounts get no trial; server keys never reach the client or logs | ADR 0003 |
| P1-4 | **Provider parity runs.** A script that runs the fixture resumes and job descriptions through each enabled provider (and each trial model) and records fact-gate pass rate and keyword coverage to `docs/reviews/provider-parity.md`. A provider stays hidden until its run is recorded and the owner accepts it. | Sonnet (script), Haiku (report) | `apps/web/scripts/provider-parity.mjs`, fixtures, the report | Runs offline against the mock provider in CI; the owner runs it once with real keys | ADR 0003 |
| P1-7 | **Staging deploy and smoke.** Deploy to staging; run `test:prod` against the staging URL; confirm the purge job fires from Cloud Scheduler; confirm request logs do not contain `x-llm-key`. | Sonnet | none in code; a runbook entry | Smoke passes on staging; log check recorded | ADR 0009 |

### Phase 1 exit

- Everything in the Phase 0 exit, plus the staging smoke.
- Provider parity table filled in for each launch provider, and accepted by the owner.
- Open-source revisit (ADR 0014) is put to the owner.

## What the owner needs to supply

| When | What |
|---|---|
| Before P1-6 | Two GCP projects (`staging`, `production`) with billing, and owner access for the deploy service account |
| Before P1-2 | A Gemini API key and an OpenRouter key for the trial, put straight into Secret Manager (never in chat or the repository) |
| Before launch | The grievance officer's name and email; a legal review of the privacy notice |
| Before P1-4 real run | Your own keys for each launch provider, used locally for the parity run |

## Risks the plan carries

- **The fact gate gets stricter and blocks honest lines.** That is the decision (ADR 0005). P0-1 keeps an honest-rewording fixture set so the rate is measured, not guessed.
- **Free trial abuse.** Email verification plus a per-IP cap limits it; it does not stop someone with many inboxes. Watch the trial spend in the first week.
- **Chromium on Cloud Run** makes the image large and the first export slow after a cold start.
- **Advisor blind spots.** The advisor reviews diffs, not running systems; `test:prod` and the staging smoke are the backstop.

## Log

The orchestrator appends one line per merged task: task ID, task branch, advisor verdict, review rounds, merge commit.

| Task | Branch | Advisor verdict | Rounds | Merge |
|---|---|---|---|---|
