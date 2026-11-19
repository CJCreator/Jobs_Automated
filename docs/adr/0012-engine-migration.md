# 0012. Engine kept whole; resume logic ported to the app behind parity tests

- **Status:** Accepted
- **Date:** 2026-11-19
- **Decided by:** the owner

## Context

The career-ops CLI scripts contain resume-quality logic the app should use: keyword coverage, skill gaps against a job description, title consistency, ATS parseability, and role clarity. The owner does not want to lose that code, and wants it integrated into the app before anything is retired.

## Decision

- Move the whole engine into `packages/engine` unchanged (done). Nothing is deleted from it to make the repository lighter.
- Port resume-quality logic into the app one script at a time. Each port is a module with tests, and its output is checked against the CLI output on the same fixtures (a parity test) before the app uses it.

  | Script | What it gives the user | Phase |
  |---|---|---|
  | `keyword-match.mjs` | ATS keyword coverage against the job description | 2 |
  | `jd-skill-gap.mjs` | Skills the job asks for that the resume lacks, without adding claims | 3 |
  | `cv-title-check.mjs` | Job titles consistent with the confirmed facts | 3 |
  | `verify-ats.mjs`, `ats-payload.mjs` | ATS parseability of the exported resume | 3 |
  | `role-clarity.mjs` | Whether the job description states the role clearly | 3 |

- A script is retired from the engine only after its port passes parity and the app no longer calls the CLI version.
- The engine stays usable as a CLI skill for power users, renamed from `career-ops` to `rolewright`.

## Consequences

- The engine test suite keeps running in CI. Its pre-existing failures are tracked in `docs/reviews/test-baseline.md`, not hidden.
- Engine code the app imports (the fact gate, the PDF renderer) must not be retired while the app imports it.
