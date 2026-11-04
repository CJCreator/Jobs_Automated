# Multi-Agent Architecture Specification — career-ops

## Purpose
Specifies the distributed, event-driven multi-agent architecture transforming career-ops from a monolithic prompt runner into a decentralized team of 8 specialized agents.

## Scope
Covers `agents/` (`supervisor.mjs`, `job-discovery.mjs`, `ats-scoring.mjs`, `resume-optimization.mjs`, `cover-letter.mjs`, `recruiter-research.mjs`, `interview-coach.mjs`, `salary-negotiation.mjs`, `application-tracking.mjs`), `lib/agent-events.mjs`, and blackboard coordination.

## Overview
The multi-agent system decouples specialized responsibilities into independent agent modules that coordinate asynchronously over a local file-backed blackboard (`data/agent-events.jsonl`, `data/applications.md`, `data/status-log.tsv`). Generative decisions are bounded by deterministic verification gates (liveness checks, dealbreaker filters, AST fact checkers).

## Diagrams

```mermaid
flowchart TD
    Candidate([Candidate / User]) --> Supervisor[agents/supervisor.mjs (Master Orchestrator)]
    
    subgraph AgentEnclave ["Specialized Autonomous Agents (agents/*)"]
        A1[1. Job Discovery Agent]
        A2[2. ATS Scoring Agent]
        A3[3. Resume Optimization Agent]
        A4[4. Cover Letter Agent]
        A5[5. Recruiter Research Agent]
        A6[6. Interview Coach Agent]
        A7[7. Salary Negotiation Agent]
        A8[8. Application Tracking Agent]
    end

    subgraph Blackboard ["Local File-Backed Blackboard"]
        Pipeline["data/pipeline.md (Inbox)"]
        Tracker["data/applications.md (Ground Truth)"]
        Ledger["data/status-log.tsv (Audit Log)"]
        Events["data/agent-events.jsonl (Event Stream)"]
        Reports["reports/*.md (Evaluation Dossiers)"]
        StoryBank["interview-prep/story-bank.md (STAR Stories)"]
    end

    Supervisor --> AgentEnclave
    A1 --> Pipeline
    A2 --> Reports
    A3 --> Tracker
    A4 --> Reports
    A5 --> Reports
    A6 --> StoryBank
    A7 --> Reports
    A8 --> Tracker & Ledger
    AgentEnclave -.->|Emit Events| Events
```

## Technical Details

### 1. The 8 Specialized Agents
1. **Job Discovery Agent (`agents/job-discovery.mjs`)**: Traverses 60+ public ATS boards without LLM tokens; deduplicates against `scan-history.tsv`; appends to `pipeline.md`.
2. **ATS Scoring Agent (`agents/ats-scoring.mjs`)**: Enforces pre-flight liveness, blacklist, and dealbreaker gates; executes Blocks A-G; produces 1.0–5.0 holistic score; generates report in `reports/`.
3. **Resume Optimization Agent (`agents/resume-optimization.mjs`)**: Tailors CV bullets for roles scoring $\ge 4.0$; validates against `verify-cv-facts.mjs` (zero-fabrication guarantee); compiles ATS PDF.
4. **Cover Letter Agent (`agents/cover-letter.mjs`)**: Synthesizes 3-paragraph executive cover letters grounded in candidate proof points; strictly eliminates AI cliches.
5. **Recruiter Research Agent (`agents/recruiter-research.mjs`)**: Investigates company health, tech stack, and panelist profiles using a bounded 5-query web search budget.
6. **Interview Coach Agent (`agents/interview-coach.mjs`)**: Matches STAR stories to JD requirements; enforces `#2947` story provenance; prepares interview briefing dossiers.
7. **Salary Negotiation Agent (`agents/salary-negotiation.mjs`)**: Models total compensation (base, equity, bonus); benchmarks against market quartiles; drafts collaborative counter-offer scripts.
8. **Application Tracking Agent (`agents/application-tracking.mjs`)**: Maintains `applications.md` and `status-log.tsv`; syncs derived SQLite index; manages follow-up cadences.

### 2. Event Bus & Blackboard (`lib/agent-events.mjs`)
Agents communicate via typed JSON events published to `data/agent-events.jsonl`:
- `JOB_DISCOVERED`
- `JOB_SCORED`
- `RESUME_OPTIMIZED`
- `COVER_LETTER_COMPILED`
- `COMPANY_RESEARCH_COMPLETED`
- `INTERVIEW_PREP_READY`
- `NEGOTIATION_PLAN_GENERATED`
- `STATUS_TRANSITIONED`

## Best Practices
- Every agent must adhere to the Data Contract: state mutations target the User Layer (`data/`, `reports/`, `output/`).
- Generative outputs must clear deterministic gates before persistence.

## Examples
```bash
# Run multi-agent supervisor on a target opportunity
node agents/supervisor.mjs evaluate "Stripe" "Staff Infrastructure Engineer" "https://stripe.com/jobs/123"

# Inspect recent multi-agent blackboard events
node agents/supervisor.mjs status
```

## Future Enhancements
- WebRTC real-time audio agent integration for the Interview Coach Agent.

