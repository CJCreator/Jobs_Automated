import fs from 'node:fs';
import path from 'node:path';

function writeDoc(relPath, content) {
  const fullPath = path.resolve(relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content.trim() + '\n', 'utf8');
  console.log(`Generated: ${relPath}`);
}

// 1. SystemArchitecture.md
writeDoc('docs/architecture/SystemArchitecture.md', `# System Architecture — career-ops

## Purpose
Documents the high-level architecture, subsystem boundaries, data contract separation, and operational topology of career-ops.

## Scope
Encompasses the CLI core, Go TUI dashboard, Next.js Web UI, discovery scrapers, and AI agent execution environments.

## Overview
career-ops is engineered around a **local-first, deterministic-gated architecture**. The local file system (Markdown, YAML, TSV) serves as the canonical source of truth, while fast indices (SQLite) and presentation surfaces (Next.js, Bubbletea) act as derived views. Generative AI is treated as an untrusted reasoning worker, bounded strictly by pre-flight validation gates and post-generation fact verifiers.

## Diagrams

\`\`\`mermaid
graph TD
    subgraph UI_Layer ["Presentation Surfaces"]
        WebUI["Web App (Next.js 16 / React 19)"]
        GoTUI["Go Terminal TUI (Bubbletea)"]
        CLIRunner["CLI Scripts / Batch Shell"]
    end

    subgraph Core_Engine ["Deterministic Core Engine (Node.js ESM)"]
        Scanners["Discovery Scanners (providers/*)"]
        LivenessGate["Liveness & Dealbreaker Gate"]
        FactGate["verify-cv-facts & AST Checks"]
        PDFGen["Playwright PDF Engine"]
        TrackerEngine["tracker.mjs & Lock Manager"]
    end

    subgraph Agent_Layer ["AI Reasoning Layer (Modes)"]
        PromptEngine["modes/*.md (_shared.md)"]
        LLMConnectors["Claude / OpenRouter / Ollama / Gemini"]
    end

    subgraph Storage_Layer ["Data Contract & Canonical Storage"]
        UserLayer[("User Layer (cv.md, profile.yml, data/*)")]
        DerivedDB[("Derived SQLite (applications.db)")]
    end

    WebUI --> Core_Engine
    GoTUI --> Storage_Layer
    CLIRunner --> Core_Engine
    Core_Engine --> Agent_Layer
    Core_Engine --> Storage_Layer
    TrackerEngine --> DerivedDB
\`\`\`

## Technical Details

### Subsystem Decomposition
1. **Presentation Layer**:
   - \`web/\`: Next.js 16 with App Router, Server Actions, Tailwind CSS v4.
   - \`dashboard/\`: Standalone Go binary using Charm's Bubbletea framework.
   - Direct CLI: Node.js scripts executed directly or via AI coding CLI tools (Claude Code, Cursor, Antigravity, OpenCode).
2. **Deterministic Core Layer**:
   - Zero-token ATS scrapers (\`providers/\`).
   - Liveness and scam verification (\`check-liveness.mjs\`).
   - Fact verification engine (\`verify-cv-facts.mjs\`).
   - Concurrency locking (\`lib/dir-lock.mjs\`, \`pipeline-lock.mjs\`).
3. **Agent & Prompt Layer**:
   - Modular markdown prompts (\`modes/\`) specifying evaluation blocks A through H.
4. **Storage Layer**:
   - Permanent canonical files: \`data/applications.md\`, \`data/status-log.tsv\`.
   - Ephemeral index: \`data/applications.db\` (via \`node:sqlite\`).

## Best Practices
- Never bypass the Data Contract: system updates must never write to the User Layer.
- Always use \`writeFileAtomic\` to prevent corrupted states during concurrent access.

## Examples
\`\`\`bash
# Run deterministic system sanity check
npm run verify
\`\`\`

## Future Enhancements
- Transition to a formal monorepo structure with shared TypeScript definitions.
`);

