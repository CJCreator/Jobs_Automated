import fs from 'node:fs';
import path from 'node:path';

function writeDoc(relPath, content) {
  const fullPath = path.resolve(relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content.trim() + '\n', 'utf8');
  console.log(`Generated: ${relPath}`);
}

// 1. APIReference.md
writeDoc('docs/backend/APIReference.md', `# API Reference — career-ops Web API

## Purpose
Exhaustive technical documentation of all HTTP REST endpoints exposed by \`web/src/app/api/\`.

## Scope
Covers endpoint URLs, supported methods, request/response structures, error responses, and authentication.

## Overview
All API routes bind to IPv4 loopback (\`127.0.0.1:3000\`). Endpoints orchestrate the core Node.js scripts or read directly from the candidate's User Layer files.

## Diagrams

\`\`\`mermaid
flowchart LR
    Client["Client / Frontend"] --> API["Next.js Route Handlers (/api/*)"]
    API --> Pipeline["/api/pipeline (Inbox & Applications)"]
    API --> Tracker["/api/tracker (Status & Records)"]
    API --> Report["/api/report (Evaluation Dossiers)"]
    API --> Scanners["/api/explore (ATS Queries)"]
    API --> Doctor["/api/doctor (System Diagnostics)"]
\`\`\`

## Technical Details

### Endpoints Catalog

#### 1. Pipeline & Tracker
- **\`GET /api/pipeline\`**
  - **Description**: Returns all items currently queued in \`data/pipeline.md\`.
  - **Response**: \`{ success: true, items: [{ url: string, company: string, role: string, status: string }] }\`
- **\`POST /api/pipeline\`**
  - **Description**: Appends a new job posting URL or text to the pipeline inbox.
  - **Request Body**: \`{ url: string, notes?: string }\`
  - **Response**: \`{ success: true, message: "Listing added to pipeline" }\`
- **\`GET /api/tracker\`**
  - **Description**: Fetches all applications from \`data/applications.md\` via SQLite index.
  - **Query Parameters**: \`?status=Applied&min_score=4.0\`
  - **Response**: \`{ success: true, applications: Application[] }\`
- **\`POST /api/tracker\`**
  - **Description**: Updates application status or adds notes via \`set-status.mjs\`.
  - **Request Body**: \`{ id: number, status: string, note?: string }\`
  - **Response**: \`{ success: true }\`

#### 2. Evaluation & Reports
- **\`GET /api/report\`**
  - **Description**: Reads a specific evaluation dossier markdown file.
  - **Query Parameters**: \`?num=042\`
  - **Response**: \`{ success: true, content: string, metadata: object }\`
- **\`POST /api/run\`**
  - **Description**: Dispatches a background evaluation job for a URL.
  - **Request Body**: \`{ url: string, options?: { tier?: string } }\`
  - **Response**: \`{ success: true, jobId: string }\`

#### 3. System & Health
- **\`GET /api/doctor\`**
  - **Description**: Runs system sanity checks (Node version, Playwright installation, profile validity).
  - **Response**: \`{ success: true, checks: { node: boolean, playwright: boolean, profile: boolean } }\`

## Best Practices
- Always return standard HTTP status codes (200 OK, 400 Bad Request, 500 Internal Error).
- Do not expose stack traces to client responses.

## Examples
\`\`\`bash
# Test tracker endpoint via curl
curl http://127.0.0.1:3000/api/tracker
\`\`\`

## Future Enhancements
- OpenAPI 3.1 schema generation and interactive Swagger UI.
`);

// 2. ServiceArchitecture.md
writeDoc('docs/backend/ServiceArchitecture.md', `# Service Architecture — career-ops

## Purpose
Details the internal service topology, command dispatching, batch execution model, and background workers.

## Scope
Covers root execution scripts, \`openrouter-runner.mjs\`, and \`batch/batch-runner.sh\`.

## Overview
career-ops executes as an on-demand process engine rather than a daemon service. Tasks are dispatched as isolated Node.js child processes or headless AI CLI instances, coordinating execution through state ledgers.

## Diagrams

\`\`\`mermaid
flowchart TD
    Trigger["Trigger: Shell / Web / Cron"] --> Orchestrator["batch-runner.sh / openrouter-runner.mjs"]
    
    subgraph Parallel_Workers ["Parallel Worker Pool (Default: 3)"]
        Worker1["Worker 1 (claude -p / node runner)"]
        Worker2["Worker 2 (claude -p / node runner)"]
        Worker3["Worker 3 (claude -p / node runner)"]
    end

    Orchestrator --> Parallel_Workers
    Parallel_Workers --> Additions["batch/tracker-additions/{id}.tsv"]
    Additions --> MergeEngine["merge-tracker.mjs (Atomic Merge)"]
    MergeEngine --> Canonical[("data/applications.md")]
\`\`\`

## Technical Details

### Batch Execution Pipeline (\`batch/batch-runner.sh\`)
1. **Queue Definition**: Reads pending target URLs from \`batch/batch-input.tsv\`.
2. **State & Resume**: Tracks completion status in \`batch/batch-state.tsv\` so interrupted runs resume cleanly.
3. **Worker Spawning**: Runs up to \`--parallel\` workers simultaneously.
4. **Isolated Output**: Each worker writes an independent TSV snippet to \`batch/tracker-additions/{id}.tsv\`.
5. **Reconciliation**: \`merge-tracker.mjs\` locks the primary tracker and merges all completed rows atomically.

## Best Practices
- Never allow child workers to write directly to \`data/applications.md\` concurrently; always use the addition spool directory.

## Examples
\`\`\`bash
# Run parallel batch worker on 10 offers
./batch/batch-runner.sh --parallel 3 --max-retries 2
\`\`\`

## Future Enhancements
- Node.js native worker threads replacing shell script batch runners.
`);

