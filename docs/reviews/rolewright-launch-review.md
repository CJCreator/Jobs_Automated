# Launch-readiness review: apps/web (formerly rolewright/)

- **Date:** 2026-11-19
- **Reviewed at:** commit `4ecbf5e`, before the monorepo move. File paths below are relative to `apps/web`.
- **Method:** read-only review. Each finding is marked "reproduced" (shown by running code) or "read only". Unit tests, typecheck and build were run.

## Checks

- `npm run typecheck`: pass.
- `npm test`: 204 pass, 0 fail, 1 skipped (the Postgres negative control in `tests/db.test.mjs`), 1 todo (claims test: "a scope claim with no figure or tool passes both layers").
- `npm run build`: pass.
- Later in the same session: `npm run test:flow` passed 15 of 15. `npm run test:prod` passed 12 of 13; the failing step launches Playwright's default Chromium build, which was not installed in the review environment.

## P0: launch blockers

1. **The fact gate passes invented credentials and scope words.** `src/lib/claims.mjs` (the OPENERS list and the capitalised-clause skip rules) lets "Global", "Certified" and "Expert" through. Both the app check and the engine gate passed "Managed Global vendor contracts" and "Led a Certified Expert vendor programme" against a source without those words. They reach the PDF. *Reproduced.*
2. **The retention promise is false.** `src/i18n/en.ts` says a clean-up job runs daily. Nothing schedules `npm run purge:inactive`. *Read only.*
3. **No server-side consent record.** Consent is a React checkbox (`src/components/resume-view.tsx`). The upload route never reads it, and the schema has no consent column. *Read only.*
4. **The privacy notice comes after collection.** The only privacy page is under the signed-in layout; the landing and sign-in pages do not link to it. *Read only.*
5. **No grievance contact** in the privacy text. *Read only.*

## P1

6. **PDF parsing has no decompressed-size limit.** `src/lib/server/pdf-text.mjs` parses the whole file before page and character caps. A 175 KB crafted PDF produced 60 MB of text in 4.9 s at 782 MB memory; a 466 KB file reached 1.8 GB. *Reproduced (direct call, not over HTTP).*
7. **Dev sign-in and the fallback secret are keyed only to `NODE_ENV`.** `src/lib/server/env-guard.mjs` returns no problems unless `NODE_ENV=production`, so a staging host with `ROLEWRIGHT_DEV_LOGIN=1` would enable the dev sign-in. *Reproduced at function level; an HTTP bypass was not demonstrated.*
8. **Model-extracted facts can be confirmed without a source check.** Nothing compares extracted facts with the uploaded text, and "Confirm all" confirms whole sections. *Read only.*
9. **No erasure below account level, and resumes pile up.** Each upload inserts a new resume row; no route deletes a resume, job or tailoring. *Read only.*
10. **Rate limits are per process, and sessions cannot be revoked** (7-day sliding JWT). Both are acknowledged in the README. *Read only.*
11. **Export and the auth POST have no rate limit.** Export opens a new Chromium context per call. *Read only.*
12. **The production database silently falls back to the embedded database** when `DATABASE_URL` is unset. *Read only.*
13. **Row-level security and row locks are unverified on Postgres.** The Postgres negative control is skipped. *Read only.*

## P2

14. The AI key is stored in `localStorage` (`src/lib/client/llm-key.ts`). Superseded by ADR 0003: keys become session-only.
15. No HSTS header.
16. Re-uploading a resume reverts confirmed facts to unconfirmed.
17. Account deletion leaves verification tokens keyed by email.
18. The job-description text also goes to the AI provider; the notice covers the resume but not the job description separately.

## Checked and fine

- CSP with a per-request nonce, `frame-ancestors` and `object-src` locked.
- API CSP `default-src 'none'`, same-origin check, JSON-only bodies.
- Upload size cap read before parsing; PDF magic-byte check.
- No key or body in logs.
- Data routes go through `withUser` with row-level security.
- Export re-checks changed lines.

## Not covered

- Live Postgres; real Google or email sign-in; real AI provider calls.
- Proxy or CDN logging of the key header.
- A 5 MB adversarial PDF in production (extrapolated only).
- Legal conclusions under DPDP.
- `npm audit` and dependency review.
