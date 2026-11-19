# Phase 0 follow-ups

Items raised in advisor reviews that the reviewed task does not own. Each is assigned to a later task or recorded as an accepted limit. The phase-exit review checks this list.

| From | Item | Owner / decision |
|---|---|---|
| P0-7 review | `src/proxy.ts:13` relaxes the CSP on `NODE_ENV`; key it on `!strictEnv(process.env)` | P0-11 (not blocking: `next dev` now exits on a deployed host) |
| P0-7 review | Cloud Run startup and health probes must hit an app route, not a TCP check or a static asset | P1-6 |
| P0-7 review | `prod-smoke` step: start with `K_SERVICE=x` and no `DATABASE_URL`, assert the process exits | P0-9a |
| P0-5 review | "Save in this browser" and privacy text about browser storage are now false | P0-3b (must merge before the phase gate) |
| P0-5 review | Stale second tab keeps user A's key after A signs out elsewhere | Known limit against ADR 0003; later fix via `BroadcastChannel` or an owner check on AI routes |
| P0-5 review | Same user signing back in without reload keeps the key | Accepted: within "the visit" |
| P0-5 review | Legacy `rolewright.llm` item removed only when an `/app/*` page loads | P0-11 or later: move removal to the root layout |
| P0-5 review | Key input may be offered to password managers | Next task touching `key-view.tsx`: `autoComplete="new-password"`, `data-1p-ignore`, `data-lpignore` |
| P0-5 review | ADR 0003 asked `test:flow` for the browser-storage check; it lives in `test:e2e` step b | Phase gate runs `test:e2e` (already in the exit list) |
| P0-5 review | Dead `saveFailed` branch in `key-view.tsx:98-100` | Next task touching `key-view.tsx` |
| P0-7 review | `apps/web/README.md:142` names `/privacy` and `/robots.txt` as static pages; say "every page and route answers 500" | P0-3b |
| P0-1a review | Claim word supported by any token in the facts ("Reported to the Finance Manager" supports "assistant manager"); require same role or title line | Later gate task (after P0-1b) |
| P0-1a review | Missing variants: principals, gurus, veterans, diplomas, toppers, seniors, heads of, "Head, Finance", seniormost, expertly | Later gate task |
| P0-1a review | Missing Indian-market titles and scope: mgr, gm, avp, svp, c-suite, pan-India, in charge of, headed, leader of | Later gate task |
| P0-1a review | Homoglyphs ("expеrt" with Cyrillic е) pass both layers; add a mixed-script token check | Later gate task |
| P0-1a review | Name check blocks family-supported tokens ("Sr. Manager" vs facts "Senior Manager") | Later gate task |
| P0-1a review | Browser test for the grouped export-blocked notice | P0-11 |
| P0-1a re-review | "ph d" (space, no dots) passes; "Ph. D." blocks only via the name check | Later gate task |
| P0-1a re-review | "Vice President" vs facts "VP" false-blocks on the name check (one attest click) | Later gate task |
| P0-6 review | Text cap merged; CPU and decompressed-size bound still open (launch review P1-6, PLAN row 7) | Closed: CPU bound by P0-6b, memory bound by P0-6c (watchdog refuses at about 270-310 MB external in about 1 s) |
| P0-6 review | Set Cloud Run memory, request timeout and concurrency explicitly; worker typed-array memory is bounded only by the instance limit | P1-6 |
| P0-6 review | Upload rate limit is per process, so it weakens with more instances | P1-3 |
| P0-4 review | Purge and `deleteUserData` cascade as the non-superuser role under FORCE RLS | P0-8 |
| P0-4 review | One real Cloud Scheduler call end to end (also confirms the no-IAM-invoker setup) | P1-7 |
| P0-4 review | Log-only code to tell "keys unavailable" from a bad token | Later ops task |
| P0-4 review | Alert when the daily purge stops succeeding | P1-6 |
| P0-4 review | `getDb()` runs before auth, so a DB outage shows 500 not 401 | Optional, later |
| P0-4 review | ADR 0004 line 17 still describes the purge as a host-scheduled script | Next ADR edit |
| P0-4 re-review | Cloud Scheduler job: at least 3 retries, minimum backoff 60 s (outlasts the 45 s key-fetch refusal) | P1-6 |
| P0-4 re-review | Floor the key cache at 300 s if Google ever omits `max-age` | Optional, later |
| P0-10 review | Contact: per-field "not found" marker; check phone, location, links against the upload | Later facts task |
| P0-10 review | Job fields matched anywhere in the text (company from one job, title from another); match within one neighbourhood; add location | Later facts task |
| P0-10 review | A skill only in a pasted job description counts as found | Known limit of text matching |
| P0-10 review | User-added items inside sections are dropped on re-upload (only extras survive) | Product decision, later |
| P0-10 review | A singly confirmed model item is unconfirmed again on every re-upload | Per brief; revisit on feedback |
| P0-10 review | `uploadHelp` should mention kept confirmations | P0-3b |
| P0-10 review | One manual run with a real model key to see rewordings flagged | P1-4 |
| P0-3a review | Merge P0-3b right after P0-5: the public notice says the key is stored in the browser | Merge order |
| P0-3a review | Align the privacy h1 with "Privacy notice"; grievance vars in the README table | P0-3b |
| P0-3a review | prod-smoke: scope the privacy-link selector; `/privacy` signed-out 200 with nonce CSP; production has grievance contact set | P0-9a |
| P0-3a review | Signed-out axe, target-size, skip-link and 360 px checks on `/privacy` | P0-9a or P0-11 |
| P0-3a review | Retention sentence is public: scheduler must run before real users see it; lawyer review of the notice (ADR 0004) | Phase gate |
| P0-3a review | Briefs touching landing, sign-in or `/app` pages must list `npm run test:e2e` | Remaining briefs (P0-2, P0-3b, P0-9a) |
| P0-3a review | Consent record imports `NOTICE_VERSION` from `notice.mjs` | P0-2 |
| P0-6b review | Size Cloud Run memory and concurrency from the bomb numbers (1 to 2 GB per bomb until the watchdog); workers share vCPUs with the main loop | P1-6 |
| P0-6b review | `execArgv: []` on the Worker so inherited node flags cannot break worker start | Later |
| P0-6b review | Pass the file bytes with a transfer list instead of copying three times | P0-6c (note) |
| P0-6c review | Cloud Run memory at least 2 GiB, explicit concurrency (bounds the PDF wait queue), Node pinned at 22.16+ so the watchdog exists | P1-6 |
| P0-6c review | Pass the request abort signal into `pdfText` so a disconnected client's queued parse is dropped | Later (needs the resume route) |
| P0-6c review | Route-level test that a plain Error from `pdfText` becomes 500 (today a source grep) | Later |
| P0-6c re-review | 503 `pdf_busy` has no `Retry-After` header (wrapper has no header field on status errors) | Later |
| P0-1b review | Cover letters: pass target role and company to the gate so body sentences about the job applied for are not read as the candidate's claims | Phase 2 cover letters (ADR 0015) |
| P0-1b review | Indian magnitudes: lakh, crore, Mn not treated as magnitudes; "5 lakh customers" compared as "5 customers" | Later gate task (before cover letters) |
| P0-1b review | "10k" vs "10,000" not equal | Later gate task |
| P0-1b review | Employer suffixes and cities ("Infosys Ltd", "Infosys Bengaluru") block as unknown employers | Later gate task |
| P0-1b review | Title-cased phrases after "at" read as employers ("at Month End") | Later gate task |
| P0-1b review | Old quadratic regex: 50k chars of "1," take about 19 s; confirm the app caps engine input size | P0-11 check |
| P0-1b review | Precompile per-family regex in `builtinClaimWordFacts` | Later |
| P0-1b review | "Post Graduate Diploma" vs "Postgraduate Diploma"; review "Executive summary", "Enterprise reporting", "award-winning" false blocks | Later gate task (both twin lists) |
| P0-1b review | Should an unsourced title in the engine's structured title slot block instead of warn? | Owner decision (ADR 0005) |
| P0-3b | Retention notice drops "A scheduled job checks for this once a day" until Cloud Scheduler runs the purge (ADR 0004: a promise with no job is a defect) | Restore in P1-7 once the scheduler is seen firing |
| P0-6d review | If the memory-bomb test flakes again, add a test hook for a smaller external-memory cap (e.g. 32 MB) and drop the elapsed bound; rename the title from "well before" to "before" | Next task touching pdf-text tests |
| P0-9a review | HSTS `includeSubDomains`: decide before mapping the app to an apex domain with http-only sibling subdomains; keep `preload` off until the domain layout is settled; record in ADR 0009 | Owner decision at custom-domain time |
| P0-9a review | Check whether `console.error` + `process.exit(1)` in `instrumentation.ts` can lose the message over a pipe | If step 2b flakes |
| P0-3b review | Privacy notice names only the AI provider as a recipient; add "Who else handles your data": Resend (email sign-in), Google (sign-in), Google Cloud (hosting) | Before sign-ups open: P0-11 or a copy task at the phase gate (needs a NOTICE_VERSION bump) |
| P0-3b review | `/app/privacy` tab title still "Privacy" while the h1 says "Privacy notice" | Next task touching that page |
| P0-3b review | Merge P0-2 before P0-3b: the notice states a consent record is stored | Merge order |
