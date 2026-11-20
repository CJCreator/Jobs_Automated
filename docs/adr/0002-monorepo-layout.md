# 0002. Monorepo: apps/web and packages/engine

- **Status:** Accepted
- **Date:** 2026-11-19
- **Decided by:** the owner

## Context

The fork mixed three things at the root: the career-ops engine (about 200 scripts), a local web UI for it (`web/`), and the hosted app (`rolewright/`). The hosted app imports engine files (the fact gate, the PDF renderer) from its parent folder.

## Decision

- `apps/web`: the hosted Next.js app (formerly `rolewright/`).
- `packages/engine`: the whole career-ops engine, moved as one unit so its internal paths and tests keep working. It includes the legacy local UI at `packages/engine/web` until ADR 0007 retires it.
- The app finds the engine at `../../packages/engine`, or wherever `CAREER_OPS_CODE_ROOT` points.
- Each package keeps its own `package.json` and lockfile. npm workspaces are deferred: hoisting changes how Next resolves modules, and the engine's `postinstall` downloads Chromium. Adopting workspaces needs its own ADR, after the app and engine test suites are green under it.
- **Recovery point:** commit `4ecbf5e` is the last commit before the restructure and the removals. Everything removed is recoverable from it.

## Consequences

- CI runs engine jobs with `working-directory: packages/engine`, and app jobs from `apps/web`.
- Engine tests that inspected the upstream `.github/` configuration no longer find it under the engine. They are fixed or retired case by case, against the baseline in `docs/reviews/test-baseline.md`.
- The root holds only product-level files: README, licence, notice, agent guide, docs.
