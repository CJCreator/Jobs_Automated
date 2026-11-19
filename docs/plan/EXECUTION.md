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

At most 4 workers run at once. Two tasks in the same wave never edit the same file; the "Touches" column below is how the advisor checks that. One exception: `apps/web/src/i18n/en.ts` holds every user-facing string, so it is **append-only** in a wave: a task adds new keys under a comment naming its task ID and never edits existing keys. Only P0-3 (privacy page) and P0-4 (retention line) edit existing keys, and they run in different waves. The orchestrator merges in order and resolves append conflicts.

### How the advisor is invoked

The advisor is a fresh agent each time (Agent tool, `model: fable`, a read-only agent type such as `Plan`). It sees only what the prompt gives it, so every call passes:

- **Planning:** this file, the ADRs it cites, the review findings, and the relevant file listing.
- **Review:** the brief, the full diff (`git diff <base>..<task-branch>`), the worker's report with its test output, and the checklist below.

It answers with a verdict (`approve` or `changes`) and numbered findings.

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

**Step 0: the advisor revises this plan.** The task graph and the rows below are the orchestrator's draft. Before any worker starts, the advisor reads the draft against the code and the reviews, then corrects the tasks, files and waves and writes the briefs. The owner sees the revised graph at the start of Phase 0.

### Task graph (advisor revision, step 0 done)

The advisor's corrections, waves and full briefs are in [`phase-0-briefs.md`](phase-0-briefs.md); they supersede the draft rows that were here. Summary:

```
Wave A  P0-1a  P0-5   P0-6   P0-7
Wave B  P0-1b (after P0-1a)   P0-3a   P0-4   P0-10   P0-6b (after P0-6)
Wave C  P0-2 (after P0-3a, P0-10)   P0-3b (after P0-3a, P0-4, P0-5, P0-10)   P0-9a (after P0-3a, P0-4, P0-7)
Wave D  P0-8 (after P0-2, P0-4)   P0-11 (after all)
```

| ID | Worker | Task |
|---|---|---|
| P0-1a | Sonnet | App fact gate: claim words, block and explain |
| P0-1b | Sonnet | Engine gate: trailing employer, magnitude counts, built-in sourced-word check |
| P0-2 | Sonnet | Consent record |
| P0-3a | Sonnet | Public privacy route, grievance config, `NOTICE_VERSION` |
| P0-3b | Haiku | Copy pass: the only editor of existing `en.ts` keys |
| P0-4 | Sonnet | Purge endpoint with Google OIDC; token deletion |
| P0-5 | Sonnet | Session-only key (cleared on sign-out too) |
| P0-6 | Sonnet | PDF expansion cap (text count) |
| P0-6b | Sonnet | PDF parsing in a worker thread with a hard deadline (added after the P0-6 review) |
| P0-6c | Sonnet | PDF worker: memory watchdog, parse concurrency cap, server faults as 500 (added after the P0-6b review) |
| P0-7 | Sonnet | Deployed-environment safety switches |
| P0-8 | Sonnet | Isolation and row locks on real Postgres; new `app-ci.yml` |
| P0-9a | Haiku | HSTS, prod-smoke browser launcher |
| P0-10 | Sonnet | Extracted facts checked against the upload; re-upload keeps confirmations |
| P0-11 | Sonnet | Browser test sweep and baseline |

The `en.ts` rule changes: code tasks only append keys; P0-3b is the single editor of existing keys.

### Phase 0 exit (what the owner sees at the gate)

