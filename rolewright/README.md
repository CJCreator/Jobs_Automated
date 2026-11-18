# Rolewright

Rolewright is a web app for job seekers in India. You upload your resume, confirm the facts in it, paste a job description, and review AI suggestions for rewording your resume to fit the job. A suggestion can only reach the exported PDF if every claim in it is in the facts you confirmed.

Based on the open-source career-ops project (MIT licence).

## Run it locally

Needs Node 22.13 or later. Dependencies for this app are in `rolewright/node_modules`; the PDF export also needs the engine checkout (the folder above this one) with its own `node_modules` and Playwright's Chromium installed (`npx playwright install chromium` in that folder).

Two development flags turn on a sign-in that needs no email or Google account, and a fake AI provider that needs no key:

```bash
# bash
ROLEWRIGHT_DEV_LOGIN=1 ROLEWRIGHT_ALLOW_MOCK_LLM=1 npm run dev
```

```powershell
# PowerShell
$env:ROLEWRIGHT_DEV_LOGIN="1"; $env:ROLEWRIGHT_ALLOW_MOCK_LLM="1"; npm run dev
```

Open http://localhost:3100. With no `DATABASE_URL`, data is kept in an embedded database at `rolewright/.data/pglite`. To use the fake provider, choose provider `mock` with the key `mock-valid-key`. It deliberately invents figures, tools and employers so you can see the fact check stop them.

Both flags are refused when `NODE_ENV` is `production`: with `ROLEWRIGHT_DEV_LOGIN=1`, the sign-in module throws a clear error as soon as it loads, so no page or route that needs a session works; and the `mock` provider is reported as not supported.

## Commands

| Command | What it does |
|---|---|
| `npm test` | Unit tests (`tests/**/*.test.mjs`), no server needed. |
| `npm run test:flow` | The whole flow over real HTTP: starts `next dev` on a free port (3111 if free) with the dev flags and a temporary database, signs in two users, uploads a PDF, tailors, reviews, exports, checks isolation, cross-site refusal and key hygiene, deletes an account. Prints PASS or FAIL per step. Set `FLOW_SHOW_SERVER_OUTPUT=1` to print what the server logged. It uses its own build folder (`.next-flow`) so it does not disturb a `next dev` already running, and puts back `tsconfig.json` and `next-env.d.ts`, which `next dev` rewrites for that folder. |
| `npm run typecheck` | TypeScript check of `src/`. |
| `npm run build` | Production build. |

## Environment variables

Read from the process environment only.

| Name | Meaning |
|---|---|
| `AUTH_SECRET` | Signs and encrypts session cookies. Required in production: without it every sign-in request fails with a "MissingSecret" configuration error. In development a fixed, development-only value is used when unset. Generate one with `openssl rand -base64 32`. |
| `AUTH_URL` | The public URL of the app, e.g. `https://rolewright.example`. Needed in production behind a proxy so sign-in links and callbacks use the right host (or set `AUTH_TRUST_HOST=true`). |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Google sign-in. Offered only when both are set. Callback URL to register with Google: `<AUTH_URL>/api/auth/callback/google`. |
| `AUTH_RESEND_KEY`, `EMAIL_FROM` | Sign-in by email link, sent through Resend. Offered only when both are set. `EMAIL_FROM` must be on a domain verified in Resend. |
| `DATABASE_URL` | Postgres connection string. When unset, the embedded database is used. |
| `ROLEWRIGHT_DATA_DIR` | Directory for the embedded database instead of `.data/pglite` (the flow test uses a temp directory). Ignored when `DATABASE_URL` is set. |
| `ROLEWRIGHT_DEV_LOGIN=1` | Development sign-in by email with no verification. Startup fails if this is set while `NODE_ENV=production`. |
| `ROLEWRIGHT_ALLOW_MOCK_LLM=1` | Enables the fake AI provider `mock`. Ignored when `NODE_ENV=production`. |
| `CAREER_OPS_CODE_ROOT` | Path to the engine checkout. Default: the parent of the app's working directory. |
| `CAREER_OPS_ROOT`, `CAREER_OPS_DATA_DIR` | The engine's data folder. Leave unset: the server points the engine at a fresh, empty temp folder before loading it, so it never reads files from the checkout. All user data is in the database. |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` | Optional. A Chromium binary to use for PDF export instead of Playwright's own download. |
| `BUILD_DIST` | Optional. A build folder other than `.next` (read by `next.config.mjs`). The flow test sets `.next-flow` so it can run beside another `next dev`. |
| `FLOW_SHOW_SERVER_OUTPUT=1` | Optional, for `npm run test:flow` only: print everything the server logged. |

