# Repository Directory & Component Map — career-ops

> **Document Status**: Production / Exhaustive  
> **Target Version**: v1.38.0  
> **Total Files Analyzed**: ~3,080+ files | 1,964 ESM modules | 60+ ATS Scanners  

---

## 1. High-Level Architecture Map

```
career-ops/
├── .agents/                 # Open Agent Skill Standard router (.agents/skills/career-ops/SKILL.md)
├── batch/                   # Headless parallel batch processing engine
├── config/                  # Candidate configuration templates & schema definitions
├── dashboard/               # Standalone Go terminal dashboard (Charm Bubbletea)
├── data/                    # User Layer: Canonical tracker, status transition ledger, pipeline inbox
├── docs/                    # Complete 9-pillar documentation suite
│   ├── product/             # PRD, Vision, Personas, User Journeys, Competitive Analysis, Roadmap, Specs
│   ├── architecture/        # System, Frontend, Backend, Database, AI, Agent, Security, Infrastructure
│   ├── development/         # Setup, Local Dev, Standards, Branching, Contributing, Env Vars, API Guide
│   ├── frontend/            # Design System, Component Library, State Management, Routing, Dashboard TUI
│   ├── backend/             # API Reference, Service Architecture, Database Schema, Authentication
│   ├── ai/                  # Prompt Library, Agent Workflows, LLM Architecture, Eval Framework, RAG
│   ├── testing/             # Testing Strategy, Unit, Integration, E2E Visual, Performance
│   ├── deployment/          # Deployment Guide, CI/CD, Monitoring, Scaling, Disaster Recovery
│   └── business/            # Monetization, Pricing Strategy, Growth Loops, KPI Framework
├── fonts/                   # Bundled OFL fonts for ATS resume rendering (Space Grotesk, DM Sans)
├── interview-prep/          # User Layer: Accumulated STAR story bank & company dossiers
├── lib/                     # Core backend runtime modules (locks, PII interceptors, path resolvers)
├── modes/                   # AI Agent Brain: Composable evaluation, tailoring, and interview prompts
├── output/                  # User Layer: Tailored CV PDFs, HTML artifacts, and cover letters
├── providers/               # 60+ zero-token public ATS API adapters (Greenhouse, Ashby, Lever, etc.)
├── reports/                 # User Layer: Full A-H evaluation dossiers (markdown)
├── scripts/                 # Maintenance, syntax verification, and documentation generation scripts
├── templates/               # ATS CV templates (HTML, LaTeX) and status definitions (states.yml)
├── tests/                   # Automated unit, integration, and visual regression test suites
├── web/                     # Local-first Next.js 16 Web UI (React 19, Tailwind CSS v4)
├── *.mjs                    # Root CLI scripts (scan.mjs, tracker.mjs, generate-pdf.mjs, etc.)
├── AGENTS.md                # Master agent instruction file & behavioral rules
├── ARCHITECTURE.md          # Architectural doctrine & technical specifications
├── DATA_CONTRACT.md         # Definitive System Layer vs. User Layer boundary
├── README.md                # Project README & quick start guide
└── update-system.mjs        # Self-updating engine preserving User Layer data
```

---

## 2. Root CLI Execution Scripts (`*.mjs`)

The flat root layout is maintained deliberately to preserve execution stability across AI coding CLIs, community plugins, and updater git checkouts:

