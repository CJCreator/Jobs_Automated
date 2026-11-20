# Rolewright

Rework your resume from the experience you actually have, tailor it to a job description, and get past the first screen. Every claim in the exported resume is checked against the facts you confirmed. The export is refused when a changed line states something your confirmed facts do not. The check catches invented employers, figures, credentials and seniority words; it does not understand meaning, so you still review every change. What it does not catch yet is listed in [ADR 0005](docs/adr/0005-fact-gate-hard-export-gate.md#amendment-2026-11-20-owner-what-the-gate-does-not-catch).

Built for job seekers in India: freshers, experienced hires and career switchers.

> Status: pre-launch. The launch blockers are listed in [`docs/plan/PLAN.md`](docs/plan/PLAN.md).

## What it does

1. **Upload your resume.** Rolewright extracts the facts and asks you to confirm each one.
2. **Paste a job description.** It suggests rewordings that fit the job, using only confirmed facts.
3. **Fact check.** Any suggestion that adds an employer, title, credential, figure or scope you did not confirm is blocked from the export.
4. **Export a PDF** that reads well to ATS keyword screening and to people.
5. **Track applications, draft cover letters and prepare for interviews** from the same confirmed facts (in the plan, not built yet).

You bring your own AI key (Gemini, OpenRouter or Anthropic), or start with a small free trial on Rolewright's own keys: 5 tailorings and 3 resume readings for each account with a confirmed email address. Your key is used for the request and never stored.

## Repository layout

| Path | Contents |
|---|---|
| [`apps/web`](apps/web) | The hosted Next.js app |
| [`packages/engine`](packages/engine) | The engine: fact gate, PDF renderer and resume checks, plus the career-ops CLI scripts it came from |
| [`docs/adr`](docs/adr) | Architecture decision records |
| [`docs/plan`](docs/plan) | Product plan and phases |
| [`docs/reviews`](docs/reviews) | Reviews behind the plan |

## Run it locally

Needs Node 22.18 or later for the app (`apps/web`); the engine alone runs on 22.13 or later.

```bash
npm --prefix packages/engine install
```

```bash
npm --prefix apps/web install
```

```bash
cd apps/web && ROLEWRIGHT_DEV_LOGIN=1 ROLEWRIGHT_ALLOW_MOCK_LLM=1 npm run dev
```

Open http://localhost:3100. The dev flags give a sign-in with no email and a fake AI provider (`mock`, key `mock-valid-key`) that deliberately invents claims so you can watch the fact check block them. Both flags are refused in production. See [`apps/web/README.md`](apps/web/README.md) for every setting.

## Power users: the engine from an AI coding CLI

`packages/engine` still runs as a CLI skill for Claude Code, Codex, Cursor and other agent CLIs. Open your CLI inside `packages/engine`; its own [`AGENTS.md`](packages/engine/AGENTS.md) applies there.

## Credits and licence

Based on [career-ops](https://github.com/career-ops-hq/career-ops) (MIT). Rolewright is independent and not endorsed by that project. See [`NOTICE`](NOTICE) and [`LICENSE`](LICENSE).
