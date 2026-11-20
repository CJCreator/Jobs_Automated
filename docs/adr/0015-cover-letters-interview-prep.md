# 0015. Cover letters and interview prep packs from confirmed facts

- **Status:** Accepted
- **Date:** 2026-11-19
- **Decided by:** the owner

## Context

Cover letters and interview prep are in v1 scope (ADR 0001). Both are places where a model will happily invent achievements.

## Decision

- **Cover letter:** one per application, drafted from confirmed facts and the job description, editable, and checked by the same fact gate as the resume (ADR 0005).
- **Interview prep pack:** one per application, made of three parts. It is generated, then editable. No mock-interview mode in v1.
  - likely questions for the role
  - STAR answers built only from confirmed facts
  - prompts for researching the company
- Any figure or scope claim in a STAR answer must trace to a confirmed fact. One that doesn't is shown as "add this fact to use it", never filled in.

## Consequences

- Both artifacts are stored per application and included in export and erasure (ADR 0004).
- The engine's interview and cover-letter modes are reference material for prompts, not code the app calls directly.
