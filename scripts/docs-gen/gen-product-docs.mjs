import fs from 'node:fs';
import path from 'node:path';

function writeDoc(relPath, content) {
  const fullPath = path.resolve(relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content.trim() + '\n', 'utf8');
  console.log(`Generated: ${relPath}`);
}

// 1. PRD.md
writeDoc('docs/product/PRD.md', `# Product Requirements Document (PRD) — career-ops

## Purpose
This document establishes the product requirements, system capabilities, constraints, and functional specifications for **career-ops**, the open-source, local-first AI job search automation platform.

## Scope
Covers candidate profile modeling, zero-token portal discovery, multi-stage evaluation gating, anti-ghost posting validation, deterministic CV tailoring, ATS compliance, and human-in-the-loop tracking.

## Overview
Job hunting in the modern era is fundamentally broken: applicant tracking systems (ATS) deploy algorithmic filters, LinkedIn and job boards are saturated with phantom/ghost listings, and predatory commercial tools spam hundreds of generic resumes that ruin candidate reputation. **career-ops** reverses this dynamic: it gives candidates an elite AI operating system that evaluates jobs deeply, verifies every resume claim against ground-truth facts, and prepares bespoke application materials without ever auto-submitting.

## Diagrams

\`\`\`mermaid
flowchart TD
    Candidate([Candidate Ground Truth]) --> Profile[Master Profile & CV]
    Profile --> Discovery[Discovery Engine: 60+ ATS Scanners]
    Discovery --> PipelineInbox[Pipeline Inbox: data/pipeline.md]
    
    PipelineInbox --> Gating{Multi-Stage Pre-Flight Gate}
    Gating -->|Dead Link| DeadDrop[Skip / Mark Inactive]
    Gating -->|Blacklist / Dealbreaker| BlacklistSkip[Skip / User Handoff]
    Gating -->|Active & Valid| Evaluation[A-H Deep Evaluation Engine]
    
    Evaluation --> FitScore{Holistic Fit Score}
    FitScore -->|< 4.0| Defer[Log & Recommend Against]
    FitScore -->|>= 4.0| Tailor[Fact-Gated CV & Asset Tailoring]
    
    Tailor --> FactGate{verify-cv-facts Check}
    FactGate -->|Hallucination Detected| Reject[Halt Generation & Flag Error]
    FactGate -->|100% Ground Truth| Export[Compile PDF & Form Answers]
    
    Export --> HumanReview[Human-in-the-Loop Review & Submit]
    HumanReview --> Tracker[Canonical Tracker: data/applications.md]
\`\`\`

## Technical Details

### Functional Requirements
1. **User Layer Isolation (Data Contract)**: Candidate personal files (\`cv.md\`, \`config/profile.yml\`, \`data/applications.md\`) must reside in an immutable layer that system updates never overwrite.
2. **Zero-Token Discovery**: Ingest postings from Ashby, Greenhouse, Lever, Workday, and 50+ other providers via direct REST/RSS endpoints with zero LLM API cost.
3. **Pre-Flight Liveness & Dealbreaker Gate**: Verify HTTP status and page DOM for closure indicators before spending any inference tokens.
4. **Holistic 5-Dimension Scoring**:
   - Match with CV
   - North Star alignment (Target Archetypes)
   - Compensation vs market
   - Cultural signals & remote policy
   - Red flags / risk adjustments
5. **Legitimacy Screening (Block G)**: Classify posting as High Confidence, Proceed with Caution, or Suspicious based on posting age, repost cadence, and layoff history.
6. **Strict Fact Gate**: Zero tolerance for manufactured metrics. Every skill or number in tailored output must trace directly to primary user files.

### Non-Functional Requirements
- **Local-First & Offline Resilience**: Core operations must run without central servers or proprietary database services.
- **Privacy Enforcement**: Outbound requests to LLM APIs must be intercepted to strip or block sensitive PII unless opted-in.
- **Cross-Platform Compatibility**: Complete operational parity across macOS, Linux, and Windows 10/11.

## Best Practices
- Never bypass the human submission step: the agent prepares, the human reviews and submits.
- Maintain an append-only transaction ledger (\`data/status-log.tsv\`) alongside Markdown tables.

## Examples
\`\`\`bash
# Run portal scan
node scan.mjs

# Evaluate specific job URL
node openrouter-runner.mjs evaluate https://jobs.ashbyhq.com/example/123

# Generate fact-verified PDF
node generate-pdf.mjs output/tailored-cv.html output/tailored-cv.pdf --format=letter
\`\`\`

## Future Enhancements
- Chrome extension for 1-click ATS form prefill.
- Local voice-to-voice interview coaching agent.
- Client-side zero-knowledge encrypted backup sync.
`);

