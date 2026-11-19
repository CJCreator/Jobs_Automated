# Phase 0 briefs (advisor revision)

Written by the advisor in Phase 0 step 0 (ADR 0017). This supersedes the Phase 0 draft in `EXECUTION.md`. Each worker reads only the brief for its task plus the 'Common to every brief' list.

Repo root is /home/user/Jobs_Automated. Paths in the briefs are repo-relative because workers run in worktrees; `src/...` and `tests/...` mean `apps/web/src/...` and `apps/web/tests/...`.

What I ran: both gate layers against the bypass strings and the existing honest fixture (node, no files written). I did not run the test suites, e2e, or anything against Postgres.

## 1. CORRECTIONS

1. **P0-1 is split into P0-1a (app gate) and P0-1b (engine gate).** The two layers fail on different strings, so "written first and seen failing" only holds per layer. Probe results, using the test SOURCE plus one bullet "- Managed vendor contracts":

   | String | App strict layer | Engine alone | Combined |
   |---|---|---|---|
   | "Managed Global vendor contracts" | pass | pass | pass |
   | "Led a Certified Expert vendor programme" | pass | pass | pass |
   | "Managed vendor contracts at Acme Corp" | block (Acme, Corp) | pass | block |
   | "Managed vendor contracts for 14M evaluations per month" | block (14M) | pass | block |

   The Acme and 14M strings are engine-only bypasses. The suites are also disjoint, and the engine carries the 28-failure baseline.

2. **P0-1's cause is wider than "OPENERS and capitalised-clause skips".** `nameShaped()` (`src/lib/claims.mjs:284-288`) ignores every lower-case word, so these all pass both layers today:
   - "Managed global vendor contracts"
   - "Certified expert in vendor management"
   - "Expert in SQL and Power BI"
   - "Senior Principal analyst managing vendor contracts"
   - "Global lead for month-end close"
   - "Chartered accountant who reduced month-end close time by 30%"
   - "certified chartered accountant managing vendor contracts"
   - "Head of Finance who managed vendor contracts"
   - "Owned the entire finance function"
   - "Led regional and international vendor contracts"

   The fix needs a case-insensitive claim-word list, plus removing claim words from OPENERS (`claims.mjs:209`, `:214`, `:229`). The list is constrained by the fixture: all 116 HONEST lines (`tests/claims.test.mjs:177-294`) pass strict+engine today, and they contain "lead", "specialist" and "qualified", so those cannot be on it.

3. **P0-1's export UI scope is reduced.** Export already returns per-issue `sid`/`ref` (`src/lib/server/views.ts:25-27`, export route `:26-32`) and the UI lists the messages (`src/components/review-view.tsx:213-226`). Missing: the failing line's text, and a link to the card.

4. **"Forbidden-phrase checks without `config/cv-facts.json`" is redefined.** The engine's forbidden list is purely user config (`packages/engine/verify-cv-facts.mjs:2433`), and the app passes no config (`src/lib/server/engine.mjs:81`), so there is nothing to run. P0-1b instead adds a built-in must-be-sourced word check that runs with no config. `forbidden_phrases` and `configMissing` semantics stay, because `packages/engine/tests/fact-gate-missing-config.test.mjs` asserts them.

5. **P0-3's file list was wrong, and it is split into P0-3a (Sonnet) and P0-3b (Haiku).**
   - `src/proxy.ts` is CSP only (`:23-47`); the auth gate is `src/app/app/layout.tsx:14-15`. Neither needs editing for a public `/privacy`.
   - Missing from the list: `src/app/sign-in/page.tsx`.
   - `/app/privacy` must stay: it hosts `DeleteAccount` (`src/app/app/privacy/page.tsx:60`), and prod-smoke step 13 clicks it (`tests/integration/prod-smoke.mjs:388-389`).

6. **The en.ts rule ("only P0-3 and P0-4 edit existing keys") is false.** Existing strings that become untrue:
   - Key storage after P0-5: `en.ts:39`, `:102`, `:116-118`, `:127`, `:321`, `:329`.
   - Re-upload after P0-10: `:137`.
   - Consent label names only the resume (P2-18): `:139-140`.
   - Retention: `:327`.

   New rule: code tasks append only; P0-3b is the single existing-key editor, in Wave C.

7. **P0-2 and P0-4 were both in Wave C and collide on `src/lib/db/repo.mjs`.** Token deletion belongs in `deleteUserData` (`:370`) and `purgeInactiveUsers` (`:358`). P0-4 moves to Wave B and no longer touches en.ts (P0-3b owns the retention line), so its dependency on P0-3 is gone. P0-2 puts its queries in a new `src/lib/db/consents.mjs`.

8. **P0-9b is merged into P0-10, and "P0-10 after P0-1" is dropped.**
   - Both need the same "is this fact in the upload text" check, in the same place: `src/app/api/resume/route.ts:63-76`. That file was missing from P0-10's list.
   - `normalizeFacts` drops unknown keys and `src()` only knows two values (`src/lib/facts.mjs:26`), so `facts.mjs`, `src/lib/client/types.ts` and `src/lib/server/facts-edit.mjs` are also touched. `PUT /api/facts` trusts the client copy.
   - Nothing in P0-10 depends on P0-1.
   - Extra finding: re-upload issues new ids for everything, which orphans existing suggestion refs (`bullet:<eid>:<bid>`). The merged task carries ids over for unchanged lines.

9. **P0-5: `test:flow` is HTTP only** (`tests/integration/run.mjs` has no browser), so the storage assertion must live in `tests/e2e/run.mjs`.
   - e2e reloads at `:436`, `:469`, `:587` and uses `page.goto`, all of which drop an in-memory key. P0-5 owns the e2e rewrite.
   - New requirement: sign-out is a server action with a soft navigation, so a module-level key would survive into the next user's session on the same tab. The key must be cleared on sign-out and account deletion.

10. **New work: the browser launcher.** `launchBrowser` ignores `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` in `prod-smoke.mjs:97-113` and `e2e/run.mjs:129-145`. The Phase 0 exit demands `test:prod` pass, and it is 12 of 13 today. The fix is folded into P0-9a (prod-smoke) and P0-5 (e2e).

11. **P0-7 file list and semantics.**
    - Missing files: `src/auth.ts` (`:28-29` devLogin, `:153` fallback secret) and `src/lib/llm/providers.mjs:33` (mock keyed to `NODE_ENV`).
    - `unsafeEnvProblems` returns early at `env-guard.mjs:31`, which would shadow a deployed check.
    - prod-smoke runs `NODE_ENV=production` with `DATABASE_URL` deleted (`:59-66`). So the database requirement keys on `K_SERVICE` / `ROLEWRIGHT_DEPLOYED`, never on `NODE_ENV`. A non-deployed production run without `DATABASE_URL` logs one loud warning instead of falling back silently.

12. **P0-6: the route is not touched.** `PdfTextError` is already mapped by `src/lib/server/http.ts:41-43`. The existing caps (`pdf-text.mjs:15-16`) are checked only after a whole page's `getTextContent` (`:43-47`). There is no bomb fixture in the repo; the brief says how to build one in the test.

13. **P0-8: no workflow covers `apps/web`.** `web-ci.yml` targets `packages/engine/web` (`:10`, `:27`). A new `.github/workflows/app-ci.yml` is briefed. The "skipped negative control" is the row-lock test at `tests/db.test.mjs:300`. An RLS negative control already exists at `:161`, but there is no per-table update/delete coverage.

