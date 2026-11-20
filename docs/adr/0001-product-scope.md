# 0001. Product: Rolewright for job seekers in India

- **Status:** Accepted
- **Date:** 2026-11-19
- **Decided by:** the owner

## Context

The repository started as a fork of career-ops, a local AI job-search tool for technical users running an AI coding CLI. The owner wants a product that helps any job seeker, including people with no technical setup, get past the first screen. The name "career-ops" is reserved by its maintainer (ADR 0013), so the product needs its own name.

## Decision

- **Name:** Rolewright.
- **Market:** India. Prices in INR, Indian employment context (CTC versus in-hand, notice period, PF).
- **Language:** English only at launch, for both input and output. Other languages are a later decision.
- **Users:** three segments, each with its own onboarding path but the same fact check:
  - **Freshers:** students and new graduates. The resume is built from projects, internships and education.
  - **Experienced hires:** the resume is tailored to the job description from real experience.
  - **Career switchers:** transferable skills are reframed for the new field without inventing experience.
- **Core job:** rework the resume from the experience the user actually has, tailor it to a job description, and get them past the first screen.
- **v1 scope:**
  - resume rework and job-description tailoring with a fact-checked PDF export (already built in `apps/web`)
  - application tracker (ADR 0007)
  - cover letters and interview prep packs (ADR 0015)
- **Later:** job discovery (finding openings for the user). The engine's scanners stay in `packages/engine` until then.

## Consequences

- The hosted app in `apps/web` is the product. The engine is a library it calls, plus a power-user CLI path (ADR 0012).
- Everything user-facing must work for someone with no AI key and no technical setup (ADR 0003 free trial).
- Features from career-ops that do not serve these three segments stay in the engine and are not surfaced in the app.