// 2. Vision.md
writeDoc('docs/product/Vision.md', `# Product Vision & Mission — career-ops

## Purpose
Defines the philosophical foundation, core principles, and long-term aspirational trajectory of career-ops.

## Scope
Applies to all software engineering, product design, community contributions, and business decisions across the ecosystem.

## Overview
Recruiting has become an asymmetric technological arms race. Employers deploy enterprise AI filters to screen thousands of applicants, while commercial "job bots" spam low-quality applications across the web. Job seekers are caught in the middle: burned out, ghosted, and forced into exhausting manual workflows.

**career-ops** exists to restore balance to this relationship by placing an enterprise-grade AI operating system directly on the candidate's machine.

## Diagrams

\`\`\`mermaid
quadrantChart
    title Candidate AI Tools Landscape
    x-axis "Low Candidate Sovereignty" --> "High Candidate Sovereignty"
    y-axis "Low Intelligence / Robotic Spam" --> "High Intelligence / Deep Fit"
    quadrant-1 "Ideal: Sovereignty & Depth"
    quadrant-2 "High Depth / Vendor Lock-in"
    quadrant-3 "Spam Bots (Low Value)"
    quadrant-4 "Surface Tools"
    "Sonara / LazyApply": [0.2, 0.25]
    "Simplify": [0.4, 0.45]
    "Teal / Huntr": [0.35, 0.55]
    "LinkedIn EasyApply": [0.15, 0.2]
    "career-ops": [0.9, 0.95]
\`\`\`

## Technical Details

### The Four Pillars
1. **Candidate Sovereignty**: You own your data. Your resume, notes, application history, and interview stories stay on your drive in plain text files.
2. **Deterministic Fact Grounding**: Generative AI must be chained to verifiable truth. We reject resume "enhancements" that invent experiences or exaggerate achievements.
3. **High-Signal Engagement**: We reject the "spray and pray" doctrine. Applying to 10 highly vetted roles with tailored proof points beats spamming 500 companies with generic PDF resumes.
4. **Architectural Agnosticism**: No vendor lock-in. Compatible with Claude Code, Cursor, Codex, OpenCode, Antigravity, or local Ollama instances.

## Best Practices
- Resist features that promote low-effort application spam.
- Prioritize human agency: assist the candidate's critical judgment rather than replacing it.

## Examples
- When a job score is below 4.0, career-ops explicitly recommends *not* applying, preserving the candidate's mental energy for high-probability opportunities.

## Future Enhancements
- Establishing an open, decentralized candidate verification protocol that allows engineers to share verified proof points with hiring managers without intermediaries.
`);