- Every task merged, each with its advisor review recorded below.
- `apps/web`: typecheck, `npm test`, `test:flow`, `test:prod` (13 of 13), `test:e2e`, `build` all pass, browsers via `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.
- Retention: the purge endpoint exists, but nothing calls it until Cloud Scheduler runs in Phase 1. Public sign-ups stay closed until then, or the notice drops the daily-job claim.
- Engine: no failure added relative to `docs/reviews/test-baseline.md`.
- The advisor's phase review: a fresh read of the launch-review P0 and P1 items, each marked fixed, still open (with a reason) or moved.
- Still open by design: the grievance contact value and the legal review of the notice.

## Phase 1: bring your own key, free trial, first engine port, Google Cloud

### Task graph

```
Wave A (parallel)    P1-3  P1-5  P1-6
Wave B (parallel)    P1-1 (after P1-3)
Wave C (parallel)    P1-2 (after P1-1, P1-3)    P1-4 (after P1-1, P1-5)
Wave D               P1-7 staging deploy (after all, owner-authorised) -> advisor phase review -> owner gate
```

### Tasks

| ID | Task | Worker | Touches | Done when | From |
|---|---|---|---|---|---|
| P1-1 | **Launch providers.** Show only Gemini, OpenRouter and Anthropic; OpenAI and Groq stay in code behind `ROLEWRIGHT_EXTRA_PROVIDERS`. The key check (`/api/keys/verify`) gives a specific message for an invalid key, an exhausted quota and a provider outage, and applies the key-check limit that P1-3 provides (P1-1 owns this route). Show which model is in use. | Sonnet | `src/lib/llm/providers.mjs`, `src/app/api/providers`, `src/app/api/keys/verify`, the key UI, tests | Provider list test; each error class maps to its message; quota exhaustion says "bring your own key" | ADR 0003 |
| P1-3 | **Shared rate limits.** Move the in-process limiter to Postgres (a `rate_events` table or a counter with a window), so limits hold across Cloud Run instances. Add a `keyCheck` bucket and limits for sign-in and export; P1-1 wires the key-check limit into its route. | Sonnet | `src/lib/server/rate-limit.ts`, schema, auth and export routes, tests (not `/api/keys/verify`) | Two app processes share one limit in the integration test; 429 carries `Retry-After` | Launch review P1-10, P1-11 |
| P1-5 | **Port `keyword-match`.** Port `packages/engine/keyword-match.mjs` into `apps/web/src/lib` with a parity test that runs both on the same fixtures and compares output; show keyword coverage before and after tailoring. The engine script stays until the port is approved. | Sonnet | new `src/lib/keyword-match.mjs`, parity test, tailoring view | Parity test passes on every fixture; coverage shows in the UI | ADR 0012, ADR 0016 |
| P1-6 | **Google Cloud setup as code.** A production Dockerfile for `apps/web` (Node 22, Chromium, the engine copied in), a scripted setup (Terraform or `gcloud` scripts, the advisor picks one in the brief) for Cloud Run, Cloud SQL (private IP, backups), Secret Manager, Cloud Scheduler and the purge service account, in `asia-south1`, for `staging` and `production`. A deploy workflow on manual dispatch. | Sonnet | `apps/web/Dockerfile`, `infra/`, `.github/workflows/deploy.yml`, `docs/` runbook | The image builds and serves `/` and a PDF export locally against Postgres; the scripts plan cleanly against an empty project | ADR 0009 |
| P1-2 | **Free trial.** Our Gemini and OpenRouter keys from Secret Manager, used only when the user has no key, only for verified accounts. A per-account counter of 5 tailorings, incremented atomically in the same transaction as the tailoring; a per-IP daily cap behind it. The UI shows tailorings left and asks for a key at zero. | Sonnet | `src/lib/llm/index.mjs`, schema, tailorings route, the key UI, tests | Six concurrent requests from a fresh account produce exactly 5 trial tailorings; unverified accounts get no trial; server keys never reach the client or logs | ADR 0003 |
| P1-4 | **Provider parity runs.** A script that runs the fixture resumes and job descriptions through each enabled provider (and each trial model) and records fact-gate pass rate and keyword coverage to `docs/reviews/provider-parity.md`. A provider stays hidden until its run is recorded and the owner accepts it. | Sonnet (script), Haiku (report) | `apps/web/scripts/provider-parity.mjs`, fixtures, the report | Runs offline against the mock provider in CI; the owner runs it once with real keys | ADR 0003 |
| P1-7 | **Staging deploy and smoke.** Workers have no GCP credentials, so the owner runs the deploy (or authorises the deploy workflow) and the orchestrator runs the checks. Deploy to staging; run `test:prod` against the staging URL; confirm the purge job fires from Cloud Scheduler; confirm request logs do not contain `x-llm-key`. | Sonnet | none in code; a runbook entry | Smoke passes on staging; log check recorded | ADR 0009 |

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
| P1-7 | Run the staging deploy, or approve the deploy workflow run |

## Deferred on purpose (not in Phases 0 or 1)

The phase-exit reviews must not read as full coverage of the launch review. These stay open:

- Erasure below account level: deleting one resume, job or tailoring (launch review P1-9).
- Session revocation; sign-in uses a 7-day sliding JWT (launch review P1-10).
- Data export and analytics (Phase 2).

## Assumptions the owner has not been asked about

- At most 4 workers at once, 2 review rounds per task (ADR 0017).
- Separate `staging` and `production` GCP projects, which means two Cloud SQL instances billed every month. One project with two databases is cheaper; say so before P1-6 if you want that.

## Risks the plan carries

- **The fact gate gets stricter and blocks honest lines.** That is the decision (ADR 0005). P0-1 keeps an honest-rewording fixture set so the rate is measured, not guessed.
- **Free trial abuse.** Email verification plus a per-IP cap limits it; it does not stop someone with many inboxes. Watch the trial spend in the first week.
- **Chromium on Cloud Run** makes the image large and the first export slow after a cold start.
- **Advisor blind spots.** The advisor reviews diffs, not running systems; `test:prod` and the staging smoke are the backstop.

## Log

The orchestrator appends one line per merged task: task ID, task branch, advisor verdict, review rounds, merge commit.

| Task | Branch | Advisor verdict | Rounds | Merge |
|---|---|---|---|---|
| P0-7 | `task/P0-7` | approve | 1 | `eb82196` |
| P0-1a | `task/P0-1a` | approve | 2 | `eee654e` |
| P0-6 | `task/P0-6` | approve (does not close P1-6; P0-6b added) | 0 | merge on this branch |
| P0-4 | `task/P0-4` | approve | 1 | `331e9a3` |
| P0-5 | `task/P0-5` | approve | 1 | `7eef4c7` |
| P0-10 | `task/P0-10` | approve | 1 | `1ddf1d0` |
| P0-6b | `task/P0-6b` | approve (memory half open: P0-6c) | 0 | `f5ee350` |
| P0-3a | `task/P0-3a` | approve | 1 | `2545bda` |
| P0-fix-e2e | `task/P0-fix-e2e` | approve | 1 | `ba86b01` |
| P0-6c | `task/P0-6c` | approve | 1 | `35994f4` |
| P0-6d | `task/P0-6d` | approve | 0 | `2104017` |
| P0-9a | `task/P0-9a` | approve | 1 | `fad5100` |
