# Review: legacy local web UI (now packages/engine/web)

- **Date:** 2026-11-19
- **Reviewed at:** commit `4ecbf5e`. Paths are relative to `packages/engine/web`.
- **Context:** ADR 0007 retires this UI once the tracker is rebuilt in `apps/web`. The findings are kept so the rebuild does not repeat them.

## Checks at review time

- Typecheck: pass.
- Tests: 2180 pass, 10 fail, 39 skipped. The failures were contrast checks, a missing loading page for the since-removed negotiation route, and the doctor and core-script route tests.
- Build: blocked. Next 16.4.1 stopped with `SecurityFatalError` because of a known security advisory, so the build needs a Next upgrade.

## Findings that matter for the rebuild

| Sev | Finding | Where |
|---|---|---|
| P1 | **Fabricated legitimacy signal.** Every card and row passes a hardcoded "94% Legit" (42 for skip or reject) to the badge, whatever the posting's real state. | `src/components/pipeline/kanban-board.tsx`, `pipeline-view.tsx`, `report-view.tsx` |
| P1 | **Dropping a card in its own column silently changes its status.** `Hired` becomes `Offer`, `Discarded` and `SKIP` become `Rejected`, `Responded` becomes `Assessment`. | `kanban-board.tsx` |
| P1 | **The wrong report can open.** The card link falls back to the tracker row number as the report number. | `kanban-board.tsx`, `src/lib/career-ops.ts` |
| P1 | **Keyboard users cannot open a job.** Cards have no `tabIndex`, role or key handler, and drag has no keyboard equivalent. | `kanban-board.tsx` |
| P1 | **The apply submit guard is heuristic.** It misses a control whose own script calls `form.submit()`. | `src/lib/apply/submit-guard.mjs` |
| P2 | Card menu has no Escape, outside-click or ARIA state. | `kanban-board.tsx` |
| P2 | The board cannot set `Hired`, `Discarded` or `SKIP`. | `kanban-board.tsx` |
| P2 | CV Studio routes return non-JSON 500s when an engine module is missing. | `src/app/api/cv-studio/[n]/route.ts` |
| P2 | Request bodies and CLI output are not size-capped. | `src/lib/json-body.ts`, `src/lib/cv-studio/rewrite-run.ts` |
| P2 | Binding to a non-loopback host opens every POST route to the LAN; the Host check trusts a client-chosen header. | `server.mjs`, `src/lib/origin-guard.mjs` |

## Fixed in this session

The negotiation links and nav entry, and the agent status panel import, which pointed at code removed earlier.

## Positive findings

- CSRF and Host checks cover every POST route.
- Writes share the tracker lock.
- Path containment is checked in the file routes.