| Script | LOC (approx) | Primary Architectural Responsibility |
| :--- | :---: | :--- |
| `scan.mjs` | ~1,200 | Zero-token scanner calling configured ATS APIs in `portals.yml`. |
| `scan-ats-full.mjs` | ~1,800 | Full reverse-ATS dataset keyword scanner with 500-company checkpointing. |
| `check-liveness.mjs` | ~800 | Deterministic liveness checker verifying HTTP status and DOM active state. |
| `tracker.mjs` | ~1,420 | SQLite derived index builder (`node:sqlite`) and CLI query tool. |
| `set-status.mjs` | ~1,100 | Canonical tracker status transitioner with atomic locking and ledger appending. |
| `generate-pdf.mjs` | ~2,730 | Playwright Chromium HTML-to-PDF compiler with strict page budgeting. |
| `generate-latex.mjs` | ~1,200 | LaTeX compiler and fact gate for technical/academic CV formats. |
| `verify-cv-facts.mjs` | ~3,285 | Deterministic anti-hallucination fact verification engine. |
| `verify-pipeline.mjs` | ~900 | Pipeline integrity auditor validating table columns, statuses, and links. |
| `openrouter-runner.mjs`| ~1,270 | Standalone evaluation runner using OpenRouter cloud models. |
| `gemini-eval.mjs` | ~750 | Standalone evaluation runner using Google Gemini free tier API. |
| `ollama-eval.mjs` | ~600 | Offline evaluation runner using local Ollama model instances. |
| `match-star.mjs` | ~850 | Matches candidate STAR stories against extracted JD requirements. |
| `update-system.mjs` | ~3,500 | Self-updating engine checking out new releases without touching user files. |
| `doctor.mjs` | ~500 | System diagnostics auditing Node version, Playwright, and configs. |
| `funnel-velocity.mjs` | ~650 | Calculates stage conversion rates and candidate pipeline velocity. |
| `keyword-match.mjs` | ~700 | ATS keyword diagnostic measuring missing vs. present competencies. |

---

## 3. Modes Directory (`modes/`)

The core intelligence layer. Prompts are organized as composable, versioned markdown files:

### System Layer Prompts (Auto-Updatable)
- `_shared.md`: The core brain. Defines the 5-dimension scoring rubric, spend tier model routing, anti-hallucination rules, and evidence confidence grading.
- `oferta.md`: Full 8-block (A–H) comprehensive evaluation mode for single job postings.
- `apply.md`: Application form answer synthesis and recruiter outreach drafting.
- `cover.md`: Contextual, high-signal cover letter generation.
- `interview.md`: Behavioral interview preparation, company intel, and counter-questions.
- `retro.md`: Interactive retrospective mode extracting candidate feedback into persistent rules.
- `scan.md` & `batch.md`: Agent prompts driving automated scanning and parallel batch workers.
- Multilingual directories (`modes/es/`, `modes/de/`, `modes/fr/`, `modes/zh/`, `modes/ja/`, etc.): Culturally adapted prompt variations.

### User Layer Templates (Never Auto-Updated)
- `_profile.template.md` $\rightarrow$ `_profile.md`: Candidate target archetypes, positioning, and comp targets.
- `_custom.template.md` $\rightarrow$ `_custom.md`: Candidate procedural house rules and formatting preferences.
- `_brief.template.md` $\rightarrow$ `_brief.md`: Compact executive summary of candidate identity.

---

## 4. Providers Directory (`providers/`)

Over 60 zero-token public ATS API adapters and feed scrapers:

### Core Infrastructure
- `_ip-guard.mjs`: Socket-level DNS lookup hook blocking private networks and cloud metadata (SSRF defense).
- `_http.mjs`: Bounded HTTP client enforcing timeouts, user-agents, and redirect limits.
- `_registry.mjs`: Dynamic module discovery auto-registering all provider files.
- `_types.js`: JSDoc type contracts for normalized `Job` and `Provider` interfaces.

### Major Supported Providers
- **Modern Startup ATS**: `ashby.mjs`, `greenhouse.mjs`, `lever.mjs`, `bamboohr.mjs`, `smartrecruiters.mjs`, `teamtailor.mjs`.
- **Enterprise Platforms**: `workday.mjs`, `taleo.mjs`, `successfactors.mjs`, `ultipro.mjs`, `icims.mjs`. Dayforce is not a provider: it is the root Playwright scanner `scan-dayforce.mjs`.
- **European & Regional Portals**: `join.mjs`, `personio.mjs`, `softgarden.mjs`, `wttj.mjs`, `solidjobs.mjs`. Interamt is not a provider: it is the root Playwright scanner `scan-interamt.mjs`.
- **Aggregators & Feeds**: `himalayas.mjs`, `remoteok.mjs`, `weworkremotely.mjs`, `thehub.mjs`, `startup-jobs.mjs`.

---

## 5. Core Libraries (`lib/`)

Foundational utilities shared across CLI scripts, evaluators, and the Web UI:

