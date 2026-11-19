# 0005. The fact gate is a hard export gate

- **Status:** Accepted
- **Date:** 2026-11-19
- **Decided by:** the owner

## Context

The product's promise is that nothing invented reaches a recruiter. Suggestions come from a language model, which invents employers, credentials, figures and scope. The launch review reproduced invented credentials and scope words passing both the app's claim checker (`apps/web/src/lib/claims.mjs`) and the engine gate (`packages/engine/verify-cv-facts.mjs`): "Certified", "Expert" and "Global" reached the export. A separate claims audit found invented employer names and some unit-bearing metrics also pass the engine gate.

## Decision

- Export is refused unless every changed line passes the fact gate against the user's confirmed facts. There is no override in the product.
- The gate blocks invented credentials, certifications, seniority and scope words, employers, titles, tools and figures not present in confirmed facts.
- Each reproduced bypass gets a regression test before it is fixed.
- Facts extracted by the model are unconfirmed until the user confirms them. A "confirm all" path must not hide which facts came from the model rather than the uploaded text.
- **Launch blocker:** no public sign-ups until the reproduced bypasses are fixed and tested.

## Consequences

- Some honest rewordings will be blocked. The user can edit the line or confirm the missing fact; the product does not loosen the gate to reduce friction.
- Cover letters and interview prep (ADR 0015) go through the same gate.
