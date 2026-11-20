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
| Escalation | Opus worker | P1-17 from the start; any task that fails its second review round (P1-19, P1-20: after the first) | Edit files outside its brief |

## The loop for every task

```
advisor writes brief
  -> orchestrator starts worker in its own worktree (task branch)
  -> worker builds, adds tests, runs the brief's checks, reports
  -> advisor reviews the diff against the brief, the ADRs and the checklist
       approve       -> orchestrator merges into the working branch and runs typecheck only (from Phase 1, full suites wait for the TEST wave, ADR 0018)
       changes (<=2) -> back to the same worker with the advisor's notes
       third failure -> advisor re-briefs or splits the task
```

At most 4 workers ran at once in Phase 0; from Phase 1, up to 6 (ADR 0018). Two tasks in the same wave never edit the same file; the "Touches" column below is how the advisor checks that. One exception: `apps/web/src/i18n/en.ts` holds every user-facing string, so it is **append-only** in a wave: a task adds new keys under a comment naming its task ID and never edits existing keys. Only P0-3 (privacy page) and P0-4 (retention line) edit existing keys, and they run in different waves. The orchestrator merges in order and resolves append conflicts.

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
  - the targeted commands named in the brief (node --test <files>, npm run typecheck); full suites run in the TEST wave (ADR 0018)
Report: files changed, tests added, commands run with their pass/fail counts, anything left undone.
```

## Advisor review checklist

The advisor approves a diff only when every line holds:

1. It does what the brief says and edits only the listed files.
2. It matches the ADRs. A change to an accepted decision comes with a new ADR.
3. No fabrication path: generated text still passes through the fact gate before export.
4. Keys: no user key is written to the database, logs, errors, analytics or browser storage.
5. Every new table that holds user data has row-level security and a test that one user cannot read another's rows. A table with no user data (for example `rate_events`) is named in `SYSTEM_TABLES`, gets no grant to `rolewright_app`, and the structural test covers it.
6. User content (resume, job description, model output) is treated as data, never as instructions or SQL.
7. The tests named in the brief exist, and the worker's report shows the targeted run: failing without the change, passing with it. Full suites are not run before merge; they run in the TEST wave.
8. No unrelated refactors, renames or dependency upgrades.
9. The user-facing text is plain English, and the privacy text still matches what the code does.
10. The diff touches no test harness file (`tests/integration/run.mjs`, `tests/e2e/run.mjs`, `tests/integration/prod-smoke.mjs`) unless the brief lists it, and the report's "Harness impact" section says which harness steps the change will break.
11. Names shared between briefs (environment variables, tables, columns, buckets, exported functions) match the "Shared names" table in `phase-1-briefs.md` exactly.

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
| P0-13 | Sonnet | Bound the fact-gate cost: fact-base size cap, suggestion cap, rate limit on re-checking routes (added after the P0-11 review; blocks the phase gate) |
| P0-12 | Sonnet | Phase-gate fix-ups: dev CSP keyed on the platform; notice names Resend, Google, Google Cloud (added from review follow-ups) |

The `en.ts` rule changes: code tasks only append keys; P0-3b is the single editor of existing keys.

### Phase 0 exit (what the owner sees at the gate)

- Every task merged, each with its advisor review recorded below.
- `apps/web`: typecheck, `npm test`, `test:flow`, `test:prod` (13 of 13), `test:e2e`, `build` all pass, browsers via `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.
- Retention: the purge endpoint exists, but nothing calls it until Cloud Scheduler runs in Phase 1. Public sign-ups stay closed until then, or the notice drops the daily-job claim.
- Engine: no failure added relative to `docs/reviews/test-baseline.md`.
- The advisor's phase review: a fresh read of the launch-review P0 and P1 items, each marked fixed, still open (with a reason) or moved.
- Still open by design: the grievance contact value and the legal review of the notice.
- **Result:** see `phase-0-exit.md`. The owner approved Phase 1 on 2026-11-20 on the advisor's four conditions, and changed the delivery model to build first, then test (ADR 0018).

## Phase 1: bring your own key, free trial, first engine port, Google Cloud

Delivery follows ADR 0018 (amends ADR 0017): build first, test once at the end. Briefs are in [`phase-1-briefs.md`](phase-1-briefs.md).

- **Build waves.** Workers write the tests their brief names and run only the targeted commands in it (`node --test <files>`, `npm run typecheck`). No full suite, dev server, browser, `test:flow`, `test:e2e`, `test:prod`, `next build`, Docker build or engine `test-all` during build.
- **Workers.** Sonnet for security, gate, auth, consent, schema, rate-limit and infrastructure code. Haiku for copy, docs and config. Opus for P1-17 from the start, and for any task that fails its second review round (P1-19 and P1-20: after the first).
- **Limits.** Up to 6 workers at once, each in its own worktree on `task/<ID>`. A wave may hold more than 6 tasks; the rest queue.
- **Review.** The advisor reviews every diff plus the targeted test output before merge, at most 2 rounds.
- **IDs.** P1-8 to P1-13 are not used as task IDs, because the launch review uses those numbers for findings. Findings are written "LR P1-9".
- **Draft PR CI.** App CI runs on every push to PR #8. The orchestrator reads it after each wave merges. A red run does not block wave 2; each new failure is recorded for the TEST wave.

### Shared files

