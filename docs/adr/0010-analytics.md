# 0010. Privacy-first event analytics

- **Status:** Accepted
- **Date:** 2026-11-19
- **Decided by:** the owner

## Context

We need to know whether people sign up, tailor, export, apply and get callbacks (ADR 0016) without moving resume content anywhere.

## Decision

- Record events only: for example signed up, resume uploaded, tailoring created, export succeeded, export blocked by the fact gate, application tracked, callback reported.
- An event carries a user id, a timestamp and small enumerated properties (segment, provider, block reason). It never carries resume text, job-description text, a key, or free text the user typed.
- **Amended 2026-11-20 (owner):** an event may also carry bounded integers checked against an allowlist. The first are keyword-match percentages before and after tailoring (0 to 100), which ADR 0016's success measure needs. Events are kept until the account is deleted or the 12-month purge, whichever comes first.
- First-party or self-hosted storage. No session replay.

## Consequences

- Events can live in the app's own Postgres at first.
- Any new event property is reviewed against this ADR before it ships.
