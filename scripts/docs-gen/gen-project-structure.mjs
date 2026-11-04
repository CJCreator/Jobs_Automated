import fs from 'node:fs';

const projectStructure = `# Project Structure — career-ops

This document provides a comprehensive map of the entire \`career-ops\` repository (~3,080+ files, 1,950+ ESM scripts, multi-language interfaces, and test suites).

---

## High-Level Directory Overview

\`\`\`
career-ops/
├── .agents/                 # Open Agent Skill Standard definition (.agents/skills/career-ops/SKILL.md)
├── batch/                   # Headless batch processing orchestrator & parallel worker prompts
├── config/                  # Candidate configuration templates (profile.yml, cv-facts.json)
├── dashboard/               # Standalone Go Terminal TUI (Charm Bubbletea)
├── data/                    # User Layer: Canonical tracker (applications.md), status ledger, pipeline
├── docs/                    # Complete Documentation Suite (Product, Arch, Dev, Frontend, Backend, AI, Testing, DevOps, Biz)
│   ├── product/             # PRD, Vision, Personas, User Journeys, Competitive Analysis, Roadmap, Specs
│   ├── architecture/        # System, Frontend, Backend, Database, AI, Agent, Security, Infra Architecture
│   ├── development/         # Setup, Local Dev, Standards, Branching, Contributing, Env Vars, API Guide
│   ├── frontend/            # Design System, Component Library, State Management, Routing, Dashboard Design
│   ├── backend/             # API Reference, Service Architecture, Database Schema, Authentication
│   ├── ai/                  # Prompt Library, Agent Workflows, LLM Architecture, Eval Framework, RAG, Tool Calling
│   ├── testing/             # Testing Strategy, Unit, Integration, E2E Visual, Performance
│   ├── deployment/          # Deployment Guide, CI/CD, Monitoring, Scaling, Disaster Recovery
│   └── business/            # Monetization, Pricing, Growth Loops, KPI Framework
├── fonts/                   # Bundled OFL fonts for ATS PDF rendering (Space Grotesk, DM Sans)
├── interview-prep/          # User Layer: Accumulated STAR story bank & company-specific dossiers
├── lib/                     # Core backend libraries (locks, privacy guards, path resolvers, token trackers)
├── modes/                   # AI Agent brain: Modular markdown evaluation & tailoring prompts
├── output/                  # User Layer: Generated tailored CVs (PDF, HTML, LaTeX)
├── providers/               # 60+ zero-token public ATS scrapers (Greenhouse, Ashby, Lever, Workday, etc.)
├── reports/                 # User Layer: 8-block (A-H) job evaluation dossiers
├── scripts/                 # Utility scripts (syntax checkers, docs generators)
├── templates/               # ATS CV templates (HTML, LaTeX) & status definitions (states.yml)
├── tests/                   # Automated test suites (*.test.mjs, provider suites, visual tests)
├── web/                     # Local-first Next.js 16 Web UI (React 19, Tailwind CSS v4)
├── *.mjs                    # Root CLI execution scripts (scan.mjs, tracker.mjs, generate-pdf.mjs, etc.)
├── AGENTS.md                # Master agent instruction file & behavioral rules
├── ARCHITECTURE.md          # Architectural principles & Data Contract doctrine
├── DATA_CONTRACT.md         # Definitive System Layer vs. User Layer boundary
├── README.md                # Project README & quick start guide
└── update-system.mjs        # Self-updating engine preserving User Layer data
\`\`\`

---

## Detailed Directory Decomposition

### 1. Root CLI Scripts (\`*.mjs\`)
The repository maintains its execution scripts at the flat root to ensure path stability for CLI tools, plugins, and git updaters.

| Script | Primary Responsibility |
| :--- | :--- |
| \`scan.mjs\` | Zero-token portal scanner querying configured ATS APIs in \`portals.yml\`. |
| \`scan-ats-full.mjs\` | Reverse-ATS keyword scanner sweeping entire public company datasets. |
| \`check-liveness.mjs\` | Deterministic liveness checker detecting closed postings and 404s before evaluation. |
| \`tracker.mjs\` | SQLite derived index builder and CLI query interface for \`data/applications.md\`. |
| \`set-status.mjs\` | Canonical tracker status transitioner with atomic locking and ledger appending. |
| \`generate-pdf.mjs\` | Playwright Chromium HTML-to-PDF rendering engine with ATS page budgeting. |
| \`generate-latex.mjs\` | LaTeX compiler and fact gate for typesetting academic/engineering resumes. |
| \`verify-cv-facts.mjs\` | 3,285-line deterministic anti-hallucination fact verification engine. |
| \`verify-pipeline.mjs\` | Data integrity auditor checking tracker column alignments and dead links. |
| \`openrouter-runner.mjs\`| Standalone runner for evaluating jobs via OpenRouter cloud models. |
| \`gemini-eval.mjs\` | Standalone runner for evaluating jobs via Google Gemini API. |
| \`ollama-eval.mjs\` | Standalone runner for running 100% offline evaluations via local Ollama models. |
| \`match-star.mjs\` | Matches candidate STAR behavioral stories to extracted JD requirements. |
| \`update-system.mjs\` | Self-updating engine that checks out new releases without touching user data. |
| \`doctor.mjs\` | Health diagnostics auditing Node.js version, browser dependencies, and configs. |

---

### 2. Modes Directory (\`modes/\`)
The AI reasoning engine. Prompts are organized into modular, composable markdown files.

- \`_shared.md\`: Core system rules, 5-dimension scoring rubric, spend tier model routing, anti-hallucination rules.
- \`_profile.template.md\`: Candidate target archetypes, positioning, and compensation floors.
- \`_custom.template.md\`: User-defined procedural house rules and formatting preferences.
- \`oferta.md\`: The primary 8-block (A–H) comprehensive evaluation mode.
- \`apply.md\`: Application form answer drafting and outreach email generation.
- \`cover.md\`: Bespoke, high-signal cover letter synthesis.
- \`interview.md\`: Behavioral interview preparation and company intelligence.
- \`retro.md\`: Interactive retrospective mode extracting lasting candidate corrections into rules.
- Multilingual directories (\`es/\`, \`de/\`, \`fr/\`, \`zh/\`, \`ja/\`, etc.): Localized evaluation prompts.

---

### 3. Providers Directory (\`providers/\`)
Over 60 zero-token public ATS API adapters and feed readers:

- **ATS Adapters**: \`ashby.mjs\`, \`greenhouse.mjs\`, \`lever.mjs\`, \`workday.mjs\`, \`bamboohr.mjs\`, \`smartrecruiters.mjs\`, \`teamtailor.mjs\`, \`taleo.mjs\`, \`successfactors.mjs\`, \`join.mjs\`, etc.
- **Security & Network Core**:
  - \`_ip-guard.mjs\`: DNS lookup hook blocking private IP ranges, loopback, and cloud metadata (SSRF defense).
  - \`_http.mjs\`: Bounded HTTP client enforcing timeouts, user-agents, and redirect limits.
  - \`_registry.mjs\`: Auto-discovery registry loading all provider modules dynamically.

---

### 4. Core Libraries (\`lib/\`)
Reusable utility modules supporting the CLI scripts:

- \`dir-lock.mjs\` & \`pipeline-lock.mjs\`: Cross-platform advisory file locking.
- \`pii-interceptor.mjs\`: Ambient outbound fetch monkey-patch intercepting sensitive candidate PII.
- \`privacy-guard.mjs\`: Pattern matching engine identifying telephone numbers, emails, and secrets.
- \`path-resolver.mjs\`: Precedence resolver for Data Root (\`CAREER_OPS_ROOT\`) and tracker paths.
- \`story-bank.mjs\`: STAR+R story bank parser with provenance marker enforcement (#2947).
- \`context-budget.mjs\`: Token density and context window compression utilities.

---

### 5. Web Application (\`web/\`)
Local-first web user interface built with modern standards:

- \`src/app/\`: Next.js 16 App Router pages (\`/pipeline\`, \`/explore\`, \`/cv\`, \`/analytics\`, \`/config\`).
- \`src/app/api/\`: 30+ HTTP route handlers orchestrating core Node.js scripts.
- \`src/components/ui/\`: Accessible compound components (\`tabs\`, \`drawer\`, \`toast\`, \`score-gauge\`).
- \`server.mjs\`: Custom production web server binding strictly to IPv4 loopback (\`127.0.0.1\`).

---

### 6. Terminal Dashboard (\`dashboard/\`)
Standalone terminal TUI compiled in Go:

- \`main.go\`: Charm Bubbletea event loop and application model.
- \`internal/data/\`: Direct Markdown table and status ledger parser in Go.
- \`internal/ui/screens/\`: Pipeline table view, markdown report viewer, and progress stats.

---

### 7. Documentation Suite (\`docs/\`)
Full 9-pillar enterprise documentation suite:

- \`docs/product/\`: PRD, Vision, Personas, User Journeys, Competitive Analysis, Roadmap, Specs.
- \`docs/architecture/\`: System, Frontend, Backend, Database, AI, Agent, Security, Infrastructure.
- \`docs/development/\`: Setup, Local Dev, Standards, Branching, Contributing, Env Vars, API Guide.
- \`docs/frontend/\`: Design System, Component Library, State Management, Routing, Dashboard Design.
- \`docs/backend/\`: API Reference, Service Architecture, Database Schema, Authentication.
- \`docs/ai/\`: Prompt Library, Agent Workflows, LLM Architecture, Eval Framework, RAG, Tool Calling.
- \`docs/testing/\`: Testing Strategy, Unit, Integration, E2E Visual, Performance.
- \`docs/deployment/\`: Deployment Guide, CI/CD, Monitoring, Scaling, Disaster Recovery.
- \`docs/business/\`: Monetization, Pricing Strategy, Growth Loops, KPI Framework.

---

## Data Contract Boundaries

\`\`\`
┌────────────────────────────────────────────────────────┐
│ USER LAYER (Candidate Ground Truth - Never Auto-Updated)│
│ - cv.md / article-digest.md                            │
│ - config/profile.yml / config/cv-facts.json            │
│ - modes/_profile.md / modes/_custom.md                 │
│ - data/applications.md / data/status-log.tsv           │
│ - reports/*.md / output/*.pdf                          │
│ - interview-prep/story-bank.md                         │
└───────────────────────────┬────────────────────────────┘
                            │ Read & Written By
┌───────────────────────────▼────────────────────────────┐
│ SYSTEM LAYER (Tooling & Logic - Safely Auto-Updatable) │
│ - modes/*.md (except _profile.md and _custom.md)       │
│ - *.mjs / lib/*.mjs / providers/*.mjs                  │
│ - dashboard/* / web/* / templates/*                    │
│ - AGENTS.md / docs/*                                   │
└────────────────────────────────────────────────────────┘
\`\`\`
`;

fs.writeFileSync('PROJECT_STRUCTURE.md', projectStructure.trim() + '\n', 'utf8');
console.log('Generated: PROJECT_STRUCTURE.md');

