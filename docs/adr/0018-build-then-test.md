# 0018. Delivery from Phase 1: build in parallel, test at the end

- **Status:** Accepted
- **Date:** 2026-11-20
- **Decided by:** the owner
- **Amends:** ADR 0017 (roles, isolation and the owner gate are unchanged)

## Context

In Phase 0 every worker ran the full app suites, dev servers and browsers before review. That made workers slow. It also left servers running that held ports and locks, and it ran the machine short of memory, so at most 4 workers could run at once. Most of the waiting was on test runs, not on building.

## Decision

- **Build waves.** All tasks in a phase are built in parallel, limited only by real dependencies between tasks. Within a wave, no two tasks touch the same files.
- **Tests during build.**
  - **Workers write tests.** They write the tests their brief requires.
  - **Workers run only fast tests.** They run typecheck and `node --test` on the test files for the code they touched.
  - **Full runs wait.** No full suites, dev servers, browsers, `test:e2e`, `test:prod` or engine `test-all` run while building.
- **Test wave.** It runs after every build task has merged.
  1. Run the full suites: typecheck, `npm test`, `test:flow`, `test:e2e`, `test:prod`, `build`, engine lint and `test-all --quick`, and the CI run on the draft pull request.
  2. Triage each failure as a regression, a pre-existing failure (judged against `docs/reviews/test-baseline.md`) or a flaky test.
  3. Turn each regression into a fix task (`P<n>-F<k>`). Fix tasks get the same brief and review as build tasks.
  4. Repeat until the run is clean.
- **Workers.**
  - **Sonnet** for security-sensitive code (as listed in ADR 0017).
  - **Haiku** for mechanical work.
  - **Opus** as the escalation worker. It takes a task that fails its second review round, or a task the advisor names in the brief as too intricate.
- **Concurrency.** At most 6 workers at once, since none run servers during build.
- **Review.** The advisor still reviews every diff before it merges. Two things change:
  - Review judges the diff, the new tests and the fast-test output, not full-suite results.
  - The advisor still checks the whole merged result at the end of the test wave, before the owner gate.

## Consequences

- Faster building, with less waiting and fewer leftover processes.
- Problems that only appear when changes combine are found later. A regression introduced in the first build wave may not show up until the test wave, so the test wave needs enough time set aside for fixes.
- A clean test wave becomes part of the phase exit, alongside the advisor's phase review.