14. **New task P0-11 (Sonnet): e2e sweep and baseline.** `test:e2e` is added to the Phase 0 exit. It has no recorded baseline in `docs/reviews/test-baseline.md`, and it is the only browser-level proof of the storage, consent and notice work.

15. **Shared-file ownership per wave** (the draft's Touches hid these):
    - `README.md`: P0-7 (A), P0-4 (B), P0-3b (C), P0-8 (D).
    - `tests/integration/run.mjs`: P0-10 (B), P0-2 (C).
    - `tests/integration/prod-smoke.mjs`: P0-9a (C) only.
    - `tests/e2e/run.mjs`: P0-5 (A), P0-11 (D).
    - `src/lib/client/types.ts`: P0-1a (A), P0-10 (B).

16. **Worker models.** All Sonnet except P0-3b (copy and docs) and P0-9a (one header plus test-harness config). P0-11 is Sonnet because it holds the key-storage security assertion.

Coverage against the launch review:

| Review item | Task |
|---|---|
| P0-1 | P0-1a, P0-1b |
| P0-2 | P0-4, P0-3b |
| P0-3 | P0-2 |
| P0-4 | P0-3a |
| P0-5 | P0-3a, P0-3b |
| P1-6 | P0-6 |
| P1-7 | P0-7 |
| P1-8 | P0-10 |
| P1-12 | P0-7 |
| P1-13 | P0-8 |
| P2-14 | P0-5 |
| P2-15 | P0-9a |
| P2-16 | P0-10 |
| P2-17 | P0-4 |
| P2-18 | P0-2, P0-3b |

Nothing is missing.

## 2. WAVES

```
Wave A  P0-1a  P0-5   P0-6   P0-7
Wave B  P0-1b (after P0-1a)   P0-3a   P0-4   P0-10
Wave C  P0-2 (after P0-3a, P0-10)   P0-3b (after P0-3a, P0-4, P0-5, P0-10)   P0-9a (after P0-3a, P0-4, P0-7)
Wave D  P0-8 (after P0-2, P0-4)   P0-11 (after all)
Exit    advisor phase review -> owner gate
```

| ID | Worker | Task |
|---|---|---|
| P0-1a | Sonnet | App fact gate: claim words, block and explain |
| P0-1b | Sonnet | Engine gate: trailing employer, magnitude counts, built-in sourced-word check |
| P0-2 | Sonnet | Consent record |
| P0-3a | Sonnet | Public privacy route, grievance config, `NOTICE_VERSION` |
| P0-3b | Haiku | Copy pass: the only editor of existing en.ts keys |
| P0-4 | Sonnet | Purge endpoint with Google OIDC; token deletion |
| P0-5 | Sonnet | Session-only key |
| P0-6 | Sonnet | PDF expansion cap |
| P0-7 | Sonnet | Deployed-environment safety switches |
| P0-8 | Sonnet | Isolation on real Postgres, new CI workflow |
| P0-9a | Haiku | HSTS, prod-smoke browser launcher, two smoke assertions |
| P0-10 | Sonnet | Extracted facts checked against the upload; re-upload keeps confirmations (was P0-9b) |
| P0-11 | Sonnet | e2e sweep and baseline |

Phase 0 exit adds: `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome npm run test:e2e` and `test:prod` 13 of 13 with the same variable.

## 3. BRIEFS

Common to every brief:
- **Must not touch:** anything not listed; ask the orchestrator if more is needed.
- **en.ts:** append new keys under a `// P0-x` comment; never edit or delete an existing key (P0-3b excepted).
- **No new dependencies.**
- **Report:** files changed, tests added, each command run with pass/fail counts, anything left undone.
- **Baseline for `npm test`:** 204 pass, 0 fail, 1 skipped, 1 todo.

```
Task: P0-1a App fact gate: claim words, block and explain
Worker: Sonnet
Goal: A changed line that adds a credential, seniority, scope or expertise word the confirmed facts do not
  contain is blocked in any letter case, and a refused export names each failing line and its words.
ADRs: 0005
Touches (only these):
  apps/web/src/lib/claims.mjs
  apps/web/src/lib/tailoring.mjs
  apps/web/src/lib/server/views.ts
  apps/web/src/app/api/tailorings/[id]/export/route.ts
  apps/web/src/components/review-view.tsx
  apps/web/src/lib/client/types.ts
  apps/web/src/i18n/en.ts (append)
  apps/web/tests/fixtures/honest-lines.mjs (new)
  apps/web/tests/claims-bypass.test.mjs (new)
  apps/web/tests/claims.test.mjs
  apps/web/tests/tailoring.test.mjs
  apps/web/tests/engine-gate.test.mjs
Inputs: docs/reviews/rolewright-launch-review.md P0-1. Reproduce from apps/web: CAREER_OPS_ROOT=/nonexistent
  node, import checkText and the engine's verifyFactsFromText, and check each string below against SOURCE_V
  (the SOURCE in tests/claims.test.mjs with one more Infosys bullet "- Managed vendor contracts").
  All of them return verdict "pass" from checkText with engineGate today.
Steps:
 1. Move SOURCE and HONEST out of tests/claims.test.mjs into tests/fixtures/honest-lines.mjs (export SOURCE,
    SOURCE_V, HONEST) and import them back. No HONEST line may be edited or removed (116 lines).
 2. Write tests/claims-bypass.test.mjs first and see it fail.
    MUST BLOCK, with an issue whose value is the word shown:
      "Managed Global vendor contracts"                                -> Global
      "Led a Certified Expert vendor programme"                        -> Certified, Expert
      "Managed global vendor contracts"                                -> global
      "Certified expert in vendor management"                          -> certified, expert
      "Expert in SQL and Power BI"                                     -> Expert
      "Senior Principal analyst managing vendor contracts"             -> Principal
      "Global lead for month-end close"                                -> Global
      "Chartered accountant who reduced month-end close time by 30%"   -> Chartered
      "certified chartered accountant managing vendor contracts"       -> certified, chartered
      "Head of Finance who managed vendor contracts"                   -> Head of
      "Owned the entire finance function"                              -> entire
      "Led regional and international vendor contracts"                -> regional, international
      "Promoted to finance manager at Infosys"                         -> manager
    GUARD tests (already blocked by the strict layer; they must stay blocked; engine-alone is P0-1b):
      "Managed vendor contracts at Acme Corp"                          -> Acme
      "Managed vendor contracts for 14M evaluations per month"         -> 14M
    MUST PASS:
      every HONEST line against SOURCE, strict layer alone
      every HONEST line with the engine gate (as in engine-gate.test.mjs)
    MUST PASS with these additions to the facts:
      facts add "- Managed Global vendor contracts":
        "Oversaw global vendor contracts"; "Managed vendor contracts globally"
      facts add an extra "Certified Scrum Master":
        "Certified Scrum Master managing vendor contracts"; "Scrum Master certification"
      plain SOURCE:
        "Senior analyst who managed a team of 4 analysts"
      facts add an extra "Expert":
        "Expert in SQL and Power BI"
 3. In claims.mjs add the claim-word check. Whole word, case-insensitive, after cleanText, anywhere in the
    line. A word is supported when any form in its family is in factTokenSet(sourceText).
    Issue kinds: "credential", "seniority", "scope", "expertise". value = the word as written.
    Message pattern: `"X" is not in your confirmed facts.`
    Minimum families (one per line; forms within a line support each other):
      credential:
        certified / certification(s) / certificate(s)
        chartered
        licensed / licenced
        accredited / accreditation
        award(s) / awarded
        patent(s) / patented
        medalist / medallist
        topper
        scholarship(s)
        fellowship(s)
        mba
        phd / doctorate
        diploma
        postgraduate
      seniority:
        senior / sr
        principal
        director(s)
        "head of"
        chief
        ceo, cfo, cto, coo, cio, cmo (each its own family)
        vp / "vice president"
        president
        manager(s)
        executive(s)
        founder / cofounder
      scope:
        global / globally
        worldwide
        international / internationally
        multinational
        national / nationally / nationwide
        regional / regionally
        enterprise
        entire
        sole / solely
        "single-handedly"
      expertise:
        expert(s)
        guru
        veteran
        "world-class"
        "thought leader"
        "best-in-class"
        "industry-leading"
        "top-performing"
    Do NOT add (HONEST depends on them): lead, specialist, qualified, graduate, expertise, mastery,
    proficiency, experienced, seasoned, end-to-end, cross-functional, whole, hands-on, ownership, oversight,
    governance, stewardship.
 4. Remove from OPENERS: certified, expert, experts, global, regional, national, international, senior,
    junior, principal. Update the header comment's "Known gaps" to say what is and is not covered.
 5. KNOWN_GAPS in claims.test.mjs stays as is (lower-case tools, vague multipliers). Rewrite the "caught only
    because it is capitalised" test and its comment (claims.test.mjs:171-175). Turn the todo test in
    engine-gate.test.mjs:90 into a real passing test.
 6. tailoring.mjs exportBlockers: add `text` (the exact exported line) to each blocker.
    views.ts flattenBlockers: add `line: text` to each issue.
    types.ts: CheckIssue gains optional sid, ref, line.
    Keep the existing `issues` array and the 409 code "blocked" unchanged (prod-smoke step 7 and test:flow
    read them).
 7. review-view.tsx: in the export-stopped notice, group issues by sid. For each line show the line text, the
    offending words, and a control that scrolls to and focuses the card `sug-<sid>` (the card already offers
    edit, "This is true, add it to my facts" and "I can't confirm this"). New strings appended to en.ts.
    Do not rename existing ids, roles or strings.
 8. tailoring.test.mjs: add a test that attesting "Expert" on a blocked suggestion adds the fact and unblocks
    it, and a test that exportBlockers returns `text`.
Done when:
  - every MUST BLOCK case fails before step 3 and passes after; all MUST PASS cases pass
  - cd apps/web && npm run typecheck && npm test && npm run test:flow && npm run build
  - npm test shows 0 fail and the todo count drops to 0
Report: add the final word list, and any HONEST line that needed a list change.
```

```
Task: P0-1b Engine fact gate: trailing employer, magnitude counts, built-in sourced-word check
Worker: Sonnet
Goal: packages/engine/verify-cv-facts.mjs alone blocks the reproduced bypasses, with no config file.
ADRs: 0005
Touches (only these):
  packages/engine/verify-cv-facts.mjs
  packages/engine/tests/verify-cv-facts-launch-bypasses.test.mjs (new)
  apps/web/tests/engine-bypass.test.mjs (new)
Inputs: docs/reviews/claims-audit.md row "Zero-fabrication"; the merged P0-1a word list in
  apps/web/src/lib/claims.mjs; apps/web/tests/fixtures/honest-lines.mjs (SOURCE, SOURCE_V, HONEST).
  Reproduce: verifyFactsFromText(text, { sourceText: SOURCE_V }) returns verdict "pass" for all four strings
  in step 1.
Steps:
 1. Write the engine test first and see it fail. With { sourceText: SOURCE_V } and no config:
      "Managed vendor contracts at Acme Corp"
          -> block; unsupportedFacts has kind "employer", value "acme corp"
      "Managed vendor contracts for 14M evaluations per month"
          -> block; invented names 14m
      "Processed 14M evaluations per month"
          -> block; invented names 14m
      "Managed Global vendor contracts"
          -> block; unsupportedFacts names global
      "Led a Certified Expert vendor programme"
          -> block; names certified and expert
    Must not block:
      every HONEST line against SOURCE
      "Senior Analyst at Infosys who reduced month-end close time by 30%"
      "Processed 14M evaluations per month" when the source says "Processed 14M evaluations per month"
      "Managed vendor contracts at Acme Corp" when the source has "### Acme Corp"
 2. Employer: read "<past work verb> ... at <Capitalised Name>" in a bullet or sentence as an employer claim
    (today only "At X, I ..." is read: AT_EMPLOYER_RE, :1003).
    tests/verify-cv-facts-at-employer.test.mjs must stay green, including its cover-letter cases about the
    target company.
 3. Counts: a number with a magnitude (k/M/B/thousand/million/billion) followed by a noun is a claim even when
    the noun is not in METRIC_NOUNS (:128). Compare it with the source under the same normalisation.
 4. Built-in sourced words: mirror the P0-1a families in a constant. A listed word absent from the source
    goes into unsupportedFacts (kind "credential" | "seniority" | "scope" | "expertise"). It runs whether or
    not a config is loaded. Do not change forbidden_phrases, warn_phrases or configMissing behaviour. Add a
    comment in the constant naming apps/web/src/lib/claims.mjs as the twin list.
 5. Add matching cases to runSelfTest().
 6. apps/web/tests/engine-bypass.test.mjs: through checkText with the real engine gate, the five strings
    block and all HONEST lines still pass.
Done when:
  - cd packages/engine && node verify-cv-facts.mjs --self-test                       (exit 0)
  - node --test tests/verify-cv-facts-*.test.mjs tests/fact-gate-*.test.mjs tests/nonmetric-fact-gate.test.mjs tests/cover-fact-gate.test.mjs
  - node test-all.mjs --quick: no failing test name that is not on the list in docs/reviews/test-baseline.md
    (baseline 19,509 pass / 28 fail; compare names, not only counts)
  - cd apps/web && npm test && npm run test:flow
Report: add the before/after failure names from test-all.
```

```
Task: P0-2 Consent record
Worker: Sonnet
Goal: The server stores who agreed to which notice version and when, and refuses to send resume or job text
  to an AI provider without it.
ADRs: 0004
Touches (only these):
  apps/web/src/lib/db/schema.mjs
  apps/web/src/lib/db/consents.mjs (new)
  apps/web/src/lib/server/consent.ts (new)
  apps/web/src/app/api/consent/route.ts (new)
  apps/web/src/app/api/resume/route.ts
  apps/web/src/app/api/tailorings/route.ts
  apps/web/src/components/resume-view.tsx
  apps/web/src/components/tailor-form.tsx
  apps/web/src/i18n/en.ts (append)
  apps/web/tests/consent.test.mjs (new)
  apps/web/tests/integration/run.mjs
Must not touch: also not repo.mjs and not tests/db.test.mjs (P0-8 owns it next wave).
Inputs: launch review P0-3 and P2-18; NOTICE_VERSION from apps/web/src/lib/notice.mjs (P0-3a). Today consent
  is only React state (resume-view.tsx:29, :95-98) and the route never reads it (resume/route.ts:29-77).
Steps:
 1. Tests first (tests/consent.test.mjs, PGlite):
      - record and read back
      - recording twice is idempotent
      - user B inside withUser cannot SELECT A's consent
      - B cannot INSERT a row with A's user_id
      - the app role cannot UPDATE or DELETE a consent
      - deleting the user removes the row
 2. Schema: table consents
      id uuid PRIMARY KEY
      user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE
      notice_version text NOT NULL
      purpose text NOT NULL
      accepted_at timestamptz NOT NULL DEFAULT now()
      UNIQUE (user_id, notice_version, purpose)
    ENABLE and FORCE row-level security; policy consents_isolation the same shape as the others;
    GRANT SELECT, INSERT only to rolewright_app.
 3. consents.mjs (through db.withUser): recordConsent(db, userId, { noticeVersion, purpose }) and
    hasConsent(db, userId, { noticeVersion, purpose }). Purpose constant: "ai_processing".
 4. /api/consent:
      GET  -> { noticeVersion, accepted }
      POST { noticeVersion } -> 400 "stale_notice" when it is not the current version; otherwise record and
           return { accepted: true }
    Both use route() and requireUser.
 5. consent.ts requireConsent(userId) -> HttpError 403 "consent_required" with a plain message. Call it in
    resume upload and tailorings POST, after readLlmHeaders and input validation, before any AI call or
    database write.
 6. UI:
      - resume-view keeps the checkbox with id "resume-consent" on every upload; when ticked it POSTs the
        consent and then uploads.
      - tailor-form GETs /api/consent and shows the same checkbox (id "tailor-consent") only when not
        accepted.
      - New label (append; stop using en.app.resume.consent): says the resume text AND the job description
        are sent to the named AI provider, which may process them outside India, and links to /privacy.
 7. integration/run.mjs:
      - before the first upload: upload answers 403 consent_required
      - POST with a wrong version answers 400
      - POST with the right version answers 200, then the upload works
      - user B consents before its upload or tailoring
      - tailoring POST without consent answers 403
      - add "consents" to the table lists at :557 and :574
Done when:
  - cd apps/web && npm run typecheck && npm test && npm run test:flow && npm run build
  - test:flow shows the 403 before consent and the stored row after
```

```
Task: P0-3a Public privacy notice route, grievance contact from config, notice version
Worker: Sonnet
Goal: A signed-out visitor can read the privacy notice at /privacy from the landing and sign-in pages, and
  it shows the grievance contact from config.
ADRs: 0004
Touches (only these):
  apps/web/src/app/privacy/page.tsx (new)
  apps/web/src/components/privacy-notice.tsx (new)
  apps/web/src/app/app/privacy/page.tsx
  apps/web/src/app/page.tsx
  apps/web/src/app/sign-in/page.tsx
  apps/web/src/lib/notice.mjs (new)
  apps/web/src/i18n/en.ts (append)
  apps/web/tests/notice.test.mjs (new)
Must not touch: also not src/proxy.ts, not src/app/app/layout.tsx, not README.md (P0-3b), not prod-smoke.mjs
  (P0-9a).
Inputs: launch review P0-4, P0-5. The only notice today is under the signed-in layout
  (src/app/app/layout.tsx:14-15), and neither src/app/page.tsx nor src/app/sign-in/page.tsx links to it.
Steps:
 1. notice.mjs: export NOTICE_VERSION = "2026-11-19.1", and grievanceContact(env) -> { name, email, set }
    reading ROLEWRIGHT_GRIEVANCE_NAME and ROLEWRIGHT_GRIEVANCE_EMAIL (trimmed; set is true only when both are
    present and the email is well formed).
    Tests first in notice.test.mjs: unset, blank, name only, bad email, both set.
 2. privacy-notice.tsx: server component with the sections now in src/app/app/privacy/page.tsx:18-58, plus a
    "Who to contact" section.
      - when set: the name and a mailto link
      - when not set: a visible marker with data-testid="grievance-unset" reading "Grievance contact: not yet
        set", in every environment
    Show NOTICE_VERSION on the page. It must not import "@/auth".
 3. /privacy: public page with a header (product name linking to "/"), the notice, and a link to sign in.
    /app/privacy renders the same component and keeps DeleteAccount.
 4. Links to /privacy: the landing footer and beside the landing sign-in button; on /sign-in above the
    sign-in card ("Read the privacy notice before you sign in").
 5. Leave existing privacy strings as they are; P0-3b rewrites them.
Done when:
  - cd apps/web && npm run typecheck && npm test && npm run build
  - ROLEWRIGHT_DEV_LOGIN=1 npm run dev, then with no cookie:
      curl -s -o /dev/null -w "%{http_code}" localhost:3100/privacy            -> 200
      curl -s localhost:3100/privacy | grep grievance-unset                     -> match
      curl -s localhost:3100/ | grep 'href="/privacy"'                          -> match
      curl -s localhost:3100/sign-in | grep 'href="/privacy"'                   -> match
    and with both variables set, the name appears and the marker is gone
  - npm run test:flow still passes
```

```
Task: P0-3b Copy pass: make every existing string match the code
Worker: Haiku
Goal: No user-facing sentence says something the code no longer does.
ADRs: 0003, 0004
Touches (only these):
  apps/web/src/i18n/en.ts (existing keys)
  apps/web/src/lib/notice.mjs (NOTICE_VERSION only)
  apps/web/README.md (environment table rows only)
Must not touch: also no component, no test file.
Inputs: merged P0-5, P0-3a, P0-4, P0-10. Plain English, no marketing words, no dashes.
Steps (set these keys):
 1. landing.howKey:
    "You pay your AI provider directly. Your key is kept only in this tab's memory for your visit. It is not
    saved in your browser or on our server, so you enter it again when you come back. It is sent to our server
    with each AI request so the server can call your provider for you, and the server does not save or log it.
    Google offers a free Gemini key to start with."
 2. landing.promise:
    "Every figure, name, qualification and claim of seniority or reach in a suggestion is checked against
    facts you confirmed yourself. A line that fails the check cannot be exported. You still read and approve
    each change."
 3. app.key:
      intro         same content as item 1, without the Gemini sentence
      saveButton    "Use this key for this visit"
      saved         "Key ready. It stays in memory until you close or reload this tab."
      savedTitle    "Key in use"
      removedNote   "Key removed."
 4. app.resume.uploadHelp:
    "PDF only, up to 5 MB. Uploading again re-reads your resume. Facts you already confirmed stay confirmed
    when the new resume still says the same thing. Additional facts you added and the list of claims you can't
    confirm are kept."
 5. app.privacy:
      stored        add "Your email address, and your name and picture if you sign in with Google.",
                    "The date you last signed in." and
                    "A record of when you agreed to this notice, and which version."
      notStored[0]  "Your AI key. It is held in your browser tab's memory for the visit and sent with each AI
                    request. The server does not save or log it."
      sent          "To read your resume and suggest changes, the text of your resume, your confirmed lines
                    and the job description you paste are sent to the AI provider you chose. That provider
                    may process them outside India, under its own terms."
      retention     "If you do not sign in for 12 months, your account and all the data in it are deleted. A
                    scheduled job checks for this once a day."
      deleteBody    replace the last two sentences with "Your AI key is never saved, so there is nothing to
                    remove."
 6. Tidy the wording of the keys P0-3a appended, if needed.
 7. Set NOTICE_VERSION to "2026-11-19.2".
 8. README environment table: add rows for ROLEWRIGHT_GRIEVANCE_NAME and ROLEWRIGHT_GRIEVANCE_EMAIL.
Done when:
  - cd apps/web && npm run typecheck && npm test && npm run build
  - grep -n "stored only in\|Save in this browser\|in your browser, so remove" src/i18n/en.ts   -> no match
Report: add any sentence you could not make true, word for word.
```

```
Task: P0-4 Retention purge endpoint and token deletion
Worker: Sonnet
Goal: POST /api/internal/purge runs the 12-month purge only for Google's scheduler identity, and deleting or
  purging an account removes its email-link tokens.
ADRs: 0004, 0009
Touches (only these):
  apps/web/src/app/api/internal/purge/route.ts (new)
  apps/web/src/lib/server/oidc.mjs (new)
  apps/web/src/lib/server/purge-endpoint.mjs (new)
  apps/web/src/lib/db/repo.mjs
  apps/web/tests/oidc.test.mjs (new)
  apps/web/tests/purge-endpoint.test.mjs (new)
  apps/web/tests/purge.test.mjs
  apps/web/README.md (section "Deleting inactive accounts" and the environment table)
Must not touch: also not en.ts, not package.json, not scripts/purge-inactive.mjs (it keeps working).
Inputs: launch review P0-2, P2-17. Nothing schedules the purge (repo.mjs:354 says so). deleteUserData
  (repo.mjs:370) and purgeInactiveUsers (:358) leave rows in verification_tokens, which is keyed by email.
Steps:
 1. Tests first.
    oidc.test.mjs: generate an RSA key pair with node:crypto, sign tokens by hand, inject the key set.
      - a valid token passes
      - 401 for each of: no token; malformed; alg "none"; alg HS256; unknown kid; bad signature; expired;
        issued in the future beyond 60 s; wrong aud; wrong iss; wrong email; email_verified false
    purge-endpoint.test.mjs: handler with injected verifier and database.
      - unconfigured env -> 401, nothing deleted
      - valid token -> a seeded user idle 13 months is deleted, an 11-month one is kept, response
        { purged: 1 }
    purge.test.mjs:
      - after purge, and after deleteUserData, no verification_tokens row has that user's email
      - another user's tokens remain
      - expired tokens are removed by the purge
 2. oidc.mjs: verifyGoogleOidc(token, { audience, email, getKeys, now }).
      - node:crypto only: createPublicKey({ key: jwk, format: "jwk" }), RS256 only
      - iss must be "https://accounts.google.com" or "accounts.google.com"
      - default getKeys fetches https://www.googleapis.com/oauth2/v3/certs and caches it for the response's
        max-age
 3. purge-endpoint.mjs: handlePurge(req, { env, db, verify }).
      - reads the Authorization bearer token, ROLEWRIGHT_PURGE_AUDIENCE and ROLEWRIGHT_PURGE_SERVICE_ACCOUNT
      - fails closed with 401 when either variable is unset
      - every failure is 401 with one generic message
      - on success calls purgeInactiveUsers(db, { months: 12 }) and returns the count only
 4. route.ts: runtime "nodejs", wrapped in route("internal.purge", ...). No session. Logs carry no token and
    no email.
 5. repo.mjs: delete the user's tokens in the same statement as the user (a data-modifying CTE), in both
    functions. The purge also deletes tokens past their expiry.
 6. README: replace the cron instructions with the endpoint, the two variables, and the Cloud Scheduler OIDC
    settings (audience = the service URL). Keep `npm run purge:inactive` documented as the fallback.
Done when:
  - cd apps/web && npm run typecheck && npm test && npm run test:flow && npm run build
  - the 401 cases and the seeded purge pass offline (no network in tests)
```

```
Task: P0-5 Session-only AI key
Worker: Sonnet
Goal: The key lives only in page memory, is never written to any browser storage, and is cleared on reload,
  sign-out and account deletion.
ADRs: 0003
Touches (only these):
  apps/web/src/lib/client/llm-key.ts
  apps/web/src/components/app-header.tsx
  apps/web/src/components/delete-account.tsx
  apps/web/src/proxy.ts (comment at :3-9 only)
  apps/web/tests/e2e/run.mjs
Must not touch: also not en.ts (P0-3b fixes the copy), not key-view.tsx (keep the exported function names and
  return types so callers do not change).
Inputs: ADR 0003; launch review P2-14. llm-key.ts:36, :60, :70 use localStorage.
  The browser: PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome.
  launchBrowser (e2e/run.mjs:129-145) ignores that variable.
Steps:
 1. e2e/run.mjs: make launchBrowser use PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH when it is set. Run test:e2e once
    unchanged and record the result (there is no baseline).
 2. Add e2e assertions first and see them fail.
    After the key is entered and used:
      - localStorage, sessionStorage, every IndexedDB database name, and document.cookie hold no MOCK_KEY and
        no "rolewright.llm"
    After page.reload():
      - the saved-key card is gone and the key form is shown
    After sign-out and sign-in as another user in the same tab without a reload:
      - no key is in use
 3. llm-key.ts:
      - a module-level value with the same exports (getLlmKey, setLlmKey returning true, clearLlmKey, maskKey,
        useLlmKey)
      - remove the storage listener
      - once on load, remove the legacy "rolewright.llm" item from localStorage inside try/catch
      - export bindLlmKeyOwner(email), which clears the key when the owner changes
 4. app-header.tsx: call bindLlmKeyOwner(email) in an effect; clear the key when the sign-out form inside it
    submits. delete-account.tsx: clear the key before signing out.
 5. Rework the e2e steps that reload or use page.goto after the key step (:436, :469, :587, the keyboard-only
    step, the 360-wide step) with a helper that re-enters the key.
Done when:
  - cd apps/web && npm run typecheck && npm test && npm run test:flow && npm run build
  - PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome npm run test:e2e
    passes, or fails only in steps you list as failing before your change
  - grep -rn "localStorage\|sessionStorage\|indexedDB" src   -> only the one-time legacy removal
Report: add the e2e result before and after.
```

```
Task: P0-6 PDF expansion cap  (merged; its fixture recipe is off-page and the cap does not bound CPU or decompressed size: see P0-6b)
Worker: Sonnet
Goal: A small PDF that expands to huge text is refused quickly with a 413, before the text is built in
  memory.
ADRs: 0004
Touches (only these):
  apps/web/src/lib/server/pdf-text.mjs
  apps/web/tests/pdf-text.test.mjs (new)
Must not touch: also not the upload route (PdfTextError is already mapped, src/lib/server/http.ts:41-43).
Inputs: launch review P1-6 (175 KB -> 60 MB of text, 4.9 s, 782 MB). Cause: pdf-text.mjs:43 awaits a whole
  page's getTextContent() before the caps at :46 are looked at.
  No fixture exists. Build one in the test: a one-page PDF whose content stream is FlateDecode of
  "BT /F1 12 Tf " + ("(" + "A".repeat(1000) + ") Tj\n").repeat(60000) + "ET", compressed with
  zlib.deflateSync, with a correct xref table and /Length. The file should come out well under 300 KB.
Steps:
 1. Test first; see the bomb case fail (slow, large).
      - the bomb is rejected with PdfTextError status 413, code "pdf_too_much_text", in under 2000 ms, with
        process.memoryUsage().rss growing by less than 200 MB
      - a hand-built one-page PDF with about 400 characters returns that text
      - a 31-page PDF still gives 413 "too_many_pages"
      - a 70,000-character PDF returns 60,000 characters with truncated true
 2. Read each page with page.streamTextContent() and a reader. Count characters as chunks arrive. When the
    running total passes MAX_PDF_EXPANDED_CHARS (export; default 200,000), cancel the reader, destroy the
    task and throw the 413 ("That PDF holds far more text than a resume. Upload only your resume pages.").
 3. Keep MAX_PDF_CHARS = 60,000 as the amount returned (truncated: true), and the page cap. Add a wall-clock
    budget option (default 15,000 ms) that gives 413 "pdf_too_complex".
 4. Keep the signature and return shape: tests/integration/run.mjs and prod-smoke.mjs call pdfText on
    exported PDFs.
Done when:
  - cd apps/web && npm run typecheck && npm test && npm run test:flow && npm run build
Report: add the measured time and memory for the bomb before and after.
```

```
Task: P0-6b Parse PDFs off the main thread with a hard deadline
Worker: Sonnet
Goal: No uploaded PDF can block the server's event loop or exceed the parse deadline. Parsing runs in a
  worker thread that the parent terminates at the deadline, returning 413 pdf_too_complex.
ADRs: 0004
Why: P0-6 caps extracted text, but pdf.js parses on the main thread in Node, so a PDF whose content yields
  no text items (off-page text, or a "q Q" operator stream) starves the event loop and the timer never
  fires. Advisor measurements on the P0-6 code: the original P0-6 recipe (165 KB, off-page) returns ok in
  ~6 s; a 496 KB variant returns only after 17 s at +280 MB; "q Q\n" x 15M (59 KB) returns ok after 5.5 s
  with a 500 ms budget. A zlib pre-scan is NOT a control (bypassed by /Filter [/ASCIIHexDecode /FlateDecode]).
  A worker_threads prototype terminated at ~1 s on both bombs with the main loop responsive (lag 5-118 ms);
  a normal PDF cost 180-215 ms.
Touches (only these):
  apps/web/src/lib/server/pdf-text.mjs
  apps/web/src/lib/server/pdf-text-worker.mjs (new)
  apps/web/tests/pdf-text.test.mjs
  apps/web/next.config.mjs (only if file tracing needs the worker file listed)
Steps:
 1. Tests first, seen failing on the current code:
    - the off-page recipe (tiny page, 12 pt text drawn off the page, about 165 KB) and the "q Q" stream each
      return 413 pdf_too_complex within budget + 500 ms;
    - a 20 ms setInterval on the main thread keeps ticking during both (max gap under 250 ms);
    - mid-read expiry: timeBudgetMs small, maxExpandedChars 1e9, a large text PDF -> 413 pdf_too_complex;
    - after every test, no worker thread is left alive.
 2. Move the existing streaming logic (including MAX_PDF_EXPANDED_CHARS, MAX_PDF_CHARS truncation, page
    cap) into pdf-text-worker.mjs. The parent spawns a Worker with resourceLimits (maxOldGenerationSizeMb
    about 256), enforces timeBudgetMs with worker.terminate(), and maps worker errors to the existing
    PdfTextError codes. Keep the exported signature and return shape.
 3. Default timeBudgetMs becomes 5,000 ms (PDF_TIME_BUDGET_MS).
 4. Create the timer only after setup succeeds, or put setup inside the try (P0-6 review finding 4).
 5. Prove the worker file resolves in the built app: pdf-text.mjs is bundled, so do not rely on
    import.meta.url self-spawn without checking `next build` output; reference the worker file by a path
    that survives the build (and list it for output file tracing if needed).
Done when:
  - the new tests pass and were seen failing first
  - apps/web: npm run typecheck && npm test && npm run build
  - PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=... npm run test:flow (its upload step parses a PDF in the dev server)
  - npm run test:prod upload step passes against the production build (step 13 may still fail until P0-9a)
Report: as in the common list, plus timings for a normal resume before and after.
```

```
Task: P0-6c PDF worker: memory watchdog, parse concurrency cap, server faults as 500
Worker: Sonnet
Goal: An uploaded PDF cannot push the process far past a fixed memory bound, at most two parses run at
  once per process, and a server-side worker failure is a logged 500, not a user-facing 422.
ADRs: 0004
Why (advisor's P0-6b review): resourceLimits bounds only the JS heap. A 2,407-byte PDF (1 GB of spaces,
  deflated twice) kept the worker heap near 20 MB while external (ArrayBuffer) memory reached 1,029 MB;
  RSS grew +0.8 to +2.1 GB for the full 5 s budget; four at once reached +1.8 GB. Separately, the pdf.js
  import now sits inside the worker's catch-all, so a missing module or a worker-start failure (reproduced
  with --input-type=module in execArgv) returns 422 "could not be read" for every PDF, with no log line.
Touches (only these):
  apps/web/src/lib/server/pdf-text.mjs
  apps/web/src/lib/server/pdf-text-worker.mjs
  apps/web/tests/pdf-text.test.mjs
Steps:
 1. Tests first, seen failing:
    - the double-deflated 1 GB-of-spaces PDF (build it in the test) returns 413 pdf_too_much_text, and the
      parent's external-memory reading at refusal is recorded; assert the refusal comes well before the
      5 s budget (target under 2 s);
    - a third concurrent parse waits (or is refused with 503 and Retry-After; pick one and justify) while
      two are running;
    - a worker start failure / non-OOM worker error rejects with a plain Error (not PdfTextError), so the
      route wrapper returns 500 internal and logs a cause label; the worker's own error text is never
      forwarded (pdf.js errors can quote file content);
    - fix the "mid-read expiry" test: budget about 400 ms (30 ms expires before pdf.js loads) and confirm
      pdf_too_complex.
 2. Worker: hoist `const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs")` to module top
    level, above the try.
 3. Parent: poll worker.getHeapStatistics() about every 100 ms (guard typeof === "function"; engines allow
    Node 22.13) and terminate with 413 pdf_too_much_text when external_memory passes a cap of about 256 MB
    (validate against the 30-page test). Expect overshoot between samples.
 4. Parent: a process-wide semaphore of 2 concurrent parses.
 5. Pass the bytes with transferList instead of copying them three times; drop the worker-side copy.
 6. Correct the comment that says the bundler copies the worker file (it bundles it into a
    [worker thread] chunk). Restore maxOldGenerationSizeMb 256 unless the 30-page test needs less; say why.
Done when:
  - new tests pass and were seen failing first
  - apps/web: npm run typecheck && npm test && npm run build
  - PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=... npm run test:flow
  - a production-build check (next start) that a valid PDF uploads and the memory bomb returns 413
Report: as in the common list, plus memory and timing for the bomb and a normal resume.
```

```
Task: P0-7 Deployed-environment safety switches
Worker: Sonnet
Goal: On a deployed host the app refuses the development sign-in, the mock AI, the fallback secret and the
  embedded database, whatever NODE_ENV says.
ADRs: 0004, 0006, 0009
Touches (only these):
  apps/web/src/lib/server/env-guard.mjs
  apps/web/src/lib/db/index.mjs
  apps/web/src/auth.ts
  apps/web/src/lib/llm/providers.mjs
  apps/web/src/instrumentation.ts (new)
  apps/web/tests/env-guard.test.mjs
  apps/web/tests/db-guard.test.mjs (new)
  apps/web/tests/llm.test.mjs (only if a mock-provider test needs the new rule)
  apps/web/README.md (environment table, and the paragraphs at :25 and :140)
Must not touch: also not tests/integration/prod-smoke.mjs.
Inputs: launch review P1-7, P1-12.
  - env-guard.mjs:31 returns no problems unless NODE_ENV=production.
  - auth.ts:28-29 and :153 key the dev sign-in and the fallback secret to NODE_ENV.
  - providers.mjs:33 keys the mock to NODE_ENV.
  - db/index.mjs:136-143 opens the embedded database whenever DATABASE_URL is unset.
  Reproduce: unsafeEnvProblems({ NODE_ENV: "development", K_SERVICE: "web", ROLEWRIGHT_DEV_LOGIN: "1" })
  returns [].
Steps:
 1. Tests first: a table over NODE_ENV {production, development, unset} x deployed {K_SERVICE set,
    ROLEWRIGHT_DEPLOYED=1, neither} x each flag.
      - deployed never comes from a request header
      - deployed -> problems for: ROLEWRIGHT_DEV_LOGIN=1; ROLEWRIGHT_ALLOW_MOCK_LLM=1; missing AUTH_SECRET;
        missing DATABASE_URL (new)
      - NODE_ENV=production, not deployed -> today's three problems; no DATABASE_URL problem (prod-smoke runs
        this way)
      - build phase (NEXT_PHASE) -> still skipped
      - only "1" turns ROLEWRIGHT_DEPLOYED on; any non-empty K_SERVICE counts
 2. env-guard.mjs: export isDeployed(env), strictEnv(env) (deployed or production) and
    devLoginEnabled(env). Restructure unsafeEnvProblems so the early return at :31 cannot skip the deployed
    case.
 3. db/index.mjs getDb():
      - with no DATABASE_URL and deployed: throw UnsafeEnvironmentError; never open PGlite
      - with no DATABASE_URL, NODE_ENV=production and not deployed: one console.warn naming the embedded
        database directory
    db-guard.test.mjs covers both without opening a database.
 4. auth.ts: devLogin = devLoginEnabled(process.env); the fallback secret only when not strictEnv.
    providers.mjs: the mock only when not strictEnv.
 5. instrumentation.ts: in register(), for the nodejs runtime, call assertSafeEnv(process.env) so the server
    fails at start. Keep the first-use checks (auth.ts:26, session.ts:22). Check by hand what `next start`
    does with K_SERVICE=x and no DATABASE_URL, and report it.
 6. README: document ROLEWRIGHT_DEPLOYED and K_SERVICE and the new rules.
