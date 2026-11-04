# LLM Architecture & Model Routing — career-ops

## Purpose
Documents model routing tiers, context window optimization, token budgeting, and vendor integrations.

## Scope
Covers Anthropic Claude, Google Gemini, OpenAI, OpenRouter, and local Ollama execution.

## Overview
career-ops is AI-agnostic. It decouples business logic from model APIs, enabling seamless execution on cloud APIs or local open-source models according to user preference and budget.

## Diagrams

```mermaid
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
```

## Technical Details

### Model Routing Matrix
- **Economy**: Lowest latency and cost; ideal for initial batch triage and keyword matching.
- **Standard**: High reasoning and nuanced writing; default for comprehensive A–H evaluations and resume tailoring.
- **Premium**: Deep multi-step analytical reasoning; used for executive leveling analysis and complex compensation negotiations.

### Context Budgeting (`lib/context-budget.mjs`)
- Analyzes JD token density.
- Automatically truncates repetitive boilerplate (EEO, privacy policies) while retaining 100% of responsibilities and technical qualifications.

## Best Practices
- Never hardcode vendor model names outside the central routing table in `modes/_shared.md`.

## Examples
```bash
# Execute evaluation using OpenRouter free models
node openrouter-runner.mjs evaluate https://jobs.lever.co/example/123
```

## Future Enhancements
- Dynamic routing: Automatically escalate from Economy to Premium model if initial score is borderline ($3.8 - 4.2$).
