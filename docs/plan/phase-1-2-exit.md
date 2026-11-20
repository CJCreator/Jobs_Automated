# Phases 1 and 2 exit report

The advisor reviewed branch `claude/eloquent-tesla-8pto6q` at `7edc4e7` on 2026-11-20, under ADR 0017 to 0019. The review covers 131 commits since the Phase 0 exit.

**Advisor verdict:** approve Phases 1 and 2 for the owner gate under the conditions below. This approves the build, not the launch. Nothing has run on Google Cloud yet, and public sign-ups stay closed.

## Conditions

1. **CI green at HEAD.** No commit has had every workflow green yet.
   - App CI passed at `64c3e0c`.
   - It failed at `e11ea35` on Node 22.18, in the embedded-database tests (the number-context timing test, since fixed by P1-F3).
   - Later runs were cancelled or still in progress at review time.
2. **CodeQL alerts listed by path.** The alerts API refused the advisor, so the 7 alerts are unverified.
   - Any alert under `apps/web/src`, `infra` or `.github` must be fixed before staging.
   - Alerts in test helpers, the scaffolder or the legacy UI can be dismissed.
3. **Fix the first-deploy order in the runbook before P1-7** (risk 1).
4. **`ROLEWRIGHT_SIGNUPS` stays `allowlist`** until every item under "Before public sign-ups" is done.

## Measurements

| Check | Result | Source |
|---|---|---|
| Engine `verify-cv-facts --self-test` | 164 pass, 0 fail | re-run by the advisor |
| 7 app test files (claim-list sync, sign-up gate, env guard, number context, gate cost, notice lock, Phase 1 claims), Node 22.23.5 | 260 pass, 0 fail | re-run by the advisor |
| Gate probes through `checkText` with the engine loaded | see risks 2 and 3 | run by the advisor |
| `apps/web` `npm test`, embedded database | 839 pass, 0 fail, 7 skipped | test wave |
| `apps/web` `npm test`, Postgres 16, login role | 846 pass, 0 skipped | test wave |
| `db:migrate` run twice | idempotent, 11 tables | test wave |
| `test:flow` / `test:e2e` / `test:prod` | 18/18, 22/22, 17/17 | test wave |
| Engine `test-all --quick` | 19,734 pass, 0 fail (28 failures at the Phase 0 exit) | test wave |
| Legacy web `npm test` | 2,173 pass, 0 fail, 33 skipped | test wave |
| CI at HEAD | pending | GitHub |
| Staging | never deployed | none |

## Phase 0 conditions

| Condition | Status | Task |
|---|---|---|
| 1. Draft PR so App CI runs on Postgres | Partly. PR #8 is open and App CI has passed on both Node versions; HEAD is still pending | P1-CI |
| 2. Allowlist before a public URL | Done. An unset mode is `allowlist` on a deployed host | P1-14 |
| 3. Gate task: block on a coverage gap and keep the claim-word lists in sync | Done. The owner chose to tighten the gate. ADR 0005 still does not say what the gate misses | P1-19, 19b, 19c, 19d, P1-20, P1-21 |
| 4. Every follow-up owned | Partly. Mapped in the briefs, but session revocation and the consent ADR have no ID | see follow-ups |

## Before public sign-ups

| Item | Status | Task |
|---|---|---|
| Fact-gate gaps | Partly (risks 2 and 3) | P1-19 to P1-21 |
| CI passes | Partly | condition 1 |
| Sign-ups can be switched off | Done | P1-14 |
| Purge scheduler seen firing, and it alerts on failure | Partly. Written as Terraform, never applied | P1-6; proof in P1-7 |
| Legal review, and an ADR on consent withdrawal and the records kept after deletion | Open | owner |
| Grievance contact set, and a deployed host refuses to start without it | Partly. Enforced only when sign-ups are `open`, and both tfvars files leave it blank | P1-14 |
| Shared rate limits | Done | P1-3, 3b, 28, 29 |
| Suggestions dropped after the 20th | Done. Lines sent are capped at 60 and the user is told | P1-16 |
| OpenAI and Groq hidden | Done | P1-1 |
| Erasure below account level | Done. Contact details are kept, and the copy says so | P1-18 |
| P1-6 infrastructure: Node floor, Cloud Run sizing, migrations out of start-up, start-up role check | Done in code (Node 22.18 floor, 2 GiB and 2 CPU). Sizing is unproven | P1-6, P1-17 |
| Staging checks | Open | P1-7 |

Phase 0 risks 5, 6 and 11 are closed:
- `PUT /api/facts` requires storage consent (P1-15).
- The consent record stores the provider (P1-15).
- The README no longer overclaims (P1-23).

## Risks in merged work