- `dir-lock.mjs` & `pipeline-lock.mjs`: Advisory cross-platform directory locking with exponential backoff.
- `pii-interceptor.mjs`: Monkey-patches `globalThis.fetch` to intercept outbound candidate PII.
- `privacy-guard.mjs`: Regex and pattern engine identifying sensitive credentials, emails, and phone numbers.
- `path-resolver.mjs` (repository root, not `lib/`): Precedence engine for Data Root (`CAREER_OPS_ROOT`) and tracker locations.
- `story-bank.mjs`: STAR+R story bank parser enforcing provenance markers (#2947).
- `context-budget.mjs`: Token density and context window optimization utilities.
- `tracker-addition.mjs`: Formats and validates TSV addition lines for parallel batch workers.
- `ascii-fold.mjs`: Normalizes diacritics and accented characters for reliable string matching.

---

## 6. Web Application (`web/`)

Next.js 16 local-first web application:

- `src/app/`: App Router route definitions:
  - `page.tsx`: Today's action queue and pipeline overview.
  - `pipeline/`: Interactive Kanban board and sortable table views.
  - `pipeline/[id]/`: Detailed job dossier and report inspection.
  - `explore/`: Zero-token ATS search and company directory explorer.
  - `cv/`: Master CV editor and live PDF fact-check inspector.
  - `analytics/`: Funnel velocity and rejection latency visualizations.
  - `scheduled-scans/`: Background scan daemon management.
  - `config/`: Profile and portal configuration UI.
- `src/app/api/`: 30+ REST API route handlers orchestrating core Node scripts.
- `src/components/ui/`: Primitive UI components (`tabs.tsx`, `drawer.tsx`, `toast.tsx`, `score-gauge.tsx`).
- `server.mjs`: Launcher for the Next.js web UI (`web/server.mjs`). The default bind is loopback (`127.0.0.1`). `-H`/`--hostname` or `CAREER_OPS_WEB_ALLOWED_HOSTS` widens the bind to other interfaces. The web UI has no authentication, so anyone who can reach a widened bind can use it.

---

## 7. Terminal Dashboard (`dashboard/`)

Go Bubbletea terminal application:

- `main.go`: Bubbletea event loop, view router, and keybinding handlers.
- `internal/data/`: Zero-dependency Markdown table and status ledger parser.
- `internal/model/`: Go data structs for applications, metrics, and funnel stages.
- `internal/ui/screens/`: Screen models for Pipeline, Report Viewer, Progress, and Stats.
- `internal/theme/`: Lipgloss ANSI styling tokens and color schemes.

---

## 8. Test Suites (`tests/`)

Over 1,000 automated test specifications:

- `tests/helpers.mjs`: Universal test harness providing `pass()`, `fail()`, and child-process sandboxing.
- `tests/providers/*.test.mjs`: Contract tests for all 60+ ATS scraper modules.
- `tests/cv-visual/`: Playwright visual snapshot regression specs (`cv-visual.test.mjs`, plus `*.spec.mjs` files alongside it).
- `tests/data-root-guard.mjs`: Asserts that scripts never write outside the resolved Data Root.
- `test-all.mjs`: Comprehensive test runner discovering all `tests/**/*.test.mjs` files.
- `updater-migration-tests.mjs`: Asserts backward compatibility and Data Contract preservation across versions.

---

## 9. Data Contract Boundary Reference

```
┌────────────────────────────────────────────────────────┐
│ USER LAYER (Candidate Ground Truth — Never Overwritten)│
│                                                        │
│ cv.md                      article-digest.md           │
│ config/profile.yml         config/cv-facts.json        │
│ modes/_profile.md          modes/_custom.md            │
│ data/applications.md       data/status-log.tsv         │
│ data/pipeline.md           data/scan-history.tsv       │
│ reports/*.md               output/*.pdf                │
│ interview-prep/*.md        batch/tracker-additions/    │
└───────────────────────────┬────────────────────────────┘
                            │ Read & Written By
┌───────────────────────────▼────────────────────────────┐
│ SYSTEM LAYER (Tooling & Logic — Safely Auto-Updatable) │
│                                                        │
│ modes/*.md (System Prompts) providers/*.mjs (Scrapers) │
│ *.mjs (Root CLI Scripts)    lib/*.mjs (Utilities)      │
│ dashboard/* (Go TUI)        web/* (Next.js 16 Web UI)  │
│ templates/* (CV Templates)  fonts/* (OFL Fonts)        │
│ docs/* (Documentation)      tests/* (Test Suites)      │
└────────────────────────────────────────────────────────┘
```