// 2. FrontendArchitecture.md
writeDoc('docs/architecture/FrontendArchitecture.md', `# Frontend Architecture — career-ops

## Purpose
Specifies the architecture, component hierarchy, rendering patterns, and data synchronization of the \`@career-ops/web\` application.

## Scope
Applies to \`web/\` (Next.js 16, React 19, Tailwind CSS v4, Lucide).

## Overview
The web interface is designed as an interactive, local-first presentation layer that operates directly on the local candidate workspace. It features zero client-side tracking, full SSR with React Server Components, and optimistic UI mutations for pipeline tracking.

## Diagrams

\`\`\`mermaid
flowchart TD
    subgraph Browser ["Client Browser"]
        Kanban["Kanban Board / Table View"]
        Studio["Job & CV Studio"]
        Toast["useToast System"]
    end

    subgraph NextServer ["Next.js Server (localhost:3000)"]
        RSC["React Server Components"]
        API["Route Handlers (src/app/api/*)"]
        ServerActions["Server Actions (src/app/actions/*)"]
    end

    subgraph LocalSystem ["Local File System & Core"]
        TrackerFile["data/applications.md"]
        ReportFiles["reports/*.md"]
        CoreExec["CLI Engine (set-status.mjs, etc.)"]
    end

    Kanban -->|Optimistic Update| ServerActions
    ServerActions -->|Executes| CoreExec
    CoreExec -->|Atomic Write| TrackerFile
    API -->|Direct Read| ReportFiles
    RSC -->|Streams UI| Browser
\`\`\`

## Technical Details

### Tech Stack
- **Framework**: Next.js 16.4.1 (App Router).
- **Core Library**: React 19.2.5.
- **Styling**: Tailwind CSS v4.2.2 with custom design tokens.
- **Icons**: Lucide React.
- **PDF Rendering**: PDF.js for canvas-based in-browser preview.

### State & Data Synchronization
- **Server-Driven Revalidation**: Mutations invoke Next.js \`revalidatePath\` to refresh cached filesystem reads.
- **Optimistic UI Updates**: Kanban cards transition status immediately in the UI while the background API writes to \`data/applications.md\` via \`set-status.mjs\`.
- **Direct File System Access**: Server components directly import \`fs\` to stream Markdown and TSV data into React components without intermediate network serialization.

## Best Practices
- Keep client components at the leaves of the render tree.
- Ensure all API routes validate inputs and bind exclusively to IPv4 loopback (\`127.0.0.1\`).

## Examples
\`\`\`typescript
// Server Action executing atomic status shift
export async function updateApplicationStatus(id: number, status: string) {
  'use server';
  await execAsync(\`node set-status.mjs \${id} \${status}\`);
  revalidatePath('/pipeline');
}
\`\`\`

## Future Enhancements
- WebSockets / Server-Sent Events (SSE) for live streaming batch evaluation logs.
`);

// 3. BackendArchitecture.md
writeDoc('docs/architecture/BackendArchitecture.md', `# Backend Architecture — career-ops

## Purpose
Details the execution model, service boundaries, process isolation, and CLI dispatching mechanics of the Node.js backend.

## Scope
Covers root-level \`*.mjs\` scripts, \`lib/\` utilities, and child-process workers.

## Overview
The backend operates as a decoupled collection of single-purpose ESM modules. Unlike traditional monolithic servers, career-ops executes scripts via on-demand CLI invocation, API endpoints, or headless batch workers, coordinating state through filesystem locks and append-only ledgers.

## Diagrams

\`\`\`mermaid
flowchart LR
    Caller["Caller: CLI / API / Agent"] --> Dispatcher["Entrypoint Script (e.g. tracker.mjs)"]
    
    subgraph Execution_Pipeline ["Core Pipeline"]
        Dispatcher --> Lock["dir-lock.mjs / pipeline-lock.mjs"]
        Lock --> Resolver["path-resolver.mjs (Data Root)"]
        Resolver --> Processor["Domain Logic (Scrape / Evaluate / Format)"]
        Processor --> AtomicWrite["writeFileAtomic (Temp -> Rename)"]
    end

    AtomicWrite --> Storage[("Candidate Storage / Ledger")]
\`\`\`

## Technical Details

### Key Backend Subsystems
1. **Path Resolution Engine (\`path-resolver.mjs\`)**:
   - Dynamically resolves the User Layer root using environment variables (\`CAREER_OPS_ROOT\`), marker files (\`.career-ops-data\`), or falls back to repository root.
   - Refuses paths that resolve inside auto-updated plugin directories.
2. **Process Concurrency & Locks (\`lib/dir-lock.mjs\`)**:
   - Implements cross-platform advisory file locking with exponential backoff.
   - Prevents race conditions when multiple headless workers write to \`applications.md\` simultaneously.
3. **Atomic File I/O (\`tracker-utils.mjs\`)**:
   - Employs write-temp-then-rename semantics to ensure Markdown tables and TSV files are never left in a corrupted state if a process terminates abruptly.
4. **Child Process Execution (\`lib/cli-launch.mjs\`)**:
   - Manages spawning of AI coding CLIs (Claude, Grok, OpenCode) with sanitized environment variables and timeout supervision.

## Best Practices
- Never use \`__dirname\` directly; always resolve through \`getCareerOpsRoot()\`.
- Always handle process termination signals (\`SIGINT\`, \`SIGTERM\`) to clean up advisory lock files.

## Examples
\`\`\`javascript
import { withPipelineLock } from './pipeline-lock.mjs';
import { writeFileAtomic } from './tracker-utils.mjs';

await withPipelineLock(async () => {
  writeFileAtomic(targetPath, updatedContent);
});
\`\`\`

## Future Enhancements
- Shared worker daemon pool to eliminate Node.js process boot overhead.
`);

