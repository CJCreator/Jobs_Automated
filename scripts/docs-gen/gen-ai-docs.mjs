import fs from 'node:fs';
import path from 'node:path';

function writeDoc(relPath, content) {
  const fullPath = path.resolve(relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content.trim() + '\n', 'utf8');
  console.log(`Generated: ${relPath}`);
}

// 1. PromptLibrary.md
writeDoc('docs/ai/PromptLibrary.md', `# Prompt Library & Template Specifications — career-ops

## Purpose
Catalog and reference guide for all standardized prompt files located in \`modes/\`.

## Scope
Covers system prompts, evaluation rubrics, resume tailoring, and interview prep modes.

## Overview
career-ops structures its intelligence through versioned, composable Markdown prompt files. Prompts enforce defensive behavior, anti-hallucination rules, and strict output formats.

## Diagrams

\`\`\`mermaid
flowchart TD
    Shared["modes/_shared.md (System Ground Truth)"] --> Oferta["modes/oferta.md (A-H Deep Evaluation)"]
    Shared --> Apply["modes/apply.md (Form Answers & Outreach)"]
    Shared --> Cover["modes/cover.md (Cover Letter Drafting)"]
    Shared --> Interview["modes/interview.md (STAR Story Matcher)"]
    Shared --> Retro["modes/retro.md (Preference Extraction)"]
\`\`\`

## Technical Details

### Reusable Core Templates

#### 1. Evaluation Prompt (\`modes/oferta.md\`)
- **Objective**: Evaluates an extracted JD against \`cv.md\` across 8 structured blocks.
- **Key Sections**:
  - \`Block A\`: Role summary, archetype match, culture screen, quota checks.
  - \`Block B\`: Requirements table with importance rating, candidate proof, and gap mitigation.
  - \`Block C\`: Level strategy (Staff/Lead calibration).
  - \`Block D\`: Compensation research vs. market quartiles.
  - \`Block E\`: Targeted CV personalization recommendations.
  - \`Block F\`: STAR+R interview story mappings.
  - \`Block G\`: Legitimacy screening (age, repost pattern, scam detection).
  - \`Block H\`: Application form answers (conditional on score $\ge 4.5$).

#### 2. Anti-Hallucination Core (\`modes/_shared.md\`)
- **Key Constraints**:
  - *"Keywords get reformulated, never fabricated."*
  - *"Never claim the user authored a project unless explicitly attributed in cv.md."*
  - *"Silence on a topic beats manufactured detail."*

## Best Practices
- Never edit \`modes/_shared.md\` for user-specific data; personal overrides belong in \`modes/_profile.md\` and \`modes/_custom.md\`.

## Examples
\`\`\`bash
# Run offer evaluation prompt interactively
/career-ops oferta https://jobs.ashbyhq.com/example/123
\`\`\`

## Future Enhancements
- Automated prompt regression testing against a golden dataset of evaluated JDs.
`);

// 2. AgentWorkflows.md
writeDoc('docs/ai/AgentWorkflows.md', `# Agent Workflows & Operational Loops — career-ops

## Purpose
Details the operational state machines, transition triggers, and agent decision loops.

## Scope
Covers discovery, triage, evaluation, tailoring, application preparation, and retrospective learning loops.

## Overview
Agents operate within a deterministic loop. Decisions are anchored by gates, ensuring that low-quality listings are rejected before incurring inference costs.

## Diagrams

\`\`\`mermaid
stateDiagram-v2
    [*] --> Ingest: Discovery or Manual URL
    Ingest --> Gate: Verify Liveness & Blacklist
    Gate --> Rejected: Dead Link / Dealbreaker
    Gate --> Evaluate: Active & Approved
    Evaluate --> Score: 1-5 Holistic Scoring
    Score --> Review: Score < 4.0 (Recommend Against)
    Score --> Tailor: Score >= 4.0
    Tailor --> FactCheck: verify-cv-facts.mjs
    FactCheck --> AssetReady: Passed 100%
    FactCheck --> Flagged: Novel Metric Detected
    Flagged --> HumanResolution: User Accepts / Rejects
    HumanResolution --> AssetReady
    AssetReady --> Applied: Human Submits
    Applied --> Followup: Pinned Cadence
    Followup --> Retro: Outcome Recorded
    Retro --> [*]
\`\`\`

## Technical Details

### Workflow Stages
1. **Intake & Triage**: Populates \`data/pipeline.md\`; classifies target archetypes.
2. **Pre-Flight Gating**: Evaluates hard rules (salary floors, remote policies, blacklist).
3. **Deep Evaluation**: Produces A–H structured report and holistic 1–5 score.
4. **Asset Tailoring**: Rewrites resume bullet points using candidate proof points; strictly validated by \`verify-cv-facts.mjs\`.
5. **Retrospective Loop**: When a candidate corrects an agent output, \`modes/retro.md\` extracts lasting procedural rules and saves them to \`modes/_custom.md\`.

## Best Practices
- Agents must never auto-submit applications on behalf of the user.

## Examples
\`\`\`bash
# Run the retrospective learning workflow
/career-ops retro
\`\`\`

## Future Enhancements
- Multi-agent debate: Two autonomous agent personas (Advocate vs. Skeptic) critiquing job fit.
`);

