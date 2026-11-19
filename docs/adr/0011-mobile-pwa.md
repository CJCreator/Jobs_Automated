# 0011. Responsive web, installable as a PWA

- **Status:** Accepted
- **Date:** 2026-11-19
- **Decided by:** the owner

## Context

Many freshers in India are mobile-first. A native app means a second codebase and app-store review.

## Decision

- One responsive web app that works at phone width (no horizontal scrolling at 360 px) and is installable to the home screen as a PWA.
- No native app for now.

## Consequences

- Every screen is tested at phone width in the browser tests.
- The PWA manifest and service worker must not cache resume data or API responses containing personal data.