// 4. DatabaseArchitecture.md
writeDoc('docs/architecture/DatabaseArchitecture.md', `# Database & Storage Architecture — career-ops

## Purpose
Defines the dual-layer storage model: canonical human-readable flat files and the derived SQLite index.

## Scope
Covers \`data/applications.md\`, \`data/status-log.tsv\`, and the \`data/applications.db\` SQLite cache (RFC #918).

## Overview
In accordance with settled architecture doctrine (RFC #918), human-readable, git-diffable Markdown files are the **permanent ground truth**. Databases exist solely as derived read-caches that can be deleted at any moment without data loss.

## Diagrams

\`\`\`mermaid
flowchart TD
    subgraph GroundTruth ["Canonical Ground Truth (User Layer)"]
        MDTable["data/applications.md\n(Git-diffable Table)"]
        TSVLedger["data/status-log.tsv\n(Append-Only Audit Ledger)"]
        PipelineMD["data/pipeline.md\n(URL Inbox)"]
    end

    subgraph DerivedCache ["Derived Layer (Disposable)"]
        SyncEngine["tracker.mjs sync Engine"]
        SQLiteDB[("SQLite Cache (applications.db)\nvia node:sqlite")]
    end

    subgraph Consumers ["Readers & Analytics"]
        WebReader["Web API / Analytics"]
        TUIReader["Go Dashboard"]
        FunnelEngine["funnel-velocity.mjs"]
    end

    MDTable --> SyncEngine
    TSVLedger --> SyncEngine
    SyncEngine -->|Auto-Rebuilds on Hash Change| SQLiteDB
    SQLiteDB --> WebReader
    MDTable --> TUIReader
    TSVLedger --> FunnelEngine
\`\`\`

## Technical Details

### Canonical Files Schema
1. **Applications Table (\`data/applications.md\`)**:
   - Columns: \`# | Date | Company | Role | Status | Score | PDF | Report | Notes | URL\`
   - Valid statuses defined in \`templates/states.yml\` (e.g., Evaluated, Applied, Responded, Interview, Offer, Rejected, Discarded).
2. **Status Transition Ledger (\`data/status-log.tsv\`)**:
   - Columns: \`{tracker_id}\t{date}\t{from_status}\t{to_status}\t{source}\t{note}\`
   - Guarantees complete auditability of application lifecycle stages.

### Derived SQLite Schema (\`data/applications.db\`)
\`\`\`sql
CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY,
  date TEXT NOT NULL,
  company TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL,
  score REAL,
  pdf_path TEXT,
  report_path TEXT,
  notes TEXT,
  url TEXT,
  hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS status_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  source TEXT NOT NULL,
  note TEXT,
  FOREIGN KEY (app_id) REFERENCES applications(id)
);
\`\`\`

## Best Practices
- Never treat SQLite as authoritative. Writes must always target \`applications.md\` and \`status-log.tsv\`.
- Run \`node tracker.mjs sync --check\` to detect column drift or encoding corruption.

## Examples
\`\`\`bash
# Query derived index with high-performance filter
node tracker.mjs query --status Interview --min-score 4.0 --json
\`\`\`

## Future Enhancements
- Parquet export for local analytics and historical trend modeling.
`);