// 3. UserPersonas.md
writeDoc('docs/product/UserPersonas.md', `# User Personas — career-ops

## Purpose
Defines the target user segments, behavioral archetypes, pain points, and technical contexts for career-ops.

## Scope
Informs UI design, CLI ergonomics, prompt tuning, and product prioritization.

## Overview
career-ops serves diverse candidates who share one common trait: a refusal to compromise on data privacy or application quality.

## Diagrams

\`\`\`mermaid
mindmap
  root((career-ops Users))
    Staff & Principal Engineers
      Deep technical depth
      Values CLI & automation
      Avoids spam tools
    Product & Engineering Leaders
      High compensation stakes
      Complex narrative alignment
      Needs rigorous company screening
    Career Transitioners
      Skill gap anxiety
      Needs resume reframing
      Targeted proof points
    Global Remote Expats
      Visa & jurisdiction complexity
      Strict location policy filtering
      Currency & comp arbitrage
\`\`\`

## Technical Details

### 1. The Staff/Principal Engineer ("Alex")
- **Profile**: 12+ years experience, Senior/Staff backend architect.
- **Tech Stack**: Linux/macOS, Neovim/VSCode, terminal power-user.
- **Pain Points**: Sifting through generic recruiter inmails, identifying real technical challenges vs. buzzword-stuffed job specs, evaluating comp packages accurately.
- **career-ops Usage**: CLI batch runner, customized \`_profile.md\` targeting Staff/Principal archetypes, zero-token scanners for curated startup lists.

### 2. The Engineering Manager / Product Leader ("Priya")
- **Profile**: 10+ years experience, manages 25+ engineers, looking for Director/VP roles.
- **Tech Stack**: Mac, web tools, spreadsheet trackers.
- **Pain Points**: Translating organizational leadership into quantified ATS bullets, navigating lengthy executive interview loops.
- **career-ops Usage**: Web UI (/pipeline), STAR story bank provenance tracking, negotiation scripts.

### 3. The Career Pivoter / Tech Transitioner ("Marcus")
- **Profile**: 4 years experience in data analytics transitioning into ML Engineering.
- **Tech Stack**: Windows/WSL, Python, Jupyter.
- **Pain Points**: Keyword mismatch in ATS systems, lack of confidence in translating transferrable skills.
- **career-ops Usage**: Block B gap analysis, \`keyword-match.mjs\`, targeted CV bullet reordering.

### 4. The Cross-Border Remote Worker ("Elena")
- **Profile**: Staff Engineer based in Eastern Europe/Asia seeking US/EU remote roles.
- **Tech Stack**: Linux, Docker, multiple timezone coordination.
- **Pain Points**: Filtering out fake "remote" jobs that secretly require local citizenship or residency.
- **career-ops Usage**: Location policy hard filters in \`profile.yml\`, Block G legitimacy screening.

## Best Practices
- Design interfaces with dual affordances: terminal-first for Alex and Elena; visual Web UI for Priya and Marcus.

## Examples
- Configuration in \`config/profile.yml\` tailoring location policy to global remote hubs.

## Future Enhancements
- Persona-specific onboarding templates for Executive, IC Engineer, and Product Manager tracks.
`);

// 4. UserJourneys.md
writeDoc('docs/product/UserJourneys.md', `# User Journeys — career-ops

## Purpose
Documents the standard user interaction flows across the job search lifecycle.

## Scope
Covers onboarding, job discovery, evaluation, application asset generation, and post-application tracking.

## Overview
The career-ops user journey is designed as a high-signal funnel where low-probability listings are disqualified early and high-fit listings receive exhaustive preparation.

## Diagrams

\`\`\`mermaid
sequenceDiagram
    autonumber
    actor User as Candidate
    participant CLI as career-ops CLI / Web
    participant Scanners as Discovery Scanners
    participant Gate as Pre-Flight Gating
    participant LLM as AI Engine (Modes)
    participant Disk as Local Markdown / SQLite

    User->>CLI: Configure profile.yml & cv.md
    User->>CLI: Trigger scan (node scan.mjs)
    Scanners->>Disk: Append new listings to pipeline.md
    
    User->>CLI: Run evaluation on pipeline
    CLI->>Gate: Verify liveness, blacklist, dealbreakers
    alt Listing Fails Gate
        Gate-->>Disk: Mark [x] ~~Closed / Skipped~~
        Gate-->>User: Report reason for skip
    else Listing Passes Gate
        Gate->>LLM: Dispatch JD text + cv.md context
        LLM->>LLM: Compute Blocks A-G & 1-5 Score
        LLM-->>Disk: Save reports/NNN-{company}.md
        alt Score >= 4.0
            LLM->>CLI: Trigger CV Tailoring & PDF Generation
            CLI->>Disk: Save output/cv-tailored.pdf
        end
        CLI->>Disk: Update data/applications.md
        CLI-->>User: Display Scorecard & Next Steps
    end
\`\`\`

## Technical Details

### Journey Phase 1: Onboarding & Calibration
1. User clones repository and runs \`npm run doctor\`.
2. Master resume is imported to \`cv.md\`.
3. Candidate defines compensation floors, target archetypes, and dealbreakers in \`config/profile.yml\`.
4. User seeds STAR stories into \`interview-prep/story-bank.md\`.

### Journey Phase 2: Ingestion & Filtering
1. Automatic or manual ingestion populates \`data/pipeline.md\`.
2. \`check-liveness.mjs\` strips dead links without wasting LLM tokens.
3. \`data/blacklist.md\` prevents evaluating unwanted employers.

### Journey Phase 3: Evaluation & Asset Prep
1. \`modes/oferta.md\` executes structured evaluation.
2. \`verify-cv-facts.mjs\` verifies candidate claims.
3. Playwright renders pixel-perfect, ATS-compliant PDF.

### Journey Phase 4: Follow-up & Retro
1. Candidate logs submission status via \`node set-status.mjs\`.
2. \`followup-cadence.mjs\` calculates optimal follow-up dates.
3. \`modes/retro.md\` captures lessons from rejections or interviewer feedback.

## Best Practices
- Never bypass the liveness gate: dead URLs waste token budget and pollute reports.

## Examples
\`\`\`bash
# Run full evaluation pipeline
npm run or:pipeline
\`\`\`

## Future Enhancements
- Interactive visual step-through in the Web UI with live streaming tokens.
`);

