# 0008. Reminders in-app only for now

- **Status:** Accepted
- **Date:** 2026-11-19
- **Decided by:** the owner

## Context

Users benefit from follow-up and interview reminders. Email or WhatsApp delivery costs money per message and needs vendor setup.

## Decision

- Follow-up, deadline and interview reminders show inside the app when the user opens it.
- Move to email reminders once a free tier of an email provider is chosen. WhatsApp is not planned.
- The retention notice before a 12-month purge (ADR 0004) is shown in-app until email exists.

## Consequences

- A user who stops opening the app gets no reminders and no purge notice. This is a known gap until email exists.
- Reminder logic is computed from tracker data on page load. No background sender is needed yet.