// 5. AIArchitecture.md
writeDoc('docs/architecture/AIArchitecture.md', `# AI Architecture — career-ops

## Purpose
Specifies the AI system architecture, prompt inheritance hierarchies, model routing by spend tier, and context budgeting mechanisms.

## Scope
Covers \`modes/\`, \`lib/context-budget.mjs\`, \`lib/llm-outbound.mjs\`, and model evaluators.

## Overview
career-ops rejects black-box LLM autonomy in favor of structured, deterministic AI reasoning. Prompts are organized in strict hierarchical markdown files, token usage is actively budgeted, and evaluations follow an immutable rubric rather than ad-hoc chat generation.

## Diagrams

\`\`\`mermaid
flowchart TD
    subgraph ContextAssembly ["Context Assembly Pipeline"]
        CV["cv.md (Candidate Facts)"]
        Digest["article-digest.md (Proof Points)"]
        JD["Cleaned Job Description"]
        Budgeter["lib/context-budget.mjs"]
    end

    subgraph PromptHierarchy ["Prompt Composition Engine"]
        Shared["modes/_shared.md\n(Scoring Rules, Anti-Slop)"]
        Profile["modes/_profile.md\n(Archetypes, Positioning)"]
        Custom["modes/_custom.md\n(Personal House Rules)"]
        Oferta["modes/oferta.md\n(Blocks A-H Structure)"]
    end

    subgraph ExecutionRouting ["Model Routing by Spend Tier"]
        Tier{"config/profile.yml: spend_tier"}
        Economy["Economy Tier\n(Haiku 5.5 / Flash)"]
        Standard["Standard Tier\n(Sonnet 5.5 / Pro)"]
        Premium["Premium Tier\n(Opus 5.5 / Thinking)"]
    end

    CV & Digest & JD --> Budgeter
    Budgeter --> PromptHierarchy
    Shared --> Profile --> Custom --> Oferta
    PromptHierarchy --> Tier
    Tier --> Economy & Standard & Premium
\`\`\`

## Technical Details

### Spend Tier Resolution
Configured in \`config/profile.yml\` under \`spend_tier\`:
- **Economy**: Fast, zero-token or low-cost evaluation (e.g., Claude Haiku, Gemini Flash, local Ollama).
- **Standard (Default)**: Balanced model (Claude Sonnet 5.5, GPT-4o).
- **Premium**: High-reasoning model with adaptive thinking (Claude Opus, Gemini Pro Extended Thinking).

### Context Budgeting & Token Management (\`lib/context-budget.mjs\`)
- Prevents context window overflows by trimming redundant job posting boilerplate (EEO statements, repetitive legal disclaimers).
- Injects candidate proof points dynamically based on semantic relevance to the target job description.

## Best Practices
- Never fabricate candidate metrics: "Keywords get reformulated, never fabricated."
- Strict adherence to the 5 scoring dimensions; avoid naive arithmetic averaging.

## Examples
\`\`\`bash
# Run local Ollama evaluation with zero external API calls
npm run ollama:eval
\`\`\`

## Future Enhancements
- Local small language model (SLM) embeddings for zero-token semantic proof point ranking.
`);