// 5. CompetitiveAnalysis.md
writeDoc('docs/product/CompetitiveAnalysis.md', `# Competitive Analysis & Market Benchmark — career-ops

## Purpose
Examines the competitive landscape, benchmarking career-ops against incumbent job search platforms, resume builders, and automated application tools.

## Scope
Evaluates LinkedIn, Simplify, Teal, Sonara, LazyApply, LoopCV, Huntr, and CareerFlow.

## Overview
The job application tech stack is divided into two distinct failure modes: passive tracker boards (Teal, Huntr) that require tedious manual entry, and aggressive spam bots (LazyApply, Sonara) that burn candidate reputation. career-ops represents a third way: high-intelligence, local-first candidate operations.

## Diagrams

\`\`\`mermaid
flowchart LR
    subgraph MarketCompetitors ["Market Approaches"]
        Tracker["Manual Trackers\n(Teal, Huntr)"]
        SpamBot["Spam Bots\n(LazyApply, Sonara)"]
        Autofill["Form Autofill\n(Simplify)"]
        CareerOps["candidate-ops\n(High-Signal Local AI)"]
    end

    Tracker -->|Limitation| HighManualEffort[Exhausting manual entry\nNo deep job evaluation]
    SpamBot -->|Limitation| ReputationDamage[Mass spamming\nBlacklisted by recruiters]
    Autofill -->|Limitation| PrivacyExtraction[Data harvesting\nCloud dependency]
    CareerOps -->|Advantage| EliteOutcome[100% Fact-Checked\nLocal-First Privacy\nCounter-ATS Intelligence]
\`\`\`

## Technical Details

### Comprehensive Feature Benchmark

| Capability | career-ops | Teal | Simplify | Huntr | LazyApply / Sonara | LinkedIn |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Privacy / Local-First** | **100% Local** | Cloud | Cloud | Cloud | Cloud | Cloud |
| **Zero-Token Scanners** | **60+ ATS APIs** | None | Aggregator | None | Aggregator | Proprietary |
| **Anti-Ghost Job Check** | **Yes (Block G)** | No | No | No | No | No |
| **Fact-Verified Resumes** | **Deterministic** | Unverified AI | Basic | None | Generic Template | None |
| **STAR Story Provenance**| **Built-in** | None | None | None | None | None |
| **Open Source** | **MIT** | Proprietary | Proprietary | Proprietary | Proprietary | Proprietary |
| **Auto-Submit Policy** | **Strict HITL** | Manual | Autofill | Manual | Blind Auto-Submit | EasyApply |

### Competitor Deep Dives
- **Teal / Huntr**: Excellent visual kanban boards, but surface-level AI. They encourage users to match keywords without verifying whether the candidate actually possesses the skills.
- **Simplify**: Outstanding autofill browser extension, but candidate data is monetized in the cloud. Lacks deep strategic evaluation.
- **Sonara / LazyApply**: Automates form submissions blindly. Recruiters have deployed reverse-detection models that instantly reject candidates using these tools.

## Best Practices
- Position career-ops as the "anti-spam, counter-ATS" platform for professionals who care about their reputation.

## Examples
- High-level ATS matching reports showing missing vs. present competencies without keyword stuffing.

## Future Enhancements
- Bridge the convenience gap by developing an open-source, local-first browser extension for autofill.
`);

