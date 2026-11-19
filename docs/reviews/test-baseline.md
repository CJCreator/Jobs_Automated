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

`test:prod` step 13 (hydration without CSP violations in Chromium) fails in this environment because it launches Playwright's default Chromium build, which is not installed. It ignores `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. That is an environment issue, not a product failure, but the test should honour the variable.

## Known pre-existing engine failures (not caused by the restructure)

- CLI skill entrypoints committed as regular files rather than symlinks (`skill-project-root` and the inline entrypoint check).
- Absolute paths in `docs/development/EnvironmentVariables.md` and the doc generator.
- `check-jd-archive.mjs --self-test`.
- The archive-posting egress guard check.
- Follow-up lock timeouts and the follow-up sweep permission check, which fail under parallel load or in fresh checkouts (`scripts/followup-sweep.sh` is committed without the executable bit).
- `set-status` lock scope and its three suites, `walk-tree`, `writer-scripts-data-root`, `updater-migration-tests.mjs`.
- `SYSTEM_PATHS` coverage gap, README Codex guidance, `readme-shared-layer` and `readme-usage-commands`.
- Legacy web UI: the doctor route contract and the PDF write-scope suites (retired with `packages/engine/web`, ADR 0007).
- `#2346` and "Multiple tracker IDs", which are flaky under parallel load.

## Rules for changes

- A change must not add failures relative to the latest row above. Fixing a pre-existing failure is welcome; record it here.
- A test tied to a deliberately removed feature is retired in the same change that removes the feature, with a reason in the commit message.
