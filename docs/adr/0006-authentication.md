# 0006. Sign-in: Google and email link

- **Status:** Accepted
- **Date:** 2026-11-19
- **Decided by:** the owner

## Context

`apps/web` already has Auth.js with Google sign-in and email-link sign-in (via Resend), tested end to end. Phone OTP is familiar in India but adds an SMS vendor and per-message cost.

## Decision

- Keep Google and email-link sign-in as built.
- No phone OTP for now.
- The development sign-in (`ROLEWRIGHT_DEV_LOGIN`) and the fixed development secret must never be available on a deployed host. Today they are refused only when `NODE_ENV=production`. A staging host must also refuse them.

## Consequences

- Email-link sign-in needs a verified sending domain in Resend.
- The session is a 7-day sliding JWT with no server-side revocation. Account deletion ends access to data routes (tested), but a stolen cookie stays valid until it expires. Revisit if that risk grows.
- Sign-in requests need rate limiting. Today the auth POST route has none.