// 3. LLMArchitecture.md
writeDoc('docs/ai/LLMArchitecture.md', `# LLM Architecture & Model Routing — career-ops

## Purpose
Documents model routing tiers, context window optimization, token budgeting, and vendor integrations.

## Scope
Covers Anthropic Claude, Google Gemini, OpenAI, OpenRouter, and local Ollama execution.

## Overview
career-ops is AI-agnostic. It decouples business logic from model APIs, enabling seamless execution on cloud APIs or local open-source models according to user preference and budget.

## Diagrams

\`\`\`mermaid
flowchart TD
    Task["Task: Evaluate / Tailor / Prep"] --> Router["Model Router (modes/_shared.md)"]
    Router --> Config{"config/profile.yml: spend_tier"}
    
    Config -->|Economy| EcoModels["Claude Haiku 5.5 / Gemini Flash / Ollama Qwen"]
    Config -->|Standard (Default)| StdModels["Claude Sonnet 5.5 / GPT-4o"]
    Config -->|Premium| PremModels["Claude Opus 5.5 / Gemini Pro Extended Thinking"]
    
    EcoModels --> Outbound["lib/llm-outbound.mjs"]
    StdModels --> Outbound
    PremModels --> Outbound
    Outbound --> TokenGuard["Token Tracker & PII Guard"]
\`\`\`

## Technical Details

### Model Routing Matrix
- **Economy**: Lowest latency and cost; ideal for initial batch triage and keyword matching.
- **Standard**: High reasoning and nuanced writing; default for comprehensive A–H evaluations and resume tailoring.
- **Premium**: Deep multi-step analytical reasoning; used for executive leveling analysis and complex compensation negotiations.

### Context Budgeting (\`lib/context-budget.mjs\`)
- Analyzes JD token density.
- Automatically truncates repetitive boilerplate (EEO, privacy policies) while retaining 100% of responsibilities and technical qualifications.

## Best Practices
- Never hardcode vendor model names outside the central routing table in \`modes/_shared.md\`.

## Examples
\`\`\`bash
# Execute evaluation using OpenRouter free models
node openrouter-runner.mjs evaluate https://jobs.lever.co/example/123
\`\`\`

## Future Enhancements
- Dynamic routing: Automatically escalate from Economy to Premium model if initial score is borderline ($3.8 - 4.2$).
`);

// 4. EvaluationFramework.md
writeDoc('docs/ai/EvaluationFramework.md', `# Evaluation Framework & Scoring Rubric — career-ops

## Purpose
Formal specification of the 5-dimension holistic scoring methodology and evidence confidence grading.

## Scope
Governs \`modes/_shared.md\`, \`modes/oferta.md\`, and \`eval-golden.mjs\`.

## Overview
career-ops evaluates job opportunities using a holistic 1–5 rating system. Unlike naive SaaS tools that calculate arithmetic averages of keyword counts, career-ops evaluates structural career fit and evidence confidence.

## Diagrams

\`\`\`mermaid
flowchart LR
    subgraph Dimensions ["5 Holistic Scoring Dimensions"]
        D1["1. Match with CV (Skills & Proof)"]
        D2["2. North Star Alignment (Target Archetypes)"]
        D3["3. Compensation vs. Market"]
        D4["4. Cultural Signals & Remote Policy"]
        D5["5. Red Flags & Risk Adjustments"]
    end

    Dimensions --> GlobalScore["1-5 Global Score\n(Non-Arithmetic Holistic Judgment)"]
    GlobalScore --> Confidence["Evidence Confidence\n(Supported / Partial / Unknown)"]
\`\`\`

## Technical Details

### Scoring Rubric
- **4.5 - 5.0 (Strong Match)**: Outstanding technical and narrative alignment; top quartile compensation; recommend applying immediately.
- **4.0 - 4.4 (Good Match)**: Solid match; minor skill gaps that can be addressed in interview prep; recommend applying.
- **3.5 - 3.9 (Decent / Marginal)**: Significant misalignment or unconfirmed remote policy; recommend against applying unless specific reason exists.
- **Below 3.5 (Poor Match)**: Fundamental mismatch, predatory contract, or excessive red flags; do not apply.

### Evidence Confidence Grading
- **Supported**: Direct evidence exists in JD text and primary candidate files.
- **Partial**: Plausible inference made, but key details remain unverified.
- **Unknown**: Critical decision data is absent or contradictory.

## Best Practices
- Never let high technical fit compensate for a culture red flag: surface the warning clearly.

## Examples
- Golden evaluation benchmarking via \`node eval-golden.mjs\`.

## Future Enhancements
- Automated calibration against real-world interview callback rates.
`);

