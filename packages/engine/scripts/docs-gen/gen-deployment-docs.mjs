import fs from 'node:fs';
import path from 'node:path';

function writeDoc(relPath, content) {
  const fullPath = path.resolve(relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content.trim() + '\n', 'utf8');
  console.log(`Generated: ${relPath}`);
}

// 1. DeploymentGuide.md
writeDoc('docs/deployment/DeploymentGuide.md', `# Deployment & Operations Guide — career-ops

## Purpose
Provides instructions for deploying career-ops on workstations, self-hosted Linux servers, or Docker containers.

## Scope
Covers local production builds, systemd service units, and Docker deployment topologies.

## Overview
While career-ops is primarily a local CLI tool, power users often run it as a 24/7 background service on a home server or private cloud instance to execute scheduled scans and host the local Web UI.

## Diagrams

\`\`\`mermaid
flowchart TD
    Build["Build Web Assets: cd web && npm run build"] --> Daemon["Configure Daemon: systemd or Docker"]
    Daemon --> Mount["Mount External Volume: /data /reports"]
    Mount --> Network["Bind to Local Loopback or WireGuard VPN"]
    Network --> ServiceUp["Service Active on http://127.0.0.1:3000"]
\`\`\`

## Technical Details

### Production Build & Serve
\`\`\`bash
# 1. Build Next.js Web UI
cd web
npm ci
npm run build

# 2. Serve production bundle on loopback
npm start
\`\`\`

### Dockerfile Specification
\`\`\`dockerfile
FROM node:22-bookworm-slim

WORKDIR /app

# Install system dependencies for Playwright Chromium
RUN apt-get update && apt-get install -y \\
    chromium \\
    fonts-liberation \\
    libnss3 \\
    && rm -rf /var/lib/apt/lists/*

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \\
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 3000
CMD ["node", "web/server.mjs", "start"]
\`\`\`

## Best Practices
- Never expose the web server port directly to the public internet without an authenticated WireGuard VPN or HTTPS reverse proxy.

## Examples
\`\`\`bash
# Run container with external data volume
docker run -d -p 3000:3000 -v ~/my-career-data:/app/data career-ops:latest
\`\`\`

## Future Enhancements
- Pre-built multi-arch Docker images published to GitHub Container Registry (GHCR).
`);

// 2. CI-CD.md
writeDoc('docs/deployment/CI-CD.md', `# Continuous Integration & Delivery (CI/CD) — career-ops

## Purpose
Documents the automated GitHub Actions pipelines, security scanning workflows, and pull request validation rules.

## Scope
Applies to \`.github/workflows/\` and automated release pipelines.

## Overview
Every pull request is subjected to rigorous automated verification: syntax linting across all 1,900+ files, unit test execution, CodeQL security scanning, CodeRabbit AI reviews, and Dependabot dependency auditing.

## Diagrams

\`\`\`mermaid
flowchart LR
    Push["git push origin feature/xyz"] --> Trigger["GitHub Actions Trigger"]
    
    subgraph CI_Pipeline ["Parallel CI Pipeline"]
        Syntax["Syntax Check (check-syntax.mjs)"]
        TestCore["Test Suite (test-all.mjs)"]
        Visual["Visual Regression (playwright.cv)"]
        CodeQL["Security Audit (CodeQL Analysis)"]
    end

    Trigger --> CI_Pipeline
    CI_Pipeline --> Gate{"All Checks Green?"}
    Gate -->|Yes| Approve["Ready for Review & Merge"]
    Gate -->|No| Reject["Block Merge"]
\`\`\`

## Technical Details

### GitHub Workflows
- **\`.github/workflows/test.yml\`**:
  - Matrix testing on Node 22.x and 23.x across Ubuntu and Windows runners.
  - Executes \`scripts/check-syntax.mjs\` and \`test-all.mjs\`.
- **\`.github/workflows/codeql.yml\`**:
  - Scans for SSRF vulnerabilities, unsafe shell executions, and path traversals.
- **\`.github/workflows/cv-visual.yml\`**:
  - Executes Playwright visual snapshot regression tests on generated PDFs.

## Best Practices
- Keep CI execution time under 8 minutes to maintain rapid contributor velocity.

## Examples
\`\`\`bash
# Local pre-push verification matching CI
npm run lint && node test-all.mjs --quick
\`\`\`

## Future Enhancements
- Automated release tag creation upon merging semver-labeled PRs.
`);

