<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/wordmark-dark.svg"><img src="docs/wordmark-light.svg" alt="career-ops" width="250" height="56"></picture></p>

<p align="center">The open-source AI job search agent.</p>

<p align="center">
  <a href="README.md">English</a> |
  <a href="README.es.md">Español</a> |
  <a href="README.de.md">Deutsch</a> |
  <a href="README.fr.md">Français</a> |
  <a href="README.pt-BR.md">Português (Brasil)</a> |
  <a href="README.ko-KR.md">한국어</a> |
  <a href="README.ja.md">日本語</a> |
  <a href="README.cn.md">简体中文</a> |
  <a href="README.zh-TW.md">繁體中文</a> |
  <a href="README.ua.md">Українська</a> |
  <a href="README.ru.md">Русский</a> |
  <a href="README.pl.md">Polski</a> |
  <a href="README.da.md">Dansk</a> |
  <a href="README.ta.md">தமிழ்</a> |
  <a href="README.ar.md">العربية</a> |
  <a href="README.hi.md">हिन्दी</a> |
  <a href="README.tr.md">Türkçe</a> |
  <a href="README.vi.md">Tiếng Việt</a> |
  <a href="README.id.md">Bahasa Indonesia</a>
</p>

<!-- The non-breaking spaces (&nbsp;) and word joiners (&#8288;) below decide where each line wraps on a phone. Keep them when editing. -->

<p align="center"><a href="https://github.com/santifer"><img src="docs/avatar-santifer.png" width="48" height="48" align="middle" alt="Santiago Fernández de Valderrama Aparicio"></a>&nbsp;&nbsp;Created by <a href="https://github.com/santifer"><strong>@santifer</strong></a>, with&nbsp;&nbsp;<a href="https://github.com/career-ops-hq/career-ops#builders"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/builders-stack-dark.svg"><img src="docs/builders-stack-light.svg" alt="" height="32" align="middle"></picture></a>&nbsp;&nbsp;<a href="https://github.com/career-ops-hq/career-ops#builders">700+ contributors</a></p>

<p align="center">
<strong>Months of sending CVs into&nbsp;silence.</strong><br>
So I built the filter I&nbsp;needed.
</p>

<p align="center">
<strong>740&nbsp;listings&nbsp;evaluated. 68&nbsp;applied. 12&nbsp;interviews.&nbsp;1&nbsp;offer.</strong><br>
I was its first user. I got the&nbsp;job. Then&nbsp;I&nbsp;open-&#8288;sourced&nbsp;it.
</p>

<p align="center">
Paste a job. On your machine, it tells you if it's still&nbsp;open and if it&nbsp;fits.<br>
It tailors your CV and drafts your&nbsp;answers. <strong>You&nbsp;press&nbsp;Submit.</strong>
</p>

<p align="center">
  <img src="docs/demo.gif" alt="The author's own search in the career-ops dashboard: scored listings, a red count of the ones marked do not apply, then a full evaluation report" width="800">
</p>

<p align="center"><sub>My own search, partway through, with&nbsp;the&nbsp;UI&nbsp;in&nbsp;Spanish.</sub></p>

<p align="center">
  Companies use AI to filter candidates.<br>
  <strong>I just gave candidates AI&nbsp;to&nbsp;<em>choose</em>&nbsp;companies.</strong>
</p>

<p align="center">
  Six months later, <strong>I left that job.</strong><br>
  Now we build career-ops, so&nbsp;you&nbsp;can&nbsp;land&nbsp;yours.
</p>

<p align="center">
  <a href="HIRED.md"><img src="docs/hired-wall.svg" alt="Hired stories you can open and read" width="800"></a>
</p>

<p align="center"><sub>Over <strong>110+ engineers, PMs, and architects</strong> landed offers through career-ops. Read their stories in <a href="HIRED.md">HIRED.md</a>.</sub></p>

<p align="center">
  <a href="https://wired.com.gr/article/to-ai-ergaleio-pou-fernei-epanastasi-ston-tropo-pou-psachnoume-douleia/" rel="noopener noreferrer nofollow"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/press/wired-dark.svg"><img src="docs/press/wired.svg" alt="WIRED" height="32"></picture></a>
  &nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://www.businessinsider.com/how-i-built-tool-filter-job-listings-landed-head-ai-2026-4" rel="noopener noreferrer nofollow"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/press/business-insider-dark.svg"><img src="docs/press/business-insider.svg" alt="Business Insider" height="32"></picture></a>
  &nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://elpais.com/tecnologia/2026-04-20/un-programador-espanol-crea-un-filtro-con-ia-para-encontrar-trabajo-y-lo-libera-gratis.html" rel="noopener noreferrer nofollow"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/press/el-pais-dark.svg"><img src="docs/press/el-pais.svg" alt="EL PAÍS" height="32"></picture></a>
  &nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://www.genbeta.com/inteligencia-artificial/este-desarrollador-espanol-consiguio-su-puesto-como-jefe-ia-usando-esta-herramienta-codigo-abierto-que-el-mismo-creo" rel="noopener noreferrer nofollow"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/press/genbeta-dark.svg"><img src="docs/press/genbeta.svg" alt="Genbeta" height="32"></picture></a>
</p>

<p align="center">
  <a href="https://www.producthunt.com/products/santifer-io?utm_source=badge-featured&utm_medium=badge" rel="noopener noreferrer"><img src="docs/press/producthunt.svg" alt="Featured on Product Hunt" width="206" height="54"></a>
</p>

---

## What is career-ops?

`career-ops` is a private, local-first candidate operations system. It automates every step of the job search—from discovering openings via direct ATS APIs to validating posting liveness, detecting ghost postings, generating fact-checked resumes, and tracking progress—directly on your machine.

### The Four Tenets
1. **Local-First & Sovereign**: Runs on your files. No candidate data ever leaves your computer without your explicit authorization.
2. **AI-Agnostic Engine**: Prompts live in Markdown files under `modes/`. Executes inside Claude Code, Cursor, Codex, OpenCode, Antigravity, Gemini CLI, Grok Build CLI, or offline with local Ollama models.
3. **Deterministic Fact Grounding**: Generative AI is strictly bounded by `verify-cv-facts.mjs`. It will never invent metrics, skills, or employment history.
4. **Human-in-the-Loop (HITL)**: career-ops prepares, scores, filters, and drafts. You review, verify, and click Submit. It never spams applications.

---

## Executive Feature Matrix

| Capability | What it does | Engineering Mechanism |
| :--- | :--- | :--- |
| **Zero-Token Discovery** | Finds jobs from Greenhouse, Ashby, Lever, Workday, etc. without LLM API costs. | 60+ modular REST/JSON/RSS adapters in `providers/`. |
| **Deterministic Liveness Gate** | Verifies a posting is live before spending tokens on evaluation. | `check-liveness.mjs` inspects HTTP status and DOM elements. |
| **Anti-Ghost Legitimacy (Block G)** | Flags scam jobs, zombie postings, and repost churn. | Cross-references posting age, repost cadence, and layoff alerts. |
| **Holistic 5-Dimension Scoring** | Evaluates CV match, North Star fit, comp, culture, and red flags (1.0–5.0). | Integrated qualitative judgment in `modes/_shared.md`. |
| **Fact-Gated Tailoring** | Tailors CV phrasing while strictly forbidding hallucinations. | `verify-cv-facts.mjs` verifies every metric against `cv.md`. |
| **ATS-Parseable PDF & LaTeX** | Generates single-column, ATS-optimized PDFs and Overleaf-ready LaTeX. | `generate-pdf.mjs` (Playwright Chromium) and `generate-latex.mjs`. |
| **STAR Story Bank with Provenance** | Prepares interview responses grounded in your real achievements. | `story-bank.mjs` with strict provenance markers (#2947). |
| **Derived CQRS SQLite Index** | Blazing-fast querying over Markdown tracker tables. | Native `node:sqlite` derived cache in `tracker.mjs` (RFC #918). |

---

## Quick Start (Installation)

### Prerequisites
- **Node.js**: `^22.13.0 || >=23.4.0`
- **Git**: For version tracking and safe system updates
- **AI Coding CLI**: Claude Code, Cursor, Codex, Antigravity CLI, or OpenCode

```bash
# 1. Clone the repository
git clone https://github.com/career-ops-hq/career-ops.git
cd career-ops

# 2. Install dependencies & Playwright Chromium
npm install

# 3. Verify system health
npm run doctor

# 4. Initialize configuration templates
cp .env.example .env
cp config/profile.example.yml config/profile.yml
cp cv-facts.example.json config/cv-facts.json
```

### Initial Setup
1. Author your master CV in `cv.md` (Markdown format, chronological experience).
2. Configure your target archetypes, location rules, and comp floors in `config/profile.yml`.
3. Add curated companies or job boards to `portals.yml`.

---

## Everyday Usage

Paste a job posting URL or raw JD text directly into your AI coding CLI:

```bash
# In Claude Code, Antigravity, or OpenCode:
/career-ops oferta https://jobs.ashbyhq.com/company/job-id

# Plain language in any CLI (Cursor, Codex, Grok, Qwen):
"Evaluate this JD with career-ops: https://jobs.lever.co/company/job-id"
```

The system will:
1. Confirm the posting is live (skips dead links automatically).
2. Screen for blacklist and candidate dealbreakers.
3. Deliver a comprehensive 8-block evaluation (A–H) with a holistic 1–5 score.
4. If score $\ge 4.0$, tailor your CV and compile a verified PDF into `output/`.
5. Record the application row in `data/applications.md` and transition ledger.

### Command Reference

| Stage | Mode / Script | Action |
| :--- | :--- | :--- |
| **Discovery** | `scan` / `scan:full` | Scans configured portals or sweeps full ATS public databases. |
| **Triage** | `pipeline` | Evaluates pending URLs in `data/pipeline.md` sequentially. |
| **Evaluation** | `oferta` / `job` | Full 8-block analysis (CV match, comp, culture, ghost check). |
| **Application** | `apply` | Generates verified form answers and outreach emails. |
| **Tracking** | `tracker` | Inspects and filters your application pipeline. |
| **Cadence** | `followup` | Identifies overdue follow-ups and drafts polite check-in notes. |
| **Interview** | `interview` | Prepares company-specific STAR stories and red-flag questions. |
| **Learning** | `retro` | Captures your feedback and updates your persistent house rules. |

---

## User Interfaces

### 1. Terminal Dashboard (Go Bubbletea TUI)
For ultra-fast, keyboard-driven navigation:
```bash
npm run serve:dashboard
```
Features 10 status filter tabs, 8 sort modes, lazy-loaded report previews, and inline status updates.

### 2. Modern Web UI (Next.js 16 + React 19)
For visual Kanban boards, Markdown CV editing, and rich analytics:
```bash
cd web
npm install
npm run build
npm start
# Open http://localhost:3000
```

---

## Architecture & Data Contract

career-ops is built on a strict boundary between the **System Layer** (the versioned engine) and the **User Layer** (your private data):

```mermaid
flowchart TD
    subgraph UserLayer ["User Layer (Ground Truth — Never Auto-Updated)"]
        CV["cv.md / article-digest.md"]
        Config["config/profile.yml / cv-facts.json"]
        Data["data/applications.md / status-log.tsv"]
        Reports["reports/*.md / output/*.pdf"]
        Stories["interview-prep/story-bank.md"]
    end

    subgraph CoreEngine ["System Layer (Versioned Tooling — Auto-Updatable)"]
        Scanners["providers/*.mjs (60+ ATS Adapters)"]
        Modes["modes/*.md (AI Prompts & Rubrics)"]
        Scripts["*.mjs (Core CLI Runtime)"]
        Web["web/ (Next.js 16 Web UI)"]
        TUI["dashboard/ (Go TUI)"]
    end

    CoreEngine -->|Reads & Writes| UserLayer
    UserLayer -.->|Never Overwritten by| Updater["update-system.mjs"]
```

For full architectural specifications, see:
- High-Level Doctrine: [ARCHITECTURE.md](ARCHITECTURE.md)
- Data Contract Boundary: [DATA_CONTRACT.md](DATA_CONTRACT.md)
- Runtime Flows: [docs/architecture/SystemArchitecture.md](docs/architecture/SystemArchitecture.md)

---

## Comprehensive Documentation Suite

| Category | Focus | Key Documents |
| :--- | :--- | :--- |
| **Product** | Vision, Strategy, Specs | [PRD](docs/product/PRD.md) · [Vision](docs/product/Vision.md) · [Personas](docs/product/UserPersonas.md) · [Roadmap](docs/product/Roadmap.md) · [Competitive Analysis](docs/product/CompetitiveAnalysis.md) · [Feature Specs](docs/product/FeatureSpecifications.md) |
| **Architecture** | System & Technical Design | [System](docs/architecture/SystemArchitecture.md) · [Frontend](docs/architecture/FrontendArchitecture.md) · [Backend](docs/architecture/BackendArchitecture.md) · [Database](docs/architecture/DatabaseArchitecture.md) · [AI](docs/architecture/AIArchitecture.md) · [Agent](docs/architecture/AgentArchitecture.md) · [Security](docs/architecture/SecurityArchitecture.md) · [Infra](docs/architecture/InfrastructureArchitecture.md) |
| **Development** | Setup & Standards | [Setup Guide](docs/development/SetupGuide.md) · [Local Dev](docs/development/LocalDevelopment.md) · [Coding Standards](docs/development/CodingStandards.md) · [Branching](docs/development/BranchingStrategy.md) · [Contributing](docs/development/ContributionGuide.md) · [Env Vars](docs/development/EnvironmentVariables.md) · [API Guide](docs/development/APIDevelopmentGuide.md) |
| **Frontend** | Web UI & Design Tokens | [Design System](docs/frontend/DesignSystem.md) · [Component Library](docs/frontend/ComponentLibrary.md) · [State Management](docs/frontend/StateManagement.md) · [Routing](docs/frontend/RoutingArchitecture.md) · [Dashboard TUI](docs/frontend/DashboardDesign.md) |
| **Backend** | Services & API Reference | [API Reference](docs/backend/APIReference.md) · [Service Architecture](docs/backend/ServiceArchitecture.md) · [Database Schema](docs/backend/DatabaseSchema.md) · [Authentication](docs/backend/Authentication.md) |
| **AI System** | Prompts, Agents & Gates | [Prompt Library](docs/ai/PromptLibrary.md) · [Agent Workflows](docs/ai/AgentWorkflows.md) · [LLM Routing](docs/ai/LLMArchitecture.md) · [Evaluation Rubric](docs/ai/EvaluationFramework.md) · [Local RAG](docs/ai/RAGArchitecture.md) · [Tool Calling](docs/ai/ToolCallingArchitecture.md) |
| **Testing** | QA Strategy & Test Suites | [Testing Strategy](docs/testing/TestingStrategy.md) · [Unit Testing](docs/testing/UnitTesting.md) · [Integration](docs/testing/IntegrationTesting.md) · [E2E Visual](docs/testing/E2ETesting.md) · [Performance](docs/testing/PerformanceTesting.md) |
| **Deployment** | DevOps, CI/CD, Scaling | [Deployment Guide](docs/deployment/DeploymentGuide.md) · [CI/CD](docs/deployment/CI-CD.md) · [Monitoring](docs/deployment/Monitoring.md) · [Scaling](docs/deployment/Scaling.md) · [Disaster Recovery](docs/deployment/DisasterRecovery.md) |
| **Business** | Commercial & Growth | [Monetization](docs/business/Monetization.md) · [Pricing Strategy](docs/business/PricingStrategy.md) · [Growth Loops](docs/business/GrowthLoops.md) · [KPI Framework](docs/business/KPIFramework.md) |
| **Structure** | Full Repository Map | [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) |

---

## Community & Contributing

`career-ops` is built by over 700+ open-source engineers, career coaches, and job seekers.
- **Contributing**: Read the [Contribution Guide](docs/development/ContributionGuide.md) and [ADDING_A_PROVIDER.md](providers/ADDING_A_PROVIDER.md).
- **Security**: Review our SSRF and PII policies in [docs/architecture/SecurityArchitecture.md](docs/architecture/SecurityArchitecture.md) and [SECURITY.md](SECURITY.md).
- **Licensing**: Open-source under the [MIT License](LICENSE).
