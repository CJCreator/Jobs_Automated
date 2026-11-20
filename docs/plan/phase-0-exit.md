# Phase 0 exit report

The advisor reviewed branch `claude/eloquent-tesla-8pto6q` at code commit `6f833b8` on 2026-11-20, under ADR 0017. Everything after `3922e19` is docs only.

**Advisor verdict:** approve moving to Phase 1 (building) under the four conditions below. Public sign-ups stay closed. The orchestrator checked three of the findings against the code:
- sign-in accepts any verified user (`auth.ts:155`);
- all five providers are listed (`providers.mjs:11`);
- suggestions are cut off silently at 20 (`tailoring.mjs:121`).

## Measurements

| Check | Result |
|---|---|
| `npm test` | 394 pass, 0 fail, 4 skipped (Postgres-only) |
| `test:flow` / `test:e2e` / `test:prod` | 17/17, 21/21, 15/15 |
| `build` | passes (run on `6f833b8`, 2026-11-20) |
| Engine lint | passes |
| Engine `test-all --quick` | 19,678 pass, 28 fail, all 28 failing before Phase 0 |
| App CI (`app-ci.yml`) | **never run**. It needs a PR, so the Postgres row-level security (RLS) tests are proven only locally |

## Launch-review items

| Item | Status |
|---|---|
| P0-1 fact gate (reproduced bypasses) | Partly fixed. The reproduced strings now block, but other phrasings in the same categories still pass (see risks) |
| P0-2 retention promise | Partly fixed. The purge endpoint exists but nothing schedules it yet (P1-6, P1-7) |
| P0-3 consent record | Fixed for upload and tailoring |
| P0-4 notice before collection | Fixed; still needs legal review |
| P0-5 grievance contact | Partly fixed. The value is a placeholder and nothing enforces it |
| P1-6 PDF limit | Fixed |
| P1-7 dev sign-in | Fixed |
| P1-8 model facts accepted without checking the uploaded resume | Fixed (phone, location and links are still not checked) |
| P1-9 erasure below account level | Open, no owner |
| P1-10 / P1-11 rate limits and session revocation | Open, moved to P1-3. Sign-in and email sends have no limit; revocation has no owner |
| P1-12 embedded-DB fallback | Partly fixed. Refused on deployed hosts; elsewhere `NODE_ENV=production` only warns |
| P1-13 RLS on real Postgres | Tests merged; proof waits on the first CI run |

## Risks in merged work (none are regressions)

1. The gate still lets through invented credentials ("master's degree"), inflated verbs ("Led" when the source says "Assisted"), ordinal ranks, length of experience ("over a decade") and languages.
2. Numbers are matched as standalone tokens, ignoring context. "Team of 12" passes if any fact contains the number 12.
3. Text not in Latin script is effectively unchecked. `claims.mjs` ignores the engine's `scope-not-checked` coverage-gap signal.
4. Nothing closes sign-ups. Any verified Google or email user gets in.
5. `PUT /api/facts` stores hand-typed personal data without a consent record.
6. The consent text names a provider, but the record does not store which one. Switching provider does not ask for consent again.
7. ADR 0009 says the app connects as a database role that does not own the tables; the code assumes the app's role owns them. A login with `BYPASSRLS` would silently remove isolation, and nothing checks for this at start-up.
8. Schema DDL, including `DROP/CREATE POLICY`, runs on every cold start.
9. The PDF memory watchdog can be missing on Node 22.13, which `package.json` still allows.
10. Two controls depend on code comments, not tests:
    - the app and engine claim-word lists must stay in sync;
    - `NOTICE_VERSION` must be bumped when the notice changes.
11. Both READMEs overclaim ("nothing invented reaches a recruiter").
12. P0-6d and P0-fix-e2e merged without a brief. Both are test-only.

## Conditions on approval

1. Open a draft PR at the start of Phase 1 so App CI runs. P0-8 counts as proven only when both Node versions pass on Postgres with nothing skipped.
2. Before P1-7 makes sign-in reachable from a public URL, add a sign-up allowlist or restrict who can reach the service.
3. Add a gate task to Phase 1. It must at least block on a coverage gap and add a test that keeps the claim-word lists in sync. The owner decides on risks 1 and 2: tighten the gate, or amend ADR 0005 to say what it does not catch.
4. Give every unowned follow-up a Phase 1 ID or mark it "accepted".

## Before public sign-ups (launch gate, not build gate)

- Fact-gate gaps (risks 1 and 2): owner decides whether to tighten the gate or amend ADR 0005.
- CI passes.
- Sign-ups can be switched off (allowlist or closed sign-up).
- The retention scheduler has been seen firing, and it alerts on failure.
- Legal review of the notice, the consent flow, and an ADR on consent withdrawal and the records kept after deletion.
- Grievance contact set; a deployed host refuses to start without it.
- Shared rate limits (P1-3).
- Decision on silently dropping suggestions after the 20th.
- OpenAI and Groq hidden (P1-1).
- Decision on erasure below account level.
- P1-6 infrastructure:
  - Node 22.16 or later;
  - Cloud Run sizing;
  - migrations moved out of start-up;
  - a start-up check of the database role.
- Staging checks (P1-7).
