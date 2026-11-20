# Phase 2 briefs (ADR 0019)

Written by the advisor on 2026-11-20. Paths are under `apps/web/`. "Common to every brief" in `phase-1-briefs.md` applies, with `P2-x` comments. No task touches `claims.mjs`, `number-context.mjs`, `tailoring.mjs`, `verify-cv-facts.mjs`, `suggestion-card.tsx`, `client/types.ts` or `tests/e2e/run.mjs` (Phase 1 fact-gate work in flight).

## Cut from Phase 2

- **Onboarding:** one optional card on home with a tip per segment. No separate flow per segment, no segment prompts or fact templates.
- **Analytics:** four server events and a command-line report. No dashboard, no client events, no `signed_up` event (read `users.created_at`), no application or callback events (Phase 3).
- **Export:** JSON only. No bundled PDFs. Rate-limit records are not in the file.
- **PWA:** manifest and icons only. No service worker, no offline mode.
- **Phone width:** no CSS sweep task. The test wave adds the new screens to e2e step 6 (360 px); failures become `P2-F` tasks.

## Tasks

| ID | Title | Model | Touches | Depends on |
|---|---|---|---|---|
| P2-1 | Event analytics | Sonnet | `src/lib/db/events.mjs` (new), `src/lib/server/track.mjs` (new), `src/app/api/resume/route.ts`, `src/app/api/tailorings/route.ts`, `src/app/api/tailorings/[id]/export/route.ts`, `scripts/events-report.mjs` (new), `package.json` (one script line), `schema.mjs` (append), `tests/events.test.mjs` (new) | none |
| P2-2 | Data export | Sonnet | `src/lib/db/export.mjs` (new), `src/app/api/account/export/route.ts` (new), `src/components/export-data.tsx` (new), `src/app/app/privacy/page.tsx`, `en.ts` (append `en.dataExport`), `tests/export-data.test.mjs` (new) | none |
| P2-3 | Segment choice and tips | Sonnet | `src/lib/db/profile.mjs` (new), `src/app/api/profile/route.ts` (new), `src/components/segment-card.tsx` (new), `src/app/app/page.tsx`, `schema.mjs` (append), `en.ts` (append `en.segment`), `tests/profile.test.mjs` (new) | none |
| P2-4 | PWA manifest and icons | Haiku | `src/app/manifest.ts` (new), `src/app/icons/[size]/route.tsx` (new), `src/app/layout.tsx`, `tests/manifest.test.mjs` (new) | none |
| P2-5 | Notice update; events in the export | Sonnet | `en.ts` (existing keys in `en.app.privacy`), `src/components/privacy-notice.tsx`, `src/lib/notice.mjs`, `tests/fixtures/notice-lock.json`, `tests/notice.test.mjs`, `src/lib/db/export.mjs`, `tests/export-data.test.mjs` | P2-1, P2-2, P2-3 |

P2-1 to P2-4 are one wave. `schema.mjs` and `en.ts` are append-only for them. P2-5 is the only task that edits locked notice keys.

### Shared names

| Name | Value | Defined by |
|---|---|---|
| Table `events` | RLS user table | P2-1 |
| Event names | `resume_uploaded`, `tailoring_created`, `export_succeeded`, `export_blocked` | P2-1 |
| `recordEvent(db, userId, name, props)`, `listEvents(db, userId)` | in `events.mjs` | P2-1 (used by P2-5) |
| `track(userId, name, props)` | never throws | P2-1 |
| `users.segment` | `fresher`, `experienced`, `switcher` or NULL | P2-3 |
| `GET`/`PUT /api/profile` | `{ segment }` | P2-3 |
| `POST /api/account/export` | JSON attachment | P2-2 |
| `exportUserData(db, userId)` | in `export.mjs` | P2-2 (extended by P2-5) |

## P2-1 Event analytics (ADR 0010, 0016)

**Goal:** four events with no content are stored per user, and the owner can print totals.

**DDL** (append under `-- P2-1`):

