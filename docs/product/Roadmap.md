# Product Roadmap — career-ops

## Purpose
Outlines the strategic development phases, feature releases, and technical milestones for career-ops.

## Scope
Spans Core CLI, Modern Web UI, Local DevOps, and Future AI capabilities.

## Overview
Our roadmap transitions career-ops from an elite CLI power-tool for developers into an accessible, institutional-grade career command center.

## Diagrams

```mermaid
gantt
    title career-ops Engineering Roadmap
    dateFormat  YYYY-MM
    section Phase 1: Core Hardening
    Deconstruct test-all.mjs monolith   :done, 2026-08, 2026-10
    SQLite Derived Indexing (RFC #918)  :done, 2026-09, 2026-11
    Tagged PDF Accessibility            :active, 2026-11, 2026-12
    section Phase 2: Web Modernization
    Web UI Kanban & Job Studio          :active, 2026-11, 2027-01
    Onboarding Wizard & CV Parser       :2027-01, 2027-02
    Local IMAP/Calendar Sync            :2027-02, 2027-03
    section Phase 3: Ecosystem Expansion
    Local Autofill Browser Extension    :2027-03, 2027-05
    Voice-to-Voice Mock Interview Agent :2027-05, 2027-07
    Encrypted Zero-Knowledge Backup     :2027-07, 2027-09
```

## Technical Details

### Phase 1: Core Engine & Developer Ergonomics (Q4 2026)
- **Monolith Deconstruction**: Split the 20,000-line `test-all.mjs` file into modular suites under `tests/`.
- **Accessibility Hardening**: Add semantic PDF tags to Playwright Chromium rendering for screen reader compliance.
- **CLI Doctor**: Automated self-healing environment diagnosis.

### Phase 2: Web Modernization & Local Inbound (Q1 2027)
- **Production Web UI**: Graduate `@career-ops/web` from alpha to primary interface.
- **Local Email Ingestion**: Zero-cloud IMAP reader for local rejection/interview invite classification.
- **Visual CV Studio**: Side-by-side Markdown editing with live PDF preview.

### Phase 3: The Last-Mile Bridge & Voice Agent (Q2–Q3 2027)
- **Companion Browser Extension**: 1-click ATS prefill without cloud data leakage.
- **Local Audio Mock Interviewer**: WebRTC/Whisper voice agent that grills candidates using their STAR story bank.

## Best Practices
- Every new feature must preserve the local-first data contract.

## Examples
- Release tracking via `node update-system.mjs check`.

## Future Enhancements
- Decentralized talent network protocols.
