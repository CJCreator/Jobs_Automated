# 0016. Success measured as ATS keyword match and callbacks, separately

- **Status:** Accepted
- **Date:** 2026-11-19
- **Decided by:** the owner

## Context

"Getting past the first step" has two meanings. One is passing automated keyword screening, which the tool can measure immediately. The other is a recruiter calling back, which only the user can report later.

## Decision

- **Measure 1, tool-side:** ATS keyword coverage of the exported resume against the job description, computed from the ported `keyword-match.mjs` (ADR 0012). It is shown to the user and recorded as an event (ADR 0010).
- **Measure 2, user-reported:** an optional follow-up per tracked application asking whether they got a callback. Only the answer is stored.
- The two are reported separately and never combined into one score.

## Consequences

- Keyword coverage must never be raised by stuffing keywords the user has no facts for. The fact gate (ADR 0005) wins over coverage.
- Callback data will be sparse. It is a direction signal, not a precise rate, until volume grows.
