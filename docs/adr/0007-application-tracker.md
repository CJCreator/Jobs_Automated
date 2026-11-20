# 0007. Application tracker rebuilt in the app; legacy web UI retired

- **Status:** Accepted
- **Date:** 2026-11-19
- **Decided by:** the owner

## Context

The tracker is in v1 scope (ADR 0001). The legacy local UI (`packages/engine/web`) has a Kanban tracker, but it reads and writes markdown files on the user's machine, which a hosted multi-user app cannot use. The web review also found defects in it: a hardcoded "94% Legit" badge on every card, silent status rewrites on drag, the wrong report opening when tracker and report numbers differ, and cards that keyboard users cannot open.

## Decision

- Build the tracker in `apps/web` on Postgres with the same per-user row-level security as the rest of the app.
- Reuse the Kanban layout ideas, not the code.
- Statuses follow the engine's canonical list (`packages/engine/templates/states.yml`).
- Every card is reachable and movable by keyboard.
- No fabricated signals: any legitimacy or fit indicator must come from real data or not be shown.
- Delete `packages/engine/web` once the tracker ships. It remains recoverable from git history.

## Consequences

- New tables for applications and status history.
- A tracker entry links to the tailoring and the exported resume it used.
- The tracker is part of the data export and erasure in ADR 0004.
