# 0014. Repository stays private until launch

- **Status:** Accepted
- **Date:** 2026-11-19
- **Decided by:** the owner

## Context

The inherited code is MIT, which allows either choice as long as the licence and copyright notice stay with it. The fact gate has known, reproduced bypasses (ADR 0005); publishing before they are fixed would publish the hole.

## Decision

- The repository stays private until the Phase 1 exit review. The owner revisits open-sourcing then.
- `LICENSE` and `NOTICE` keep the upstream MIT attribution either way.
- Until the revisit, the repository keeps neutral, minimal files: `LICENSE`, `NOTICE`, `SECURITY.md`, issue and PR templates with no community process.

## Consequences

- Before any future publication: a secrets and personal-data scan of the full history, and contributor docs.