```sql
CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name text NOT NULL CHECK (name IN ('resume_uploaded','tailoring_created','export_succeeded','export_blocked')),
  props jsonb NOT NULL DEFAULT '{}'::jsonb,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_user_id_idx ON events (user_id);
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS events_isolation ON events;
CREATE POLICY events_isolation ON events TO rolewright_app
  USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);
DROP POLICY IF EXISTS events_report ON events;
CREATE POLICY events_report ON events FOR SELECT TO rolewright_system USING (true);
GRANT SELECT, INSERT ON events TO rolewright_app;
GRANT SELECT ON events TO rolewright_system;
```

Match the existing schema's conventions (how other tables set `app.user_id`, role names, grants). If the existing pattern differs from this DDL, follow the existing pattern and say so.

**Steps**
1. `events.mjs`: `recordEvent` checks props against a frozen allowlist before inserting through `db.withUser`.
   - `provider`: a launch provider id or `trial`.
   - `reason`: `fact_gate`, `facts_too_large` or `nothing_confirmed`.
   - `coverage_before`, `coverage_after`: integers 0 to 100.
   - Any other key, any other string or a non-integer throws `TypeError`.
2. `track.mjs`: calls `recordEvent`, catches everything, and logs only the event name.
3. Call sites, each after the work succeeds:
   - resume route: `resume_uploaded` with `provider`;
   - tailorings POST: `tailoring_created` with `provider`;
   - export route: `export_blocked` with `reason` before each 409 throw, and `export_succeeded` with coverage percentages from `coverageFor` (omit them on `RangeError`).
4. `scripts/events-report.mjs` (`npm run events:report`), through `db.system`: per-day counts by name, distinct users, sign-ups from `users.created_at`, and a segment split using `to_jsonb(u)->>'segment'`, so it runs before P2-3 merges.

**Tests** (`tests/events.test.mjs`)
- An unknown name, an unknown key, a free-text value and an out-of-range integer are each refused.
- User B reads none of A's events.
- The app role cannot UPDATE or DELETE.
- Deleting the user removes their events.
- `track` swallows a database failure.
- A source scan shows the three routes pass no string from the request other than the provider id.

**Done when:** `node --test tests/events.test.mjs tests/db-structure.test.mjs` and `npm run typecheck` pass.

**Harness impact:** none expected. A failed event never changes a response.

## P2-2 Data export (ADR 0004)

**Goal:** one button on the privacy screen downloads everything held for the user as one JSON file.

**Steps**
1. `exportUserData` returns `{ format: "rolewright-export", version: 1, exportedAt, account, facts, resumes, jobs, tailorings, consents, trial }`.
   - User tables are read in one `db.withUser` call.
   - `account` is `SELECT to_jsonb(u) FROM users u WHERE id = $1` through `db.system`, so `segment` appears once P2-3 merges.
2. Route: `requireUser`, `await takeRateLimit("export", userId)`, then a JSON response with `Content-Disposition: attachment; filename="rolewright-data-YYYY-MM-DD.json"` and `Cache-Control: no-store`. Follow the existing route conventions (same-origin check, safe errors).
3. `export-data.tsx`: a card with one button that downloads with the fetch-and-blob pattern from `review-view.tsx` (copy the pattern locally; do not edit `review-view.tsx` or `client/types.ts`), with a status message in a live region. Render it on `app/privacy/page.tsx` above `DeleteResumeText`.

**Tests** (`tests/export-data.test.mjs`)
- With two seeded users, A's export holds every one of A's rows from each table and none of B's (search the output for B's marker strings).
- An empty account exports cleanly.
- The output has no key named `key`, `token` or `password`.

**Done when:** the test file and typecheck pass.

**Harness impact:** new flow and e2e steps in the test wave. The route shares the `export` bucket (20 an hour) with PDF export.

## P2-3 Segment choice and tips (PLAN "Who it's for")

**Goal:** a user can pick which of three situations fits them and gets a matching tip. Skipping it blocks nothing.

**DDL** (append under `-- P2-3`): `ALTER TABLE users ADD COLUMN IF NOT EXISTS segment text CHECK (segment IN ('fresher','experienced','switcher'));`

**Steps**
1. `profile.mjs`: `getSegment` and `setSegment` through `db.system`. Each is one fixed statement keyed by the session user id, and the value is checked against the three ids or null.
2. Route: GET returns `{ segment }`. PUT validates the body, calls `await takeRateLimit("tailoring", userId)` and saves.
3. `segment-card.tsx`: a radio group with a legend, a Save button, and "Change" once saved. Declare types locally. After saving, it shows one tip with a link to `/app/resume`:
   - fresher: add projects, internships and education as facts; you can type them by hand;
   - experienced: upload your resume, confirm it, then tailor;
   - switcher: confirm your transferable skills; lines are reworded and experience is never invented.
