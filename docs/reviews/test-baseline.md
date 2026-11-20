# Test baseline

The engine suite inherited from career-ops was already failing before this repository was restructured. This file records the numbers so a change is judged against them, not against a green bar that never existed.

## Measurements

All engine runs are `node test-all.mjs --quick` from `packages/engine` (or the repository root before the move), Node 22, no network.

| When | Commit | Passed | Failed | Notes |
|---|---|---|---|---|
| Before any restructure | `4ecbf5e` | 18,355 | 384 | Run in a worktree without the legacy web UI's `node_modules`, which inflated the count. Failures included broken skill entrypoints, the README Codex and sponsor checks, ARCHITECTURE diagram checks, and the legacy web UI suites. |
| After the monorepo move | `61c7e9a` | 19,988 | 49 | New failures were tests reading upstream `.github/` from the engine and tests of features about to be removed. |
| After removals and rebrand | `c357f7e` | 18,331 | 110 | Removed market mode sets and community files broke tests that hard-code them. |
| After the skill rename | `97fd9d1` | 18,316 | 117 | The rename also rewrote some regex literals; reverted in the next commit. |
| After Phase 0 (all tasks merged) | `3922e19` | 19,678 | 28 | All failures on the pre-existing list below; lint passes (1,951 files). |
| After test repairs | `9d6c104` | 19,509 | 28 | Every inline section runs to the end; earlier runs stopped at a crash reading the removed `modes/zh`, which hid later sections. All 28 failures are on the pre-existing list below. |
| After engine baseline cleanup (P1-25) | `PLACEHOLDER` | 19,704 | 0 | `npm run lint` passes. No known failures remain; see the list below for what was done to each. |

## The app

| Check | Before the restructure | After |
|---|---|---|
| `apps/web` `npm test` | 204 pass, 0 fail, 1 skipped, 1 todo | 204 pass, 0 fail, 1 skipped, 1 todo |
| `npm run typecheck` | pass | pass |
| `npm run test:flow` | 15 of 15 | 15 of 15 |
| `npm run test:prod` | 12 of 13 | 12 of 13 |

After Phase 0 waves A to C (merged `ec9f577`): `npm test` 359 pass, 0 fail, 1 skipped; `test:flow` 16 of 16; `test:e2e` 17 of 17; `test:prod` 15 of 15 on the P0-9a branch (13 original steps plus 2b and 11b). Browser runs need `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

After the browser sweep and the merge of P0-8 and P0-12 (P0-11, merged tree): `npm run typecheck` pass; `npm test` 380 tests, 376 pass, 0 fail, 4 skipped (the Postgres suites skip without a database); `npm run test:flow` 16 of 16; `npm run build` pass; `npm run test:e2e` 21 of 21 (17 earlier steps plus g3, p, k and m); `npm run test:prod` 15 of 15, including step 13 with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` set. The e2e steps added: g3 (a refused export lists the failing line and its words; "Go to this suggestion" focuses its card), p (signed-out `/privacy`: linked from `/` and `/sign-in`, axe, target size, skip link first, no sideways scroll at 360), k (tailor form asks for consent from an account with hand-typed facts and none given, then stops asking) and m ("Not found in your resume" badge on a second fixture; "Confirm all" skips it and says so). Step b also checks the legacy `rolewright.llm` item is removed on a page load.


## Known pre-existing engine failures

P1-25 cleared the 28 inherited failures. One flaky test remains on the list. Each of the others was fixed at its cause, or its test was adjusted where the restructure or ADR 0013 removed what it covered:

- Skill entrypoints (`.antigravitycli`, `.claude`, `.grok`, `.kimi`, `.opencode`, `.qwen`): were regular files holding link text; now git symlinks to `.agents/skills/rolewright/SKILL.md`.
- `set-status` suites and `writer-scripts-data-root`: the copied import closure lacked `lib/services/tracker-service.mjs`; added. The service had also lost the "one command per row" id-list message (code `usage`), the `linkedBy` detail of `report-number-ambiguous`, and `set-status.mjs` no longer printed the follow-up line; restored. `set-status-lock-scope` now reads the service, where the lock transaction lives.
- `walk-tree`: `scripts/security-audit.mjs` now walks with `lib/walk-tree.mjs`.
- `check-jd-archive.mjs --self-test`: three checks read the removed `modes/zh` and `modes/de` templates; they now use the shipped `modes/hi` placeholder, and a temp fixture keeps the full-width-parenthesis case.
- Archive-posting egress guard: the test relied on live DNS for `example.com`; it now installs a stub resolver.
- `EnvironmentVariables.md` and its generator: the example path is `~/my-job-search`.
- `SYSTEM_PATHS` coverage: the fork's added files are listed in `lib/update-manifest.mjs`; `.no-upstream-updates` is repo-only (`validate-system-paths-coverage.mjs`).
- `updater-migration-tests.mjs`: the apply cases set `CAREER_OPS_ALLOW_UPSTREAM_UPDATES=1` (ADR 0013's override) so they reach the confirmation logic; manifest entries for files removed in ADR 0013 are allowed to be absent, and the removed `README.*.md` translations are no longer required.
- `readme-shared-layer`: deleted. The engine README is a short Rolewright page with no project tree, so there is nothing to check. `readme-usage-commands` now checks that every command in the README Command Reference is routed (the `job` alias it listed was not). The README gained the Codex paragraph the Codex check requires.
- `scripts/followup-sweep.sh` is committed executable.
- Legacy web UI (kept, ADR 0007 as amended): five `text-brand` uses now use `text-brand-text`; the doctor route is in process, so its spawn and failed-child tests became one in-process test and `web-core-argv-contract` no longer lists it; the market-mode tests use `modes/hi`, the only market set left.
- `tests/pdf-shared-browser.test.mjs`: flaky when the browser launch is slow under load (failed once in four full runs); passes alone.
- `#2346` was not flaky: the `linkedBy` detail was missing (fixed above). Follow-up lock-timeout lines in the log are the expected output of tests of that timeout, not failures.

## Rules for changes

- A change must not add failures relative to the latest row above. Fixing a pre-existing failure is welcome; record it here.
- A test tied to a deliberately removed feature is retired in the same change that removes the feature, with a reason in the commit message.

## Phase 0 exit (merged `3922e19`)

| Check | Result |
|---|---|
| `apps/web` `npm run typecheck` | pass |
| `apps/web` `npm test` | 394 pass, 0 fail, 4 skipped (Postgres-only; 371 of 371 when run on Postgres 16 during P0-8) |
| `apps/web` `npm run test:flow` | 17 of 17 |
| `apps/web` `npm run test:e2e` | 21 of 21 |
| `apps/web` `npm run test:prod` | 15 of 15 |
| `packages/engine` `npm run lint` | pass |
| `packages/engine` `node test-all.mjs --quick` | 19,678 pass, 28 fail (pre-existing list) |

Browser runs set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. The app CI workflow (`app-ci.yml`) has not run yet.