Done when:
  - cd apps/web && npm run typecheck && npm test && npm run test:flow && npm run build
  - npm run test:prod: steps 1-12 pass (step 13 needs P0-9a)
  - hand check recorded: K_SERVICE=x ROLEWRIGHT_DEV_LOGIN=1 npm run dev refuses, and /sign-in shows no
    development form
```

```
Task: P0-8 Prove isolation and row locks on real Postgres
Worker: Sonnet
Goal: CI runs the database tests on Postgres 16 as a non-owner-privileged login, with nothing skipped.
ADRs: 0009
Touches (only these):
  .github/workflows/app-ci.yml (new)
  apps/web/tests/db.test.mjs
  apps/web/README.md (the "has not yet been run" notes at :118 and :138)
  apps/web/src/lib/db/schema.mjs (only to fix a defect the Postgres run finds; describe it in the report)
Must not touch: also not web-ci.yml (it belongs to packages/engine/web).
Inputs: launch review P1-13.
  - tests/db.test.mjs:1-11 documents ROLEWRIGHT_TEST_DATABASE_URL and ROLEWRIGHT_TEST_ADMIN_URL.
  - The row-lock negative control at :300 is skipped on PGlite.
  - Role set-up is in README "Database roles".
Steps:
 1. Tests first, all runnable on PGlite too.
      - for each of resumes, fact_bases, jobs, tailorings, consents: inside B's scope, SELECT, UPDATE and
        DELETE of A's row affect 0 rows, and INSERT with A's user_id is refused
      - a structural test: every table with a user_id column except accounts has row-level security enabled
        and forced and at least one policy (query pg_class and pg_policies), so a new table without it fails
      - rolewright_app has no privilege on users, accounts, verification_tokens
 2. When ROLEWRIGHT_REQUIRE_PG=1 and no Postgres URL is set, fail instead of skipping.
 3. app-ci.yml:
      - triggers: pull_request and push to main, on apps/web/** and the workflow file
      - permissions: contents: read
      - service: postgres:16
      - steps: create rolewright_login and rolewright_app exactly as the README does (psql); npm ci;
        npm run typecheck; npm test; then npm test again with ROLEWRIGHT_TEST_DATABASE_URL (the login),
        ROLEWRIGHT_TEST_ADMIN_URL and ROLEWRIGHT_REQUIRE_PG=1; npm run build
      - use the action versions the other workflows use
 4. Run it locally if you can: check /usr/lib/postgresql/16/bin/postgres (run it as a non-root user), or
    docker run postgres:16. If neither starts, say so plainly; the orchestrator checks the workflow run.
Done when:
  - cd apps/web && npm run typecheck && npm test
  - with a local Postgres:
      ROLEWRIGHT_REQUIRE_PG=1 ROLEWRIGHT_TEST_DATABASE_URL=... ROLEWRIGHT_TEST_ADMIN_URL=... node --test tests/db.test.mjs tests/consent.test.mjs
    shows 0 skipped
  - the workflow file parses (the orchestrator confirms the run after push)
Report: state whether Postgres actually ran, and add every defect it found.
```

```
Task: P0-9a HSTS and the production smoke harness
Worker: Haiku
Goal: Production responses carry Strict-Transport-Security, and test:prod can use the installed Chromium.
ADRs: 0009
Touches (only these):
  apps/web/next.config.mjs
  apps/web/tests/integration/prod-smoke.mjs
Inputs: launch review P2-15; docs/reviews/test-baseline.md (step 13 ignores
  PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH; see launchBrowser at prod-smoke.mjs:97-113).
Steps:
 1. prod-smoke step 11: assert strict-transport-security equals "max-age=63072000; includeSubDomains". See it
    fail.
 2. next.config.mjs: add that header to the "/:path*" block only when process.env.NODE_ENV === "production".
 3. launchBrowser: when PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH is set, launch with that executablePath first.
 4. Add to prod-smoke:
      - with no cookie, GET /privacy is 200 and contains "grievance-unset"
      - the HTML of / and /sign-in contains href="/privacy"
      - POST /api/internal/purge with no token is 401
Done when:
  - cd apps/web && npm run typecheck && npm test && npm run build
  - PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome npm run test:prod
    -> 13 of 13 plus the new assertions
```

```
Task: P0-10 Extracted facts are checked against the upload; re-upload keeps confirmations
Worker: Sonnet
Goal: A fact the AI produced that is not in the uploaded text is labelled and cannot be bulk-confirmed, and a
  re-upload keeps confirmations and ids for lines that have not changed.
ADRs: 0005
Touches (only these):
  apps/web/src/lib/fact-source.mjs (new)
  apps/web/src/lib/facts.mjs
  apps/web/src/lib/server/facts-edit.mjs
  apps/web/src/app/api/resume/route.ts
  apps/web/src/components/fact-editor.tsx
  apps/web/src/lib/client/types.ts
  apps/web/src/i18n/en.ts (append)
  apps/web/tests/fact-source.test.mjs (new)
  apps/web/tests/facts.test.mjs
  apps/web/tests/facts-edit.test.mjs
  apps/web/tests/integration/run.mjs
Inputs: launch review P1-8, P2-16.
  - resume/route.ts:63-76 takes the model's JSON, never compares it with `text`, and replaces every proposed
    item as unconfirmed with new ids.
  - fact-editor.tsx:151-154, :164, :199, :226, :333, :385 confirm whole sections.
Steps:
 1. Tests first (fact-source.test.mjs). Rule: squash(s) = cleanText(s), lower-cased, with everything except
    letters and digits removed. A field is found when squash(uploadText) includes squash(field). An item is
    found when every non-empty field of it is found (a job: company, title, start, end; a bullet: text;
    education: school, degree, field, year; a skill: name; the summary: text; contact: name and email).
    Cases:
      - a bullet copied exactly -> found
      - the same bullet with a line break and a hyphen break in the upload -> found
      - a bullet with "12" where the upload says "4" -> not found
      - a skill absent from the upload -> not found
      - a job whose title is not in the upload -> not found
      - empty fields are ignored
 2. facts.mjs: the source value "model" joins "upload" and "user" (src() at :26). types.ts: Source gains
    "model".
 3. fact-source.mjs: reconcileUpload(existing, proposed, uploadText) returns the facts to store.
      - each proposed item not found -> source "model"
      - a proposed item whose squashed content equals an existing CONFIRMED item's, and which is found
        -> keep that item's id and confirmed: true (for a job, compare company+title+dates; for its bullets,
        the text)
      - everything else stays unconfirmed
      - extras and cannotConfirm are kept from existing, as today
    Tests: a re-upload of the same resume keeps every confirmation and id; a changed bullet is unconfirmed
    with a new id; a bullet now missing from the PDF is gone; a "model" item is never auto-confirmed.
 4. Route: replace the callback at :72-76 with reconcileUpload(existing, proposed, text).
 5. facts-edit.mjs applyFactsEdit: an incoming item whose id matches a stored item with source "model" and
    whose content is unchanged keeps source "model"; a client cannot relabel it "upload". Edited content
    becomes "user", as today. Tests in facts-edit.test.mjs.
 6. fact-editor.tsx:
      - a "model" item shows a badge "Not found in your resume" and a one-line hint
      - "Confirm all in this section" confirms only items whose source is not "model", and announces how many
        it skipped
      - the single checkbox still works for a "model" item
      - do not change existing labels or ids
 7. integration/run.mjs:
      - after the first upload, no item has source "model"
      - upload a second fixture PDF that lacks one skill the mock returns -> that skill comes back with
        source "model" and unconfirmed
      - confirm facts, re-upload the first PDF -> confirmations and bullet ids are unchanged
Done when:
  - cd apps/web && npm run typecheck && npm test && npm run test:flow && npm run build
Report: add how many items of the test fixture were flagged "model" (expected 0 for the faithful PDF).
```

```
Task: P0-11 Browser test sweep and baseline
Worker: Sonnet
Goal: test:e2e passes against the finished Phase 0 app and covers the new behaviour, and the baseline file
  records it.
ADRs: 0003, 0004, 0005
Touches (only these):
  apps/web/tests/e2e/run.mjs
  apps/web/tests/e2e/helpers.mjs
  docs/reviews/test-baseline.md
Must not touch: also no file under src. If a test shows a product defect, report it; do not fix it.
Inputs: every merged Phase 0 task; the strings P0-3b changed (the "Save in this browser" button, the "Key
  saved" text).
Steps:
 1. Run test:e2e with PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome
    and list the failures.
 2. Fix selectors and flows that changed.
 3. Add checks:
      - signed out, /privacy renders and is linked from / and /sign-in
      - the storage assertions from P0-5 still run
      - the tailor form asks for consent for an account that has none
      - the "Not found in your resume" badge appears for the second fixture, and "Confirm all" skips it and
        says so
      - a refused export lists the failing line and its link focuses the card
      - axe finds no new violations on /privacy
 4. Add an e2e row and the new npm test, test:flow and test:prod numbers to docs/reviews/test-baseline.md.
Done when:
  - cd apps/web && npm run typecheck && npm test && npm run test:flow && npm run build
  - with the Chromium variable set: npm run test:e2e and npm run test:prod both pass in full
Report: add every product defect found, with the step that shows it.
```

## 4. RISKS

1. **The retention promise stays unscheduled at Phase 0 exit.** P0-4 builds the endpoint; nothing calls it until Cloud Scheduler exists (P1-6) and is seen firing (P1-7). The P0-3b retention sentence ("a scheduled job checks once a day") is true only after that. Public sign-ups must stay closed until P1-7, or the sentence must drop its second half for now. Owner's call.

2. **The gate is a word list.**
   - It will block true lines whose facts lack the word. That is the ADR 0005 decision.
   - It still passes inflation that uses unlisted words. Lower-case tool names, "doubled revenue" and similar remain in KNOWN_GAPS.
   - "lead", "specialist" and "qualified" cannot be listed without breaking the honest fixture.
   - The landing promise must not claim more than this; the P0-3b wording is written to that limit.

3. **"Confirm the missing fact" is one click on a bare word.** Attesting "Expert" or "Global" adds that single word to the facts and unblocks it on every line (`src/lib/tailoring.mjs:156-182`). That is the ADR's confirm path, not an override, but it is a weak statement of fact. Tightening it (a full sentence, or per-line scope) is a product decision outside these briefs.

4. **Session-only keys change the feel of the app.** Any reload or new tab asks for the key again, including mid-flow. P0-5 also has to rewrite a large part of the 939-line e2e script, which has no recorded baseline. Expect this to be the slowest Wave A task.

5. **Real Postgres has never been run** (README says so). P0-8 may find real defects in role grants or locking. Workers may not be able to start Postgres locally: `psql` and `docker` exist, the server binary is unconfirmed. In that case the first proof is the CI run, which only the orchestrator can read. Leave room for a follow-up task.

6. **Chromium path.** The briefs assume `/opt/pw-browsers/chromium-1243/chrome-linux64/chrome` works with playwright-core 1.64.1. I did not launch it. If it does not, P0-5, P0-9a and P0-11 cannot be proven locally.

7. **P0-1b edits a 3,317-line engine file** under a suite with 28 known failures, some flaky under parallel load. Review compares failure names, not counts. The engine and the app now each hold a copy of the word list, with comments pointing at each other.

8. **Grievance contact.** When unset, the "not yet set" marker shows in production too; that is honest, and it is a launch-checklist blocker. The consent row is deleted with the account (cascade), so proof of consent goes with it. Both are for the lawyer reviewing the notice.

9. **Start-up refusal is unverified.** P0-7 adds `instrumentation.ts`. Whether Next 16 exits at start or only errors on first request is checked by the worker by hand; first-use refusal stays as the backstop.

10. **No CI covers `apps/web` until Wave D.** Until then every check is a worker's local run plus my diff review.

11. **Copy is briefly wrong between waves.** After Wave A the key text still says "stored only in your browser" until P0-3b merges in Wave C. Do not demo or deploy a mid-phase build.

12. **Task count went from 11 to 13**, 11 of them on Sonnet. P0-3b's strings are mine, written for accuracy and not for legal sufficiency.