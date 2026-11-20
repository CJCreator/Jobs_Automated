# Rolewright plan

The product, decisions and phases, end to end. Each line points at the ADR that decides it. Open questions are listed last.

## The product in one paragraph

A hosted web app (ADR 0001) where a job seeker in India uploads their resume, confirms the facts in it, pastes a job description, and gets a reworked, tailored resume. Every claim is checked against what they confirmed (ADR 0005), and they export it as a PDF. They then track the application, draft a cover letter, and prepare for the interview from the same facts (ADR 0007, ADR 0015). They bring their own AI key or start on a small free trial (ADR 0003). Their data stays in their account, is exportable, and is deleted after a year of inactivity (ADR 0004).

## Who it's for

| Segment | What they need | Onboarding emphasis |
|---|---|---|
| Fresher | A first resume that gets past keyword screening | Projects, internships, education as the fact base |
| Experienced hire | A resume tailored to each job, fast | Import the existing resume, confirm, tailor |
| Career switcher | Transferable skills framed for a new field, honestly | Reframing without inventing experience |

## Phases

### Phase 0: launch blockers (no public sign-ups before these)

| # | Work | ADR | Found by |
|---|---|---|---|
| 1 | Fact gate blocks invented credentials, scope words, employers and unit-bearing figures; regression test per reproduced bypass | 0005 | launch review P0-1, claims audit |
| 2 | Server-side consent record (text version, timestamp, user id); upload refused without it | 0004 | launch review P0-3 |
| 3 | Privacy notice reachable before sign-in; names the AI provider transfer | 0004 | launch review P0-4 |
| 4 | Grievance contact in the notice | 0004 | launch review P0-5 |
| 5 | Schedule the 12-month purge on the host, or remove the promise until it is scheduled | 0004 | launch review P0-2 |
| 6 | Session-only key: remove `localStorage` key storage | 0003 | launch review P2-14 |
| 7 | Decompressed-size cap before PDF parsing | 0004 | launch review P1-6 |
| 8 | Production refuses to start without `DATABASE_URL`; dev sign-in refused on every deployed host, not only `NODE_ENV=production` | 0004, 0006 | launch review P1-7, P1-12 |
| 9 | Prove row-level security and row locks on real Postgres | 0009 | launch review P1-13 |
| 10 | Host chosen: Google Cloud, Mumbai | 0009 | |

### Phase 1: bring your own key and the free trial

- Key entry per visit, validation call, in-memory only (ADR 0003).
- Launch providers: Gemini, OpenRouter, Anthropic.
- Trial on our Gemini and OpenRouter keys: 5 tailorings per verified account.
- Port `keyword-match.mjs` with a parity test and show keyword coverage (moved up from Phase 2).
- Google Cloud setup as code and a staging deploy.
- Shared rate limits (the current limiter is per process). Rate-limit sign-in and export.
- Run the fixture set through each provider and record fact-gate pass rate and keyword coverage before enabling it.

### Phase 2: the three journeys and the first success measure

- Onboarding path per segment.
- Event analytics, no content (ADR 0010).
- Data export (ADR 0004).
- Phone-width pass on every screen and the PWA manifest (ADR 0011).

### Phase 3: tracker, cover letters, interview prep

- Tracker on Postgres with keyboard-operable Kanban, then delete `packages/engine/web` (ADR 0007).
- In-app reminders (ADR 0008).
- Cover letters and interview prep packs through the fact gate (ADR 0015).
- Port `jd-skill-gap`, `cv-title-check`, `verify-ats`/`ats-payload` and `role-clarity` with parity tests (ADR 0012).
- Optional callback follow-up per application (ADR 0016).

### Later

- Job discovery from the engine's scanners (ADR 0001).
- Email reminders once a free email tier is chosen (ADR 0008).
- npm workspaces (ADR 0002).

## How it gets built

Phases 0 and 1 are broken into tasks, waves and agent briefs in [`EXECUTION.md`](EXECUTION.md): an advisor plans and reviews, worker agents build, and the owner approves each phase (ADR 0017).

## Open questions for the owner

1. **Grievance contact** for the privacy notice (ADR 0004): a placeholder until launch.
2. **Legal review** of the privacy notice under DPDP before launch (ADR 0004).
3. **Open source** is revisited at the Phase 1 exit (ADR 0014).
4. **OpenAI and Groq**: enable after launch, each after a parity run (ADR 0003).
