# 0009. Hosting

- **Status:** Proposed (the owner has not decided)
- **Date:** 2026-11-19

## Context

The app needs:

- Postgres with row-level security (per-user isolation is enforced in the database)
- a scheduler for the retention purge (ADR 0004)
- Chromium for PDF export
- preferably an India region, for latency and to simplify data-protection answers

The code is kept host-neutral until this is decided.

## Options

| Option | Fits | Watch out for |
|---|---|---|
| Vercel + managed Postgres in Mumbai (for example Supabase `ap-south-1`) | Next.js-native, managed database with RLS, cheap to start | Chromium for PDF export in a serverless function is size- and time-limited; may need a separate render service. Cron needs a scheduled function. |
| A single VPS or container host (for example Railway, Render, a Mumbai VM) with Postgres | Full Chromium, simple cron, one bill | We run patching, backups and scaling ourselves. |
| Container platform (Cloud Run, Fly.io) + managed Postgres | Chromium in the container, scales to zero | More setup; check the India region and cold starts. |

## Constraints whatever is chosen

- Production refuses to start without `DATABASE_URL` and `AUTH_SECRET` (ADR 0004, ADR 0006).
- The proxy or CDN in front of the app must not log the `x-llm-key` header (ADR 0003).
- Row-level security and row locks are proven on real Postgres before launch. Today they are tested only on the embedded database.