// 3. Monitoring.md
writeDoc('docs/deployment/Monitoring.md', `# System Health & Monitoring — career-ops

## Purpose
Details health monitoring, system diagnostics, error telemetry, and logging standards.

## Scope
Covers \`doctor.mjs\`, \`/api/doctor\`, and \`data/scan-runs.tsv\`.

## Overview
Because career-ops is local-first, it rejects invasive cloud telemetry. System health and run metrics are recorded locally in structured TSV logs for easy inspection by the candidate.

## Diagrams

\`\`\`mermaid
flowchart TD
    Doctor["node doctor.mjs / GET /api/doctor"] --> NodeCheck["Verify Node.js Version (>=22.13)"]
    Doctor --> BrowserCheck["Verify Chromium Playwright Binary"]
    Doctor --> ConfigCheck["Validate profile.yml & portals.yml"]
    Doctor --> SQLiteCheck["Verify applications.db Derived Index"]
    
    NodeCheck & BrowserCheck & ConfigCheck & SQLiteCheck --> HealthReport["Console / UI Health Badge"]
\`\`\`

## Technical Details

### Diagnostic Capabilities (\`doctor.mjs\`)
- Asserts Node.js runtime compatibility.
- Confirms Playwright Chromium binary presence.
- Verifies integrity of candidate configuration files.
- Checks network connectivity to public ATS endpoints.

### Local Run Metrics (\`data/scan-runs.tsv\`)
- Records timestamp, provider, listings harvested, listings skipped, and execution duration for every scan sweep.

## Best Practices
- Run \`npm run doctor\` immediately after updating career-ops to detect missing system dependencies.

## Examples
\`\`\`bash
# Execute local doctor diagnostics
npm run doctor
\`\`\`

## Future Enhancements
- OpenTelemetry exporter for power users with Prometheus/Grafana home servers.
`);

// 4. Scaling.md
writeDoc('docs/deployment/Scaling.md', `# Scaling Architecture & High Throughput — career-ops

## Purpose
Guides users on scaling scan volumes, running parallel batch workers, and mitigating ATS rate limits.

## Scope
Covers \`batch/batch-runner.sh\`, \`scan-ats-full.mjs\`, and proxy configurations.

## Overview
When candidates sweep large ATS databases (e.g., 5,000+ companies across Ashby, Greenhouse, and Lever), career-ops uses memory-bounded concurrency, persistent checkpoints, and SOCKS5 proxy rotation.

## Diagrams

\`\`\`mermaid
flowchart TD
    FullScan["node scan-ats-full.mjs"] --> Checkpoint["Checkpointing (Every 500 Companies)"]
    Checkpoint --> ProxyPool["Local Proxy / Tor SOCKS5 Pool"]
    ProxyPool --> Scrapers["60+ ATS Provider Adapters"]
    Scrapers --> Dedup["scan-history.tsv (Instant Dedup)"]
    Dedup --> Inbox["data/pipeline.md"]
\`\`\`

## Technical Details

### Scaling Techniques
1. **Batch Sweep Checkpointing**:
   - \`scan-ats-full.mjs\` checkpoints progress every 500 companies. If terminated or rate-limited, passing \`--resume\` restarts from the exact stoppage point.
2. **Headless Browser Sharing**:
   - \`generate-pdf.mjs --batch\` renders dozens of CVs through a single shared Chromium instance, reducing generation time by 70%.
3. **Outbound Proxy Support**:
   - Outbound requests honor \`HTTP_PROXY\` and \`HTTPS_PROXY\` environment variables, allowing routing through residential IP pools.

## Best Practices
- Never exceed 5 concurrent Playwright workers on machines with less than 16GB of RAM.

## Examples
\`\`\`bash
# Resume interrupted full-dataset ATS sweep
node scan-ats-full.mjs --resume
\`\`\`

## Future Enhancements
- Distributed worker mesh using libp2p for collaborative public job board indexing.
`);

// 5. DisasterRecovery.md
writeDoc('docs/deployment/DisasterRecovery.md', `# Disaster Recovery & Backup Strategies — career-ops

## Purpose
Establishes backup procedures, data restoration protocols, and rollback mechanisms.

## Scope
Covers the User Layer (\`data/\`, \`cv.md\`, \`config/\`, \`reports/\`) and \`update-system.mjs rollback\`.

## Overview
A candidate's job search dossier represents months of intellectual effort. career-ops ensures that all state is stored in plain, git-friendly files that can be backed up or restored with standard tools.

## Diagrams

\`\`\`mermaid
flowchart LR
    CorruptedState["Fault / Failed Update"] --> Rollback["node update-system.mjs rollback"]
    Rollback --> SystemRestore["System Layer Restored from Backup Tag"]
    
    LostDisk["Hardware Failure"] --> RestoreBackup["Restore from Encrypted Git / Tarball"]
    RestoreBackup --> UserRestore["User Layer Restored (cv.md, data/)"]
    UserRestore --> Reindex["node tracker.mjs sync (Rebuilds SQLite)"]
\`\`\`

## Technical Details

### 1. Self-Update Rollback (\`update-system.mjs rollback\`)
- Automatically takes a git snapshot prior to executing any system upgrade.
- If an upgrade introduces a regression, running \`node update-system.mjs rollback\` restores the previous stable release cleanly.

### 2. User Layer Backup Procedure
- All candidate data lives strictly in the User Layer:
  - \`cv.md\`, \`article-digest.md\`
  - \`config/profile.yml\`, \`config/cv-facts.json\`
  - \`data/applications.md\`, \`data/status-log.tsv\`
  - \`reports/\`, \`output/\`, \`interview-prep/\`
- Backing up this directory tree ensures complete recovery.

## Best Practices
- Maintain a private, encrypted git repository for your User Layer files.
- Never store backups in public cloud storage without client-side encryption.

## Examples
\`\`\`bash
# Roll back to previous version
npm run rollback
\`\`\`

## Future Enhancements
- Automated client-side encrypted backup snapshots to private S3/GCS buckets.
`);

console.log('Deployment docs generation complete.');