// 5. RAGArchitecture.md
writeDoc('docs/ai/RAGArchitecture.md', `# Local Retrieval-Augmented Generation (RAG) Architecture — career-ops

## Purpose
Documents the zero-database local document retrieval and context injection architecture.

## Scope
Covers retrieval of \`cv.md\`, \`article-digest.md\`, \`interview-prep/story-bank.md\`, and past reports.

## Overview
career-ops implements a high-precision, local RAG pattern without the operational overhead of vector databases. By structuring candidate data into specialized semantic documents, exact proof points are injected deterministically into prompts.

## Diagrams

\`\`\`mermaid
flowchart TD
    JD["Extracted Job Description"] --> Extractor["Skill & Requirement Extractor"]
    Extractor --> Query["Semantic Requirement Tokens"]
    
    subgraph CandidateKnowledge ["Candidate Knowledge Corpus"]
        CV["cv.md (Chronological Experience)"]
        Digest["article-digest.md (Key Proof Points & Metrics)"]
        Stories["story-bank.md (STAR+R Behavioral Stories)"]
    end

    Query --> Matcher["Deterministic Matcher (keyword-match.mjs)"]
    CandidateKnowledge --> Matcher
    Matcher --> AssembledContext["Targeted Context Block (Injected into Prompt)"]
\`\`\`

## Technical Details

### Document Chunking & Provenance
1. **Primary Proof Points (\`article-digest.md\`)**:
   - Short, high-impact quantified statements of technical accomplishments.
   - Takes precedence over \`cv.md\` for project-specific metrics.
2. **Behavioral STAR Stories (\`story-bank.md\`)**:
   - Structured according to Situation, Task, Action, Result, and Reflection.
   - Every quantified metric carries a strict provenance marker.

## Best Practices
- Maintain compact proof points; avoid injecting pages of raw text into prompt context.

## Examples
\`\`\`bash
# Match candidate STAR stories to specific requirements
node match-star.mjs --role "Staff Backend Engineer"
\`\`\`

## Future Enhancements
- Local BM25 + ONNX-based embedding hybrid search for larger multi-decade career histories.
`);

// 6. ToolCallingArchitecture.md
writeDoc('docs/ai/ToolCallingArchitecture.md', `# Tool-Calling & Verification Architecture — career-ops

## Purpose
Specifies the hybrid tool-calling design, deterministic guardrails, and tool dispatch mechanics.

## Scope
Covers script tool invocations, browser extraction, and fact-checking gates.

## Overview
career-ops rejects unbounded LLM tool-calling loops. Instead, deterministic Node.js scripts handle network fetching, parsing, and verification, feeding structured data to the model and validating outputs.

## Diagrams

\`\`\`mermaid
sequenceDiagram
    autonumber
    participant Agent as AI Coding Agent
    participant Script as Core CLI Script
    participant Tool as System Tools (Playwright / SQLite)
    participant Verifier as verify-cv-facts.mjs

    Agent->>Script: Run scan / extract tool
    Script->>Tool: Execute deterministic network fetch
    Tool-->>Script: Return sanitized JD text
    Script-->>Agent: Provide structured context
    Agent->>Agent: Draft tailored CV bullets
    Agent->>Verifier: Validate tailored CV payload
    alt Verifier Detects Unbacked Metric
        Verifier-->>Agent: REJECT: Claim "$5M pipeline" not found in cv.md
        Agent->>Agent: Reformulate bullet with verified metrics only
    else Verifier Confirms 100% Provenance
        Verifier-->>Script: PASS: Compilation authorized
    end
\`\`\`

## Technical Details

### Deterministic Tool Guardrails
- **Bounded Research Budget**: Maximum 5 external WebSearch queries per evaluation to prevent runaway latency.
- **Strict Verification Gate (\`verify-cv-facts.mjs\`)**:
  - Validates that every tool name, company, and quantified figure in generated output exists in primary user files.
  - Throws an error and halts compilation if an unbacked assertion is detected.

## Best Practices
- Always place deterministic verifiers after stochastic LLM generation steps.

## Examples
\`\`\`bash
# Self-test the CV fact verification engine
node verify-cv-facts.mjs --self-test
\`\`\`

## Future Enhancements
- Sandboxed WebAssembly (Wasm) fact-checking runtime.
`);

console.log('AI docs generation complete.');

