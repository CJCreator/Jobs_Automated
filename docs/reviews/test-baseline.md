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
| After test repairs | this commit | 19,509 | 28 | Every inline section runs to the end; earlier runs stopped at a crash reading the removed `modes/zh`, which hid later sections. All 28 failures are on the pre-existing list below. |

## The app

| Check | Before the restructure | After |
|---|---|---|
| `apps/web` `npm test` | 204 pass, 0 fail, 1 skipped, 1 todo | 204 pass, 0 fail, 1 skipped, 1 todo |
| `npm run typecheck` | pass | pass |
| `npm run test:flow` | 15 of 15 | 15 of 15 |
| `npm run test:prod` | 12 of 13 | 12 of 13 |

After Phase 0 waves A to C (merged `ec9f577`): `npm test` 359 pass, 0 fail, 1 skipped; `test:flow` 16 of 16; `test:e2e` 17 of 17; `test:prod` 15 of 15 on the P0-9a branch (13 original steps plus 2b and 11b). Browser runs need `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

After the browser sweep and the merge of P0-8 and P0-12 (P0-11, merged tree): `npm run typecheck` pass; `npm test` 380 tests, 376 pass, 0 fail, 4 skipped (the Postgres suites skip without a database); `npm run test:flow` 16 of 16; `npm run build` pass; `npm run test:e2e` 21 of 21 (17 earlier steps plus g3, p, k and m); `npm run test:prod` 15 of 15, including step 13 with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` set. The e2e steps added: g3 (a refused export lists the failing line and its words; "Go to this suggestion" focuses its card), p (signed-out `/privacy`: linked from `/` and `/sign-in`, axe, target size, skip link first, no sideways scroll at 360), k (tailor form asks for consent from an account with hand-typed facts and none given, then stops asking) and m ("Not found in your resume" badge on a second fixture; "Confirm all" skips it and says so). Step b also checks the legacy `rolewright.llm` item is removed on a page load.


## Known pre-existing engine failures (not caused by the restructure)

- CLI skill entrypoints committed as regular files rather than symlinks (`skill-project-root` and the inline entrypoint check).
- Absolute paths in `docs/development/EnvironmentVariables.md` and the doc generator.
- `check-jd-archive.mjs --self-test`.
- The archive-posting egress guard check.
- Follow-up lock timeouts and the follow-up sweep permission check, which fail under parallel load or in fresh checkouts (`scripts/followup-sweep.sh` is committed without the executable bit).
- `set-status` lock scope and its three suites, `walk-tree`, `writer-scripts-data-root`, `updater-migration-tests.mjs`.
- `SYSTEM_PATHS` coverage gap, README Codex guidance, `readme-shared-layer` and `readme-usage-commands`.
- Legacy web UI: the doctor route contract and the PDF write-scope suites (retired with `packages/engine/web`, ADR 0007).
- `#2346`, `#2348` (`set-status.test.mjs`) and "Multiple tracker IDs", which are flaky under parallel load and pass when run alone.
- `tests/pdf-shared-browser.test.mjs`, flaky when the browser launch is slow under load.

## Rules for changes

- A change must not add failures relative to the latest row above. Fixing a pre-existing failure is welcome; record it here.
- A test tied to a deliberately removed feature is retired in the same change that removes the feature, with a reason in the commit message.