// 6. AgentArchitecture.md
writeDoc('docs/architecture/AgentArchitecture.md', `# Agent Architecture — career-ops

## Purpose
Defines the autonomous agent communication model, skill interface standard, and multi-CLI operational protocol.

## Scope
Covers \`.agents/skills/career-ops/SKILL.md\`, \`AGENTS.md\`, and subagent delegation workflows.

## Overview
career-ops follows the [open agent skill standard](https://agentskills.io). It exposes a unified skill router that allows coding agent CLIs (Claude Code, Antigravity, Cursor, Codex, OpenCode, Qwen, Grok) to invoke system capabilities deterministically.

## Diagrams

\`\`\`mermaid
sequenceDiagram
    autonumber
    actor CLI as Agent CLI (Claude/Antigravity)
    participant Router as .agents/skills/career-ops/SKILL.md
    participant Mode as Target Mode (e.g. modes/oferta.md)
    participant Tool as System Tools (*.mjs)
    participant User as Candidate (HITL)

    CLI->>Router: Invoke /career-ops <mode> <args>
    Router->>Mode: Load specific instructions & gates
    Mode->>Tool: Execute deterministic pre-checks (liveness, blacklist)
    alt Gate Interruption (Dealbreaker or Blacklist)
        Tool-->>CLI: Request user confirmation
        CLI->>User: "Target broke rule X. Proceed anyway?"
        User-->>CLI: Explicit Yes / No
    end
    Mode->>Tool: Generate Report & Verified PDF
    Tool-->>CLI: Return execution summary
\`\`\`

## Technical Details

### Unified Skill Router (\`SKILL.md\`)
- Maps human or agent intents to exact operational modes:
  - \`scan\`: Discovers listings across configured portals.
  - \`oferta\` / \`job\`: Full 8-block evaluation and fit scoring.
  - \`apply\`: Prepares tailored application answers and resumes.
  - \`interview\`: Matches STAR stories to JD requirements.
  - \`retro\`: Extracts house rules from candidate feedback.

### Multi-CLI Entry Wrappers
- \`CLAUDE.md\`, \`CODEX.md\`, \`OPENCODE.md\`: Lightweight shims routing into canonical \`AGENTS.md\`.
- \`GEMINI.md\`: Legacy no-op guard preventing duplicate prompt loading in Antigravity.

## Best Practices
- Headless and delegated workers must never write to \`modes/_profile.md\` or \`modes/_custom.md\`; persistent preference changes must be confirmed interactively in \`retro\` mode.

## Examples
\`\`\`bash
# Headless one-shot agent execution
claude -p "Run career-ops oferta https://jobs.lever.co/company/job-id"
\`\`\`

## Future Enhancements
- Multi-agent coordination with specialized subagents for company background research and salary verification.
`);

// 7. SecurityArchitecture.md
writeDoc('docs/architecture/SecurityArchitecture.md', `# Security Architecture — career-ops

## Purpose
Specifies the security controls, SSRF protections, PII interception, and untrusted content boundaries in career-ops.

## Scope
Covers \`providers/_ip-guard.mjs\`, \`lib/pii-interceptor.mjs\`, \`lib/privacy-guard.mjs\`, and execution sandboxing.

## Overview
Because career-ops scrapes external job boards and interacts with external LLM APIs, it employs defense-in-depth security measures to protect local networks from SSRF attacks, prevent prompt injections from malicious job postings, and safeguard personal candidate data.

## Diagrams

\`\`\`mermaid
flowchart TD
    subgraph OutboundFetch ["Outbound Network Pipeline"]
        Request["fetch(url)"] --> PIIFilter["lib/pii-interceptor.mjs\n(Ambient PII Guard)"]
        PIIFilter -->|Contains Unredacted PII| AbortPII["Abort: PrivacyGuardError"]
        PIIFilter -->|Safe or Redacted| DNSHook["providers/_ip-guard.mjs\n(DNS Lookup Hook)"]
        
        DNSHook --> Resolver["Resolve IP Address"]
        Resolver --> IPCheck{"Is Resolved IP Public?"}
        IPCheck -->|RFC1918 / Loopback / Cloud Metadata| AbortSSRF["Abort: Blocked Address (SSRF)"]
        IPCheck -->|Valid Public IP| DialSocket["net.connect() to Remote ATS"]
    end
\`\`\`

## Technical Details

### 1. SSRF & DNS Rebinding Hardening (\`providers/_ip-guard.mjs\`)
- **DNS Hooking**: Monkey-patches \`node:dns.lookup\` inside an \`AsyncLocalStorage\` context.
- **Blocked Ranges**:
  - \`127.0.0.0/8\` (Loopback)
  - \`10.0.0.0/8\`, \`172.16.0.0/12\`, \`192.168.0.0/16\` (RFC1918 Private Networks)
  - \`169.254.169.254/32\` (AWS/GCP/Azure Cloud Instance Metadata)
  - \`::1/128\`, \`fc00::/7\`, \`fe80::/10\` (IPv6 Private / Link-Local)

### 2. Ambient PII Interceptor (\`lib/pii-interceptor.mjs\`)
- Intercepts all calls to external LLMs.
- Default Mode: **BLOCK**. If candidate telephone numbers, physical addresses, or custom secrets are detected in outbound prompts, the call fails immediately.
- Optional Mode: **REDACT** (\`PRIVACY_REDACT=1\`). Replaces sensitive strings with unique placeholder tokens (\`{{PRIVACY_REDACTED_1}}\`) and re-hydrates responses on receipt.

### 3. Untrusted Content Boundary
- Job postings, email replies, and ATS application pages are strictly treated as **untrusted data, never instructions**. Any embedded imperative commands (e.g. "Ignore previous instructions") are quoted as Block G anomalies and ignored.

## Best Practices
- Never disable SSRF or PII guards in production.
- Keep all local web server ports bound strictly to \`127.0.0.1\`.

## Examples
- Unit tests in \`tests/providers/ats-ssrf-hardening.test.mjs\`.

## Future Enhancements
- Sandboxed isolated container execution for headless browser extraction.
`);