4. Render it above `HomeView` in `app/app/page.tsx`. No redirect.

**Tests** (`tests/profile.test.mjs`): set, get and clear work; an invalid value is refused; A's write leaves B unchanged; SQL-shaped input is stored nowhere.

**Done when:** `node --test tests/profile.test.mjs tests/db-structure.test.mjs` and typecheck pass.

**Harness impact:** home gains a card above the steps. Any e2e selector that takes the first heading, radio or button on `/app` may need narrowing in the test wave.

## P2-4 PWA manifest and icons (ADR 0011)

**Goal:** the app can be installed to a phone home screen. No service worker.

**Steps**
1. `manifest.ts`: name and short name "Rolewright", `start_url: "/app"`, `scope: "/"`, `display: "standalone"`, background and theme colours from `globals.css`, and icons `/icons/192` and `/icons/512` (PNG, purpose `any`) plus `/icons/512` again as `maskable`.
2. Icon route: `ImageResponse` from `next/og`, which ships with Next (no new dependency, no binary files). It draws a brand-colour square with an "R". Sizes 192 and 512 only; anything else returns 404. Long `Cache-Control`.
3. `layout.tsx`: add `themeColor` to `viewport` and `appleWebApp: { title: "Rolewright" }` to `metadata`.

**Tests** (`tests/manifest.test.mjs`): the manifest has the fields above, and no file under `src/` contains `serviceWorker`.

**Done when:** the test and typecheck pass. Check that the middleware or proxy lets `/manifest.webmanifest` and `/icons/*` through signed out, and that CSP allows them.

**Harness impact:** none. `next/og` under the production build is proven only in the test wave.

## P2-5 Notice update; events in the export (ADR 0004, 0010)

**Goal:** the notice says what Phase 2 stores, and the export includes events.

**Steps**
1. Add to `en.app.privacy.stored`:
   - "A short record of a few things you do: uploading a resume, making a tailored resume, exporting a PDF, or an export being stopped by the fact check. Each has the time, the AI provider used and, for an export, the keyword-match percentages. It never holds resume text, job descriptions or anything you typed."
   - "Which description you picked for yourself (first job, experienced, or changing field), if you picked one."
2. Add an `exportLine` key and render it in `privacy-notice.tsx`: "You can download a copy of what we store as one file from the privacy screen. Rate-limit records are not in the file."
3. Bump `NOTICE_VERSION` to `2026-11-21.1` and update the lock.
4. Add `events: await listEvents(...)` to `exportUserData`, with a test.

**Done when:** `node --test tests/notice.test.mjs tests/notice-lock.test.mjs tests/export-data.test.mjs` and typecheck pass.

**Harness impact:** any hard-coded notice version or notice sentence in the harness.

## Additions to the combined test wave

- **`test:flow`**
  - After upload, tailoring, a blocked export and a good export, `POST /api/account/export` returns the four events with allowed properties only, and the file holds no other user's marker text.
  - `PUT /api/profile` round-trips; an invalid value gets 400.
  - A cross-site POST to the export route gets 403.
- **e2e step 6 (360 px):** the home segment card (unset and saved) and the privacy screen with the export card. No sideways scroll; check target sizes.
- **e2e:** axe and keyboard checks pass on both new cards; the download event fires for the data export.
- **`test:prod`:**
  - `/manifest.webmanifest` returns 200 signed out with the right content type.
  - `/icons/192` and `/icons/512` return PNGs; `/icons/7` returns 404.
  - The page head has the manifest link, and the strict CSP reports no violation.
- **Postgres in non-owner mode:**
  - `events.test.mjs`, `export-data.test.mjs` and `profile.test.mjs` run with nothing skipped.
  - `npm run events:report` reads across users as the login role.
- **Schema:** running `db:migrate` twice is idempotent with the P2 blocks.
- **Notice:** the lock matches `2026-11-21.1`, and harness consent steps use the live version.
- **Owner gate (manual):** install from staging on an Android phone and confirm it opens at `/app`.
