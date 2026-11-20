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

## Amendment 2026-11-20 (owner): what the gate does not catch

The Phase 1–2 exit review (`docs/plan/phase-1-2-exit.md`) reproduced gaps that remain after P1-19 to P1-21 and P2. The owner accepted them for launch and recorded them here, and they are scheduled for Phase 3 (P3-G1 to P3-G3). The README links to this section.

**Not caught today.** A changed line containing any of these can pass even when the confirmed facts do not support it:

- Employer, tool and place names written in lower case ("at infosys and deloitte", "tableau and snowflake", "across india, singapore and dubai"). Name detection relies on capital letters. A figure confirmed next to a lower-case name ("Hired 12 deloitte auditors") stores that name as well.
- Lines in Hinglish and other non-English languages written in Latin script ("Team ka lead tha…"). French and Devanagari were blocked in the review's probes.
- Some seniority words and titles ("finance head", "team leader"), accented look-alike letters such as "sénior", and wording around "C-suite" that comes after it ("…to the C-suite, which I then joined").
- Counts joined to a money figure by anything other than "and" or "or" ("2 crore budgets & customers").
- A number whose surrounding words are not checked, for example "Led 12 branch analysts" when the facts say "12 analysts". The full list is in `apps/web/tests/number-context.test.mjs`.

**Caught today**, for comparison: invented employers and titles written with capitals, credentials and degrees (including dotted forms), seniority and scope words, rank and award phrases, length of experience, languages by name, inflated verbs ("Led" when the facts say "Assisted"), counts by context ("team of 12"), ₹, lakh, crore and other currency amounts, lines the gate cannot read, and lines in non-Latin scripts.

The rest of this ADR is unchanged. There is no override in the product, and the user reviews every change.
