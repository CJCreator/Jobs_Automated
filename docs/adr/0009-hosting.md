# 0009. Hosting: Google Cloud, Mumbai region

- **Status:** Accepted
- **Date:** 2026-11-19
- **Decided by:** the owner

## Context

The app needs:

- Postgres with row-level security (per-user isolation is enforced in the database)
- a scheduler for the retention purge (ADR 0004)
- Chromium for PDF export
- an India region, for latency and to simplify data-protection answers

Options considered: Vercel with managed Postgres (Chromium does not fit a serverless function well), a single VPS (we run patching and backups), and a container platform with managed Postgres.

## Decision

Google Cloud, region `asia-south1` (Mumbai), for every component that holds or processes user data:

- **App:** Cloud Run, one container image built from `apps/web` with Chromium included for PDF export. The engine (`packages/engine`) is copied into the image for the fact gate and renderer.
- **Database:** Cloud SQL for PostgreSQL, private IP, automated backups, connected from Cloud Run through the Cloud SQL connector. The app connects as a non-owner role so row-level security applies.
- **Secrets:** Secret Manager for `AUTH_SECRET`, OAuth credentials, the database password and our free-trial Gemini and OpenRouter keys. Users' keys are never stored (ADR 0003).
- **Retention purge:** Cloud Scheduler calls a purge endpoint daily, authenticated with an OIDC token from a dedicated service account. The endpoint refuses any other caller.
- **Environments:** `staging` and `production` as separate projects, each with its own database and secrets.

## Constraints

- Production refuses to start without `DATABASE_URL` and `AUTH_SECRET` (ADR 0004, ADR 0006).
- Request logging must not record the `x-llm-key` header (ADR 0003). Cloud Run's request logs do not include request headers by default; the load balancer, if one is added, must keep it that way.
- Row-level security and row locks are proven on real Postgres before launch.

## Consequences

- PDF export cold starts include Chromium; set a minimum instance count of 1 in production if export latency matters.
- The code keeps the purge as an HTTP endpoint plus `npm run purge:inactive`, so moving hosts later stays possible.

## Amended

- **2026-11-20 (orchestrator, from the P1-6 review; owner to confirm at the Phase 1 gate):**
  - Cloud Run reaches Cloud SQL by private IP over direct VPC egress, not through the Cloud SQL connector.
  - The instance accepts encrypted connections only (`ssl_mode = ENCRYPTED_ONLY`).
  - The app verifies the server certificate in a follow-up task; until then the Node connection strings use `sslmode=no-verify`.
  - Everything else in this decision is unchanged.