1. **The first deploy is likely to fail as written.** Runbook step 7 creates the Cloud Run service before step 8 runs the first migration. The start-up probe is `/api/health`, and the app refuses to start on an unmigrated database. The first revision should therefore fail, and `terraform apply` with it. The fix is to create and run the migrate job first.
2. **Gate gaps the advisor reproduced with both gate layers on:**
   - Lower-case employers, tools and places pass: "at infosys and deloitte", "tableau and snowflake", "across india, singapore and dubai".
   - Hinglish passes ("Team ka lead tha…"). French and Devanagari blocked in the advisor's probes.
   - "finance head and team leader" passes.
3. **Gate gaps recorded in earlier reviews but not reproduced here:**
   - C-suite trailing context, coordination beyond "and" and "or", and the base holes from the P1-19c and P1-20 reviews.
   - Ten documented number-context passes in `number-context.test.mjs`, for example "Led 12 branch analysts" and "Saved ₹2 crore".
   - An attested figure can store a lower-case name with it.

   The phrasings flagged at the Phase 0 exit now block: inflated verbs, credentials, tenure, "team of 12" and ₹ amounts.
4. **CodeQL is unverified** (condition 2). The planned regex-escape hardening in `number-context.mjs` has no P1-F task, and the advisor found no escape helper there.
5. **`deploy.yml` deploys only from `main`**, and workload identity accepts only `main`. P1-7 needs PR #8 merged first.
6. **None of the infrastructure has run yet:**
   - Terraform;
   - the Docker image under load;
   - Chromium memory;
   - the proxy hop count;
   - the scheduler, which has no IAM invoker.
7. **`env-guard` allows `open` once a grievance contact is set,** whether or not the purge runs or the notice has been reviewed. Only procedure prevents an early opening.
8. **The timing tests have about 2x headroom on CI.** The last App CI failure was on the Node 22.18 leg.
9. **Session revocation is still deferred.** Sessions slide for 7 days (launch review P1-10).
10. **The database certificate is not verified** (`sslmode=no-verify`, ADR 0009 amended).
11. **The legacy UI is on Next 16.4.1, which has a security advisory.** It runs only locally and is never deployed, so this is acceptable until Phase 3 deletes it.
12. **`NOTICE_VERSION` is `2026-11-21.1`,** dated a day after this review. P1-27 bumps it again.

## Owner-gate checklist

| The owner does or decides | Note |
|---|---|
| Confirm CI is green at HEAD, and list the CodeQL alerts by path | Conditions 1 and 2 |
| Merge PR #8 to `main` | The deploy workflow can only run from `main` |
| P1-7: staging deploy, with the migrate job run before the revision, then the smoke test and the manual checklist | Includes triggering the scheduler, breaking the alert's recipient once to see the failure email, searching the logs for keys, and confirming asia-south1 |
| Confirm `ROLEWRIGHT_TRUSTED_PROXY_HOPS=0` on staging | Two clients get different rate-limit subjects; a spoofed header changes nothing |
| P1-27, only after P1-7 step 4 is recorded | Restores the scheduler sentence and adds the rate-limit sentences |
| Install the PWA on an Android phone | It opens at `/app` |
| Legal review of the notice | Review the text after P1-27, not only `2026-11-21.1` |
| Sign-ups mode | Keep `allowlist` |
| Decide on the fact gate | Accept the gaps and amend ADR 0005, or fund P3-G1 to P3-G3 before launch |

**Before public sign-ups, all of these must be true:**
- P1-7 and P1-27 are recorded.
- The purge has been seen firing and alerting.
- The legal review is done.
- The grievance contact is set.
- The consent-withdrawal ADR is written.
- The owner has decided on the gate gaps.
- App CI is a required check.

## Follow-ups

| ID | Item | When |
|---|---|---|
| LG-1 | Runbook: run the migration before the first revision | Before P1-7 |
| LG-2 | CodeQL triage by path; regex-escape hardening in `number-context.mjs` | Before staging |
| LG-3 | ADR 0005 amendment listing what the gate misses, linked from the README | Launch gate |
| LG-4 | ADR on consent withdrawal and a deletion tombstone | Launch gate |
| LG-5 | `env-guard`: require the grievance contact on every deployed host | Launch gate |
| LG-6 | Session revocation | Launch-gate decision |
| LG-7 | Make App CI a required check (`merge_group`, a job that always reports) | After HEAD is green |
| P3-G1 | Lower-case names, including the attest path | Phase 3 |
| P3-G2 | Hinglish and other non-English lines written in Latin script | Phase 3 |
| P3-G3 | Seniority words, accented look-alikes, C-suite trailing context, wider coordination | Phase 3 |
| P3-1 | Delete the legacy UI (was P1-26) | Phase 3 |
| P3-2 | Cloud SQL certificate verification | Phase 3 |
| P3-3 | Record a source for each contact field, so it is deleted with the resume | Phase 3 |
| P3-4 | Remove the duplicate figure in a refused export; widen the timing-test margins | Phase 3 |