// 8. InfrastructureArchitecture.md
writeDoc('docs/architecture/InfrastructureArchitecture.md', `# Infrastructure Architecture — career-ops

## Purpose
Details the execution environments, deployment topologies, hardware constraints, and infrastructure scaling profiles for career-ops.

## Scope
Covers local developer environments, Docker containerization, and self-hosted server topologies.

## Overview
career-ops is engineered primarily for local workstation execution, with zero external infrastructure dependencies. For power users and teams, it can be containerized and run as a private headless service.

## Diagrams

\`\`\`mermaid
flowchart TD
    subgraph Workstation ["Local Workstation Deployment (Default)"]
        NodeRuntime["Node.js 22+ Runtime"]
        PlaywrightChr["Playwright Chromium"]
        LocalFS["Local SSD (Markdown/TSV)"]
        NodeRuntime --> PlaywrightChr
        NodeRuntime --> LocalFS
    end

    subgraph Containerized ["Docker / Self-Hosted Server Topology"]
        DockerContainer["Docker Container (Debian Bookworm)"]
        AppService["Next.js Web + Background Workers"]
        VolumeMount[("Encrypted Volume Mount\n(/home/user/career-ops-data)")]
        TorProxy["Local Tor / SOCKS5 Proxy\n(Rate-Limit Mitigation)"]
        
        DockerContainer --> AppService
        AppService --> VolumeMount
        AppService --> TorProxy
    end
\`\`\`

## Technical Details

### Hardware & Runtime Requirements
- **Node.js**: \`^22.13.0 || >=23.4.0\` (requires built-in \`node:sqlite\` and strip-types support).
- **RAM**: Minimum 4GB (8GB+ recommended for parallel Playwright batch workers).
- **Storage**: < 500MB for core repository and dependencies; ~5MB per 100 evaluated job dossiers.
- **Operating Systems**: macOS (Apple Silicon / Intel), Linux (Ubuntu, Debian, Fedora, Arch, NixOS), Windows 10/11 (PowerShell & WSL2).

### Docker Infrastructure Spec
- Base image: \`node:22-bookworm-slim\`.
- System packages: \`chromium\`, \`fonts-liberation\`, \`libnss3\`.
- Non-root user: \`node\` (UID 1000).

## Best Practices
- When running in Docker, always mount the User Layer as an external volume to preserve data across container restarts.

## Examples
\`\`\`bash
# Start local development server with specific memory ceiling
NODE_OPTIONS="--max-old-space-size=4096" npm run dev
\`\`\`

## Future Enhancements
- Terraform definitions for single-click deployment to Fly.io or AWS Lightsail.
`);

console.log('Architecture docs generation complete.');
