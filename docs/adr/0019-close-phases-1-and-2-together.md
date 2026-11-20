# 0019. Close Phases 1 and 2 together

- **Status:** Accepted
- **Date:** 2026-11-20
- **Decided by:** the owner
- **Amends:** ADR 0017 (one gate per phase) and ADR 0018 (one test wave per phase)

## Context

Phase 1 is in its last two fact-gate tasks. Running Phase 1's test wave and owner gate, then planning and building Phase 2, then a second test wave and gate, was taking too long. The owner asked to close Phases 1 and 2 quickly so Phase 3 can start.

## Decision

- **Phase 2 builds now.** The advisor writes Phase 2 briefs with the smallest launch scope and builds them in parallel with the end of Phase 1. Phase 2 tasks do not touch the fact-gate files that Phase 1 still has in flight.
- **One test wave.** Phases 1 and 2 share one test wave after every task from both has merged.
- **One owner gate.** The advisor reviews Phases 1 and 2 together, and the owner approves both at one gate.
- **Faster review.** A task's last review may approve with small fixes that the orchestrator applies at merge, instead of another worker round. A real fabrication bypass still sends the task back.

## Consequences

- Faster path to Phase 3.
- A Phase 1 regression can surface later, mixed with Phase 2 changes, so the shared test wave needs time set aside for fixes.
- Phase 2 scope is cut to what a first public launch needs; what was cut is recorded in `EXECUTION.md`.
