# 0003. Bring your own key, session-only, with a free trial

- **Status:** Accepted
- **Date:** 2026-11-19 (providers and trial size confirmed the same day)
- **Decided by:** the owner

## Context

Running the AI on our own keys for every user costs money we do not want to spend before launch. Many users, especially freshers, have no paid key, but free tiers exist (Gemini, OpenRouter free models). Storing users' keys makes us a custodian of credentials: a breach would leak keys that bill the user.

## Decision

- **Users bring their own key, free or paid.** Supported at launch: Gemini, OpenRouter and Anthropic. The OpenAI and Groq adapters already in `apps/web/src/lib/llm/providers.mjs` stay in the code but are hidden until the owner enables them, each after its parity run.
- **Session-only.** The key is held in memory for the visit, sent per request over HTTPS in a header, and used for that request only. It is never written to the database, server logs, error messages, analytics, or browser storage. The user re-enters it on each visit.
- **Free trial on our keys.** A server-side key for Gemini and for OpenRouter free models, used only when the user has no key. No paid spend: the trial is small, then the user brings a key. 5 tailorings per verified account, lifetime, counted on the server. A per-IP limit backs the per-account counter.
- **Quota exhausted** (our free quota or the user's) produces a clear "bring your own key" message, not a generic error.
- **Provider parity:** before a provider is enabled, the same fixture set runs through it and its fact-gate pass rate and keyword match are recorded.

## Consequences

- `apps/web/src/lib/client/llm-key.ts` must stop using `localStorage` (today it stores the key there, readable by any script on the page).
- A per-account trial counter is stored (a count, not content). Email verification is needed before the free key is used, or new accounts farm the trial.
- The key-hygiene steps in `npm run test:flow` (no key in any log line or database column) must keep passing and gain a check that nothing is written to browser storage.
- The user sees which model they are on, because free models may pass the fact check less often.

## Amended

- **2026-11-20 (owner):** The trial also pays for reading the user's resume: up to 3 resume readings per verified account (`TRIAL_UPLOADS = 3`), on top of the 5 tailorings, because a user with no key cannot otherwise load their resume. Same keys, same verification rule, same per-IP cap.
