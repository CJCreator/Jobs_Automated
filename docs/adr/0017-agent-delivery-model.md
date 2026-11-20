# 0017. Delivery: advisor plans and reviews, workers build, owner gates phases

- **Status:** Accepted
- **Date:** 2026-11-19
- **Decided by:** the owner

## Context

The owner builds Rolewright alone with AI agents and has no deadline. The work in Phases 0 and 1 splits into many independent tasks, but several of them touch security, personal data and the fact gate. A wrong change there causes harm that is hard to undo, so the people and models doing the building should not be the only ones checking it.

## Decision

- **Orchestrator:** the main coding session. It runs the loop, dispatches workers, merges and keeps `docs/plan/EXECUTION.md` current. It does not write product code itself except to resolve merge conflicts.
- **Advisor (Fable):** writes each phase's task graph and the brief for every task, then reviews every worker's diff against the brief and the ADRs before it merges. The advisor does not write product code.
- **Workers:** chosen per task.
  - **Sonnet** for code that touches the fact gate, keys, auth, consent, the database schema, row-level security, rate limits, infrastructure and anything with a security test.
  - **Haiku** for mechanical work: copy and doc edits, wiring config values, test triage, renames.
- **Isolation:** each worker runs in its own git worktree on its own task branch and merges into `claude/eloquent-tesla-8pto6q` only after the advisor approves.
- **Limits:** at most 4 workers at once. A task gets at most 2 rounds of review fixes; after that it goes back to the advisor to re-brief or split.
- **Owner gate:** once per phase. The orchestrator presents the phase report (what merged, the test results against `docs/reviews/test-baseline.md`, the advisor's findings and open risks), and the next phase starts only after the owner approves.

## Consequences

- Every change has a written brief and a recorded review, kept in `docs/plan/EXECUTION.md`.
- Security-sensitive work costs more because it runs on Sonnet and always gets an advisor review; that cost is deliberate.
- The owner does not review each task, so the advisor's review checklist (in the execution plan) is the control. Changing that checklist needs an ADR.