// 6. Roadmap.md
writeDoc('docs/product/Roadmap.md', `# Product Roadmap — career-ops

## Purpose
Outlines the strategic development phases, feature releases, and technical milestones for career-ops.

## Scope
Spans Core CLI, Modern Web UI, Local DevOps, and Future AI capabilities.

## Overview
Our roadmap transitions career-ops from an elite CLI power-tool for developers into an accessible, institutional-grade career command center.

## Diagrams

\`\`\`mermaid
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
\`\`\`

## Technical Details

### Phase 1: Core Engine & Developer Ergonomics (Q4 2026)
- **Monolith Deconstruction**: Split the 20,000-line \`test-all.mjs\` file into modular suites under \`tests/\`.
- **Accessibility Hardening**: Add semantic PDF tags to Playwright Chromium rendering for screen reader compliance.
- **CLI Doctor**: Automated self-healing environment diagnosis.

### Phase 2: Web Modernization & Local Inbound (Q1 2027)
- **Production Web UI**: Graduate \`@career-ops/web\` from alpha to primary interface.
- **Local Email Ingestion**: Zero-cloud IMAP reader for local rejection/interview invite classification.
- **Visual CV Studio**: Side-by-side Markdown editing with live PDF preview.

### Phase 3: The Last-Mile Bridge & Voice Agent (Q2–Q3 2027)
- **Companion Browser Extension**: 1-click ATS prefill without cloud data leakage.
- **Local Audio Mock Interviewer**: WebRTC/Whisper voice agent that grills candidates using their STAR story bank.

## Best Practices
- Every new feature must preserve the local-first data contract.

## Examples
- Release tracking via \`node update-system.mjs check\`.

## Future Enhancements
- Decentralized talent network protocols.
`);

// 7. FeatureSpecifications.md
writeDoc('docs/product/FeatureSpecifications.md', `# Feature Specifications — career-ops

## Purpose
Provides detailed engineering specifications for core features in career-ops.

## Scope
Covers Scanner Ingestion, Liveness/Anti-Ghost Gating, Fact-Checked Resume Tailoring, and Story Bank Provenance.

## Overview
Technical requirements, algorithms, data contracts, and failure handling for primary platform features.

## Diagrams

\`\`\`mermaid
stateDiagram-v2
    [*] --> Ingest: URL or JD Text
    Ingest --> LivenessCheck: URL Provided
    Ingest --> DealbreakerCheck: Text Pasted
    LivenessCheck --> Expired: HTTP 404/410 or Closed DOM
    LivenessCheck --> DealbreakerCheck: Status 200 & Active DOM
    Expired --> [*]: Log Skipped
    DealbreakerCheck --> Rejected: Hard Rule Violated
    DealbreakerCheck --> Evaluator: Passes Rules
    Rejected --> [*]: Log Skipped
    Evaluator --> FactGate: Tailored CV Drafted
    FactGate --> OutputReady: 100% Provenance Match
    FactGate --> Flagged: Unverified Claim Found
    Flagged --> UserReview: Confirm or Strip
    UserReview --> OutputReady
    OutputReady --> [*]
\`\`\`

## Technical Details

### 1. Zero-Token Discovery Scanners (\`scan.mjs\`, \`providers/*\`)
- **Specification**: Ingests postings directly from ATS endpoints without LLM assistance.
- **Provider Interface**:
  \`\`\`typescript
  interface Provider {
    name: string;
    detect: (url: string) => boolean;
    fetchJobs: (boardId: string, options?: FetchOptions) => Promise<Job[]>;
  }
  \`\`\`
- **Rate Limiting & SSRF**: All requests must pass through \`providers/_http.mjs\` with DNS lookup guards.

### 2. Fact Verification Engine (\`verify-cv-facts.mjs\`)
- **Specification**: Validates that all tools, languages, companies, and quantified claims in a tailored resume exist in primary source files (\`cv.md\`, \`article-digest.md\`).
- **Algorithm**:
  1. Tokenizes generated document into noun phrases, numeric claims, and tool fragments.
  2. Compares extracted entities against ground-truth corpus.
  3. Rejects compile step if any novel claim is introduced.

### 3. STAR+R Story Bank Provenance (\`lib/story-bank.mjs\`)
- **Specification**: Requires explicit provenance markers on all quantified claims in interview stories:
  \`**Provenance:** source: cv.md | user-stated YYYY-MM-DD | derived-unverified | user-cannot-confirm\`

## Best Practices
- Never allow a derived story to promote unverified numbers into a primary resume.

## Examples
- Unit tests in \`tests/verify-cv-facts-structured-fields.test.mjs\`.

## Future Enhancements
- AST-based NLP parser replacing heuristic regexes in fact verification.
`);

console.log('Product docs generation complete.');