| File | Rule |
|---|---|
| `apps/web/src/i18n/en.ts` | Append only, under a `// P1-x` comment. P1-24 is the only editor of existing keys. Nothing is appended inside `en.app.privacy`, `en.notice` or `en.consent` (the notice lock hashes them) except by P1-24. |
| `apps/web/src/lib/db/schema.mjs` | Append only, at the end of `SCHEMA_SQL`, under a `-- P1-x` comment. Each block is idempotent and creates any role it grants to. The DDL is fixed in the brief. |
| `takeRateLimit` call sites | P1-3 makes it async. Every wave 1 task that owns a route writes `await takeRateLimit(...)`, which is valid before and after the merge. |
| `tests/integration/run.mjs`, `tests/e2e/run.mjs`, `tests/integration/prod-smoke.mjs` | P1-22 only during build. Every other brief has a "Harness impact" line instead; P1-T1 applies those in the TEST wave. |
| `README.md`, `apps/web/README.md` | P1-23 in wave 1, P1-24 in wave 2. |

### Task graph

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

- Session revocation; sign-in uses a 7-day sliding JWT (launch review P1-10).
- Data export and analytics (Phase 2).

## Assumptions the owner has not been asked about

- At most 6 workers at once, 2 review rounds per task (ADR 0017, ADR 0018).
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
| P0-1b | `task/P0-1b` | approve | 2 | `2fc4ece` |
| P0-2 | `task/P0-2` | approve | 1 | `9ada2ad` |
| P0-3b | `task/P0-3b` | approve | 2 | `0b068ec` |
| P0-8 | `task/P0-8` | approve (merged; CI unproven until its first run) | 1 | `b9f8883` |
| P0-12 | `task/P0-12` | approve | 1 | `314d3ee` |
| P0-11 | `task/P0-11` | approve | 2 | `13d54f6` |
| P0-13 | `task/P0-13` | approve | 2 | `3922e19` |
| P1-CI | `task/P1-CI` | approve (first CI run fixes: Windows pre-checkout step, Node floor 22.18) | 2 | `794dcc5` |

### Phase 1 log

- Step 0: the advisor wrote the Phase 1 section, `phase-1-briefs.md` and the follow-up map. Owner questions, each with the default the briefs assume:
  1. Can the trial also pay for resume reading? Default: yes, up to 3 per account (`TRIAL_UPLOADS = 3`). Needs an ADR 0003 amendment.
  2. Which Node version does production run? Default: Node 24. P1-19 and P1-20 must make the gate faster so `gate-cost.test.mjs` passes, unchanged, on 22.18 as well.
  3. Delete the legacy UI now (P1-26)? Runs only on owner approval.
  4. Should an unsourced title in the engine's title slot warn or block? Default: warn in the engine; the app already blocks it.
  5. Should App CI be a required check? Default: it stays informative until the Phase 1 exit.
- Owner decisions, 2026-11-20 (these replace the defaults above):
  - **Trial:** it also pays for up to 3 resume readings (ADR 0003 amended).
  - **Node:** production runs Node 24. The gate-cost test is not relaxed, so P1-19 and P1-20 must still make it pass on 22.18.
  - **Legacy UI:** keep it for now. P1-26 does not run. Web CI stays enabled and red.
  - **Engine title slot:** an unconfirmed title warns.
  - **Closed sign-ups:** an unknown email address gets the same "check your email" page as a known one, and no email is sent. Merged in P1-14.
  - **Consent wording:** the consent sentence says the text is also stored. P1-24 makes the change and bumps `NOTICE_VERSION`.
  - **IP and email subjects:** rate-limit subjects are HMAC-keyed with `ROLEWRIGHT_RATE_LIMIT_KEY`, a secret of at least 32 characters (P1-3). P1-6 adds the secret. P1-24 adds a notice sentence saying addresses are kept only as keyed hashes for rate limiting.
- Still open with the owner:
  - Switching on the dependency graph.
  - Removing the leftover `/language:go` CodeQL configuration.
  - Whether App CI becomes a required check (default: informative until the Phase 1 exit).

- Recorded for the TEST wave (P1-T1):
  - **CI at `a71eb19`.** `npm test` passes on both Node legs (452 tests; gate-cost passed on this runner). `test:flow` step 4 (`tests/integration/run.mjs:331`) fails because the consent GET now also returns `storageAccepted`. This is a known stale harness from P1-15's "Harness impact" section.
  - **P1-17 follow-up.** `tests/consent.test.mjs` should also run on Postgres. It calls `createDb()` with no arguments and belongs to P1-15, so it becomes a P1-F task if the TEST wave confirms the gap.
- Owner, 2026-11-20: the dependency graph is switched on.
- Follow-ups recorded during wave 1 review:
  - **Shared hash key.** `ipSubject` and `emailSubject` use the same key without domain separation. This is harmless today because the two kinds of subject never share a bucket. Separate them if they ever do.
  - **Database certificate.** Cloud SQL certificate verification (`sslmode=verify-ca` with the server CA) is not done yet. ADR 0009 is amended to record this.
- **CodeQL `number-context.mjs:137`.** It flags incomplete escaping. This is a false positive, because the input holds only digits, commas and dots. Harden it anyway with a general regex escape as a P1-F fix.
- Owner decision, 2026-11-20: Dependency Review is removed. On a private repository it needs paid Code Security. Restore it when the repository goes public.
