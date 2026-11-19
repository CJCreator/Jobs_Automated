# 0013. Fork of career-ops: attribution, no upstream updates

- **Status:** Accepted
- **Date:** 2026-11-19
- **Decided by:** the owner

## Context

career-ops is MIT-licensed. Its trademark policy allows forks and "based on career-ops" credits, but reserves the name for commercial product naming. Its updater (`update-system.mjs`) installs upstream releases over system files, which would undo this fork's restructure and rebrand.

## Decision

- **Attribution:** `LICENSE` keeps the original copyright line and adds Rolewright contributors. `NOTICE` credits career-ops and states no endorsement. The app footer says "Based on the open-source career-ops project".
- **No upstream updates:** `packages/engine/.no-upstream-updates` makes `update-system.mjs check` report `disabled`, and `apply`, `rollback` and `dismiss` refuse. Setting `CAREER_OPS_ALLOW_UPSTREAM_UPDATES=1` re-enables them on purpose. Upstream fixes are brought in by hand, file by file.
- **Removed:** upstream community and governance material (contributors list, Hired Wall, manifesto, sponsors, governance, maintainers, code of conduct, changelog, release tooling, triage bots), the upstream origin story and its unbacked numbers, and the non-India market prompt sets. All are recoverable from commit `4ecbf5e`.
- **Kept as internal identifiers:** environment variables such as `CAREER_OPS_ROOT`, the `.career-ops-data` marker, and file names inside the engine. They are not product naming, and the engine and its tests depend on them.

## Consequences

- Upstream security fixes do not arrive automatically. Someone checks upstream releases periodically.
- Engine prose (modes, docs) still says "career-ops" in many places. It is renamed where users see it; internal mentions can stay.
- The engine's outbound identity still names career-ops: the HTTP User-Agent (`packages/engine/user-agent.mjs`, `career-ops/1.0` with upstream's repository as the contact URL) and the OpenRouter `X-Title` header (`openrouter-runner.mjs`). That is acceptable while only the owner runs the engine. It must change to a Rolewright identity with our own contact URL before job discovery (ADR 0001) makes requests to job boards on users' behalf.