## How the server handles requests

- Every API route needs a signed-in session, checked against the `users` table on each request, so deleting an account ends its sessions at once. All user data is read and written through `withUser`, which applies row-level security in the database.
- Every `POST`, `PUT`, `PATCH` and `DELETE` is refused when its `Origin` header names a different host, or when the browser marks it as cross-site. JSON routes also require the JSON content type.
- Every API response carries `Cache-Control: no-store`.
- The user's AI key comes in the `x-llm-provider`, `x-llm-key` and `x-llm-model` headers on the AI routes only. It is used for that one request and is never stored, logged, returned, put in an error message or in a cookie.
- A failed request writes one log line: route, method, status, error code and user id. Bodies, resume text, job descriptions, prompts, AI output, email addresses, keys and error messages are never logged.
- Limits: JSON bodies 1 MB; uploads 5 MB (checked before the form is parsed), at most 30 pages, text capped at 60,000 characters; AI routes 20 requests per minute per user; uploads 10 per hour per user. **The rate limits are kept in memory per server process.** With more than one process they must move to a shared store (Redis or the database).
- The fact check fails closed: if the engine's fact gate cannot be loaded, creating, viewing, reviewing and exporting tailorings answer 503 instead of running with half the checks. Export recomputes every check from the current facts and never trusts a stored verdict.
- PDF export renders the plain resume template (`src/lib/resume-html.mjs`) with Playwright's Chromium directly, with JavaScript off and every network request blocked. One browser is shared across requests; nothing is written to disk.

## What production needs

- A Postgres database in an India region (for example AWS `ap-south-1` Mumbai). The database user must be able to create the `rolewright_app` role, or be granted it already (`GRANT rolewright_app TO <app user>`): every user-data query switches to that role so row-level security applies. The schema is applied automatically on first connection.
- Chromium for PDF export: install the engine checkout's Playwright browser (`npx playwright install --with-deps chromium` on Linux), or point `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` at a Chromium binary.
- The engine checkout deployed alongside the app, with its dependencies installed, and `CAREER_OPS_CODE_ROOT` pointing at it if it is not the app's parent folder.
- `AUTH_SECRET` and `AUTH_URL`.
- A Google OAuth client (`AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`) and a Resend key with a verified sending domain (`AUTH_RESEND_KEY`, `EMAIL_FROM`).
- A shared store for rate limits once there is more than one server process.

## Not yet verified

- **Google sign-in and email-link sign-in have never been run.** They are wired (provider set-up, the database adapter, the verified-email rule for Google), but no credentials were available. Only the development sign-in was exercised.
- **`next build` has not been run against these routes.** In particular, the engine and Playwright are loaded from paths chosen at runtime with the bundler told to ignore them; that works under `next dev`, but whether a production build traces or bundles them correctly is unchecked.
- **Real AI providers.** The flow test uses the mock provider only. Uploading and tailoring with Gemini, OpenAI, Anthropic, OpenRouter or Groq keys has not been tried end to end.
- **Postgres.** Everything ran on the embedded database. The `pg` driver path, the role grant on a managed database, and behaviour with several server processes are untested.
- **Scanned PDFs, password-protected PDFs and very long resumes** are refused or capped by code paths that no test has exercised with a real file of that kind.
- **The production guards.** The refusal of `ROLEWRIGHT_DEV_LOGIN=1` under `NODE_ENV=production`, and the missing-`AUTH_SECRET` failure, have not been run.
- **Concurrent edits.** Two review actions on the same tailoring at the same moment can overwrite each other's change. Export is still safe, because it re-checks everything, but one of the two actions can be lost.