// 3. DatabaseSchema.md
writeDoc('docs/backend/DatabaseSchema.md', `# Database & File Schema Specifications — career-ops

## Purpose
Formal specification of file layouts, column types, delimiter rules, and database schemas.

## Scope
Covers \`applications.md\`, \`status-log.tsv\`, \`scan-history.tsv\`, and \`applications.db\`.

## Overview
career-ops specifies rigorous structural definitions for its flat data files to ensure backward compatibility and reliable parsing across disparate programming languages.

## Diagrams

\`\`\`mermaid
erDiagram
    APPLICATION ||--o{ STATUS_EVENT : tracks
    APPLICATION {
        int id PK
        string date
        string company
        string role
        string status
        float score
        string pdf_path
        string report_path
        string notes
        string url
    }
    STATUS_EVENT {
        int id PK
        int app_id FK
        string date
        string from_status
        string to_status
        string source
        string note
    }
\`\`\`

## Technical Details

### 1. Markdown Table Schema (\`data/applications.md\`)
- **Row Format**: \`| {id} | {date} | {company} | {role} | {status} | {score} | {pdf} | {report} | {notes} | {url} |\`
- **Rules**:
  - \`id\`: 1-based sequential integer.
  - \`date\`: ISO 8601 YYYY-MM-DD.
  - \`status\`: Valid string from \`templates/states.yml\`.
  - \`score\`: Floating point 1.0–5.0 or \`N/A\`.
  - Pipe characters (\`|\`) inside notes or titles must be escaped as \`\\|\`.

### 2. Append-Only Transition Ledger (\`data/status-log.tsv\`)
- **Columns**: \`tracker_id\\tdate\\tfrom\\tto\\tsource\\tnote\`
- **Source Values**: \`manual\`, \`cli\`, \`web\`, \`batch\`, \`sync\`.

### 3. Deduplication History (\`data/scan-history.tsv\`)
- **Columns**: \`url\\tdate\\tcompany\\trole\\tstatus\`
- **Statuses**: \`evaluated\`, \`skipped_title\`, \`skipped_location\`, \`skipped_expired\`.

## Best Practices
- Never reorder or omit columns in canonical TSV files.

## Examples
\`\`\`tsv
42	2026-11-04	Stripe	Staff Engineer	Applied	4.8	[PDF](...)	[Report](...)	Applied via referral	https://stripe.com/jobs/123
\`\`\`

## Future Enhancements
- Automated schema migration scripts versioned alongside code releases.
`);

// 4. Authentication.md
writeDoc('docs/backend/Authentication.md', `# Authentication & Authorization — career-ops

## Purpose
Documents the security model, network isolation, and access controls governing career-ops.

## Scope
Applies to local web server instances and remote AI API interactions.

## Overview
career-ops is fundamentally a **single-user, local-first system**. It eliminates complex user credential databases and session token mechanics by binding strictly to local loopback interfaces.

## Diagrams

\`\`\`mermaid
flowchart TD
    Client["Browser / Local Client"] -->|Loopback Connection (127.0.0.1)| LocalServer["Next.js / Web Server"]
    Remote["Remote Internet Attacker"] -->|Blocked (No Remote Interface)| Firewall["OS Socket Binding"]
    Firewall -.->|Connection Refused| LocalServer
    LocalServer -->|Authenticated with Bearer Token| ModelProvider["Anthropic / Google / OpenAI APIs"]
\`\`\`

## Technical Details

### Security Boundaries
1. **Loopback Only Binding**:
   - Web server scripts (\`web/server.mjs\`) explicitly bind to \`127.0.0.1\`. Requests originating from outside the host machine are rejected at the operating system socket layer.
2. **Third-Party API Authentication**:
   - Outbound LLM calls authenticate using standard API keys stored in local environment variables (\`OPENROUTER_API_KEY\`, \`GEMINI_API_KEY\`).
   - Keys are never stored in browser cookies or transmitted to client-side bundles.

## Best Practices
- Never bind career-ops to \`0.0.0.0\` without placing a password-authenticated reverse proxy (e.g., Caddy with basic auth) in front.

## Examples
\`\`\`javascript
// web/server.mjs explicit loopback binding
server.listen(port, '127.0.0.1', () => {
  console.log(\`Server listening on http://127.0.0.1:\${port}\`);
});
\`\`\`

## Future Enhancements
- Optional local PIN / biometric authentication (WebAuthn / TouchID) for opening the Web UI.
`);

console.log('Backend docs generation complete.');
