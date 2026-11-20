# Phases 1 and 2: combined test wave (ADR 0018, 0019)

Run on 2026-11-20 against branch `claude/eloquent-tesla-8pto6q`, after every Phase 1 and Phase 2 build task had merged.

## Local results

| Check | Result |
|---|---|
| `apps/web` typecheck | clean |
| `apps/web` `npm test`, embedded database | 846 tests: 839 pass, 0 fail, 7 skipped (the Postgres-only tests) |
| `apps/web` `npm test`, Postgres 16 with the login role (`ROLEWRIGHT_REQUIRE_PG=1`) | 846 tests: 846 pass, 0 fail, 0 skipped |
| `apps/web` `npm test`, Postgres 16 with the owner and login roles | 846 tests: 846 pass, 0 fail, 0 skipped |
| `npm run db:migrate` run twice as owner | idempotent; all 11 tables created, owned by `rolewright_owner` |
| `npm run events:report` as the login on a deployed host | works through `rolewright_system` |
| `test:flow` | 18 of 18 steps |
| `test:e2e` | 22 of 22 steps, after P2-F1 |
| `test:prod` (production build) | 17 of 17 steps |
| Engine `test-all --quick` | 19,734 pass, 0 fail, 22 warnings. At the Phase 0 exit it had 28 failures. |
| Engine lint | passes |
| Legacy web `npm test` | 2,206 tests: 2,173 pass, 0 fail, 33 skipped (browser suites, which run in `test:browser`) |
| Legacy web `test:browser`, the 3 suites that failed in CI | pass after P1-F2 |

## Fix tasks

| ID | Failure | Classification | Fix |
|---|---|---|---|
| P1-F1 | Web CI status-tone contrast; `test:flow` consent shape | Regression (P1-15 harness impact) and an earlier failure | `emerald-700` changed to `emerald-800`; harness consent bodies and rows updated |
| P1-F2 | 3 legacy browser suites (inbox-undo, loading-transition, pipeline-inline-status) | Race that was already there: the app's service worker takes over, and Playwright `page.route` stops intercepting | Those suites block service workers |
| P1-F3 | `number-context.test.mjs:96` took 172 ms on CI against a 150 ms limit | Performance | Linear scan plus memo; the advisor's differential check found 0 differences in 10,408 comparisons |
| P2-F1 | e2e 5 and 5b: segment-card radios were 16 px | Regression (P2-3) | Radios are now `size-6` |

## Open items, not blocking

- **Duplicate figure in a refused export:** a refused export can list the same figure twice in two spellings ("₹5 crore, ₹5crore"). Removing the duplicate is cosmetic; e2e g3 accepts both spellings.
- **Timing tests on CI:** the timing tests have about 2x headroom on CI after P1-F3. Watch them.
- **Next.js advisory in the legacy UI:** building `packages/engine/web` (the legacy local UI, Next 16.4.1, deleted in Phase 3) prints a Next.js security advisory. The hosted app is on 16.4.6.
- **CodeQL:** 7 alerts (1 critical, 2 high, 4 medium), the same count as the engine alerts triaged earlier. The phase review confirms whether they are the same alerts.
- **Owner-run items at the gate:**
  - the staging deploy (P1-7), with the migrate job run before the revision;
  - P1-27;
  - installing the PWA on an Android phone.
