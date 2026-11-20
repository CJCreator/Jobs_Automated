# 0004. Data protection: consent, notice, retention, export, erasure

- **Status:** Accepted
- **Date:** 2026-11-19
- **Decided by:** the owner

## Context

Resumes are personal data. India's Digital Personal Data Protection Act 2023 expects informed consent, a notice before collection, a stated retention period, a grievance contact, and erasure on request. The launch review (`docs/reviews/rolewright-launch-review.md`) found the app promises a daily clean-up that nothing runs, records consent only as a UI checkbox, shows the privacy notice only after sign-in, and names no grievance contact. This ADR records the product decisions; it is not legal advice, and a lawyer should review the notice before launch.

## Decision

- **Notice before collection:** the privacy notice is reachable from the landing page and the sign-in page, before an email is collected.
- **Consent record:** when a user uploads a resume, the server stores the consent text version, a timestamp and the user id. The API refuses an upload without it.
- **Cross-border processing:** the notice says resume and job-description text is sent to the AI provider the user chose (or our trial provider) to generate suggestions.
- **Grievance contact:** a named contact and email in the notice.
- **Retention:** an account and all its data are deleted after 12 months with no sign-in. The user is reminded in-app beforehand (ADR 0008; email when an email channel exists). The purge (`npm run purge:inactive` in `apps/web`) is scheduled on the host. A promise in the UI with no scheduled job is a defect.
- **Export:** one-click download of everything we hold for the user (confirmed facts, resumes, tailorings, tracker) as JSON plus PDFs.
- **Erasure:** whole-account deletion (exists today) plus deletion of a single resume, tailoring or tracker entry.

## Consequences

- New schema: a consent table or columns. A migration is needed for existing rows.
- The purge job needs a scheduler on whatever host ADR 0009 picks.
- Uploads keep the size cap. A decompressed-size cap is added before PDF parsing (the review reproduced a 175 KB file producing 60 MB of text).
- Production refuses to start without `DATABASE_URL`, so data never silently falls back to local disk.

## Amended

- **2026-11-20:** The purge is run by Google Cloud Scheduler, which calls `POST /api/internal/purge` once a day with an OIDC token (see `apps/web/README.md`). `npm run purge:inactive` in `apps/web` is the fallback. The retention decision above is unchanged.
- **2026-11-20:** The `DATABASE_URL` refusal applies on a deployed host (`K_SERVICE` set, or `ROLEWRIGHT_DEPLOYED=1`); with `NODE_ENV=production` elsewhere the embedded database is allowed and logs a warning.
