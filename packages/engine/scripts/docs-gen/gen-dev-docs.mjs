import fs from 'node:fs';
import path from 'node:path';

function writeDoc(relPath, content) {
  const fullPath = path.resolve(relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content.trim() + '\n', 'utf8');
  console.log(`Generated: ${relPath}`);
}

// 1. SetupGuide.md
writeDoc('docs/development/SetupGuide.md', `# Setup & Installation Guide — career-ops

## Purpose
Provides end-to-end instructions for installing and configuring career-ops on a local machine.

## Scope
Covers prerequisites, Node.js installation, Playwright browser setup, Go TUI compilation, and initial configuration.

## Overview
career-ops runs locally on your workstation. It requires Node.js 22.13+, Playwright Chromium (for PDF generation and web extraction), and optionally Go (for the terminal dashboard).

## Diagrams

\`\`\`mermaid
flowchart TD
    Clone["git clone https://github.com/career-ops-hq/career-ops.git"] --> Install["npm install"]
    Install --> Browsers["npx playwright install chromium"]
    Browsers --> Doctor["npm run doctor"]
    Doctor --> Config["Copy config templates (.env, profile.yml)"]
    Config --> Populate["Author cv.md & portals.yml"]
    Populate --> Ready["System Ready: npm test"]
\`\`\`

## Technical Details

### Prerequisites
- **Node.js**: Version \`^22.13.0 || >=23.4.0\`.
- **Git**: Required for updater tracking.
- **Go (Optional)**: Version 1.22+ if compiling the terminal TUI in \`dashboard/\`.

### Installation Steps
\`\`\`bash
# 1. Clone repository
git clone https://github.com/career-ops-hq/career-ops.git
cd career-ops

# 2. Install dependencies & Playwright Chromium
npm install

# 3. Run automated system diagnostics
npm run doctor

# 4. Initialize candidate profile & environment
cp .env.example .env
cp config/profile.example.yml config/profile.yml
cp cv-facts.example.json config/cv-facts.json
\`\`\`

## Best Practices
- Never commit \`.env\` or personal files in \`data/\` to a public git fork.
- Ensure \`npm run doctor\` passes all health checks before starting evaluations.

## Examples
\`\`\`bash
# Run doctor verification
node doctor.mjs
\`\`\`

## Future Enhancements
- Interactive single-command setup wizard (\`npm run init\`).
`);

// 2. LocalDevelopment.md
writeDoc('docs/development/LocalDevelopment.md', `# Local Development Guide — career-ops

## Purpose
Guides developers on day-to-day coding, debugging, running tests, and adding features to career-ops.

## Scope
Covers CLI development, Web UI development, provider authoring, and test execution.

## Overview
Developing on career-ops involves working with Node.js ESM modules, Next.js components, or Go TUI models. A tight feedback loop is maintained via automated syntax checkers and fast test filtering.

## Diagrams

\`\`\`mermaid
flowchart LR
    EditCode["Edit Code / Provider"] --> Lint["npm run lint (Syntax Check)"]
    Lint --> QuickTest["node test-all.mjs --quick"]
    QuickTest --> SpecificTest["node test-all.mjs --only <provider>"]
    SpecificTest --> Verify["npm run verify"]
\`\`\`

## Technical Details

### Development Commands
\`\`\`bash
# 1. Check syntax across all 1,900+ .mjs files (< 5s)
npm run lint

# 2. Run fast test suite (skips dashboard build)
node test-all.mjs --quick

# 3. Run tests matching a specific pattern
node test-all.mjs --only providers/ashby

# 4. Start Next.js local development server
cd web
npm run dev
# Open http://localhost:3000
\`\`\`

### Developing a New Provider
1. Create \`providers/{name}.mjs\`.
2. Follow the contract in \`providers/ADDING_A_PROVIDER.md\`.
3. Create corresponding test in \`tests/providers/{name}.test.mjs\`.
4. Test discovery with \`node test-all.mjs --only providers/{name}\`.

## Best Practices
- Place new tests in \`tests/\` as \`*.test.mjs\` files; do not edit the legacy inline sections of \`test-all.mjs\`.
- Always verify SSRF guards when adding HTTP network calls.

## Examples
\`\`\`bash
# Test visual CV rendering
npm run test:cv-visual
\`\`\`

## Future Enhancements
- Dockerized local development environment with hot-reloading for all services.
`);

// 3. CodingStandards.md
writeDoc('docs/development/CodingStandards.md', `# Coding Standards & Conventions — career-ops

## Purpose
Defines code style, module conventions, error handling standards, and architectural hygiene for career-ops.

## Scope
Applies to all JavaScript (\`.mjs\`), TypeScript (\`.ts\`, \`.tsx\`), and Go code in the repository.

## Overview
Consistency is critical in a repository containing over 1,900 ESM files. We enforce strict path resolution, atomic file writes, deterministic error handling, and separation of user and system layers.

## Diagrams

\`\`\`mermaid
flowchart TD
    Rule1["1. Use path-resolver.mjs (Never __dirname)"]
    Rule2["2. Atomic File Writes (writeFileAtomic)"]
    Rule3["3. Strict Data Contract Separation"]
    Rule4["4. Untrusted Content Boundary"]
    Rule5["5. No-Fabrication Anti-Hallucination"]
\`\`\`

## Technical Details

### Key Standards
1. **ESM Imports**: All JavaScript files must use explicit \`.mjs\` or \`.js\` extensions in import specifiers.
2. **Path Resolution**: Never construct absolute paths using \`process.cwd()\` or \`__dirname\` for User Layer files. Always call:
   \`\`\`javascript
   import { getCareerOpsRoot, resolveTrackerPath } from './path-resolver.mjs';
   const root = getCareerOpsRoot();
   const tracker = resolveTrackerPath(root);
   \`\`\`
3. **Atomic Writes**: Any script updating Markdown tables or JSON files must write to a temporary file first and rename atomically to avoid partial writes.
4. **No Process.exit in Tests**: Discovered test suites must use \`pass()\` and \`fail()\` from \`tests/helpers.mjs\` and never invoke \`process.exit()\`.

## Best Practices
- Preserve existing comments and docstrings.
- Ensure all public functions carry descriptive JSDoc type annotations.

## Examples
\`\`\`javascript
// Good: Safe atomic file write
import { writeFileAtomic } from './tracker-utils.mjs';
writeFileAtomic(canonicalPath, data);

// Bad: Corruptible write
fs.writeFileSync(canonicalPath, data);
\`\`\`

## Future Enhancements
- Gradual adoption of strict TypeScript checking (\`tsc --checkJs\`) across all \`lib/\` modules.
`);

// 4. BranchingStrategy.md
writeDoc('docs/development/BranchingStrategy.md', `# Branching & Release Strategy — career-ops

## Purpose
Documents git branching conventions, pull request guidelines, semantic versioning, and release workflows.

## Scope
Applies to core maintainers, community contributors, and automated release systems.

## Overview
career-ops follows a **trunk-based development** model with tagged production releases. Because users update their local installations via \`update-system.mjs\`, release tags must guarantee backward compatibility and complete User Layer isolation.

## Diagrams

\`\`\`mermaid
gitGraph
    commit id: "v1.37.0" tag: "v1.37.0"
    branch feature/workday-fix
    checkout feature/workday-fix
    commit id: "fix(workday): handle pagination"
    commit id: "test(workday): add regression suite"
    checkout main
    merge feature/workday-fix id: "merge PR #1234"
    branch release/v1.38.0
    checkout release/v1.38.0
    commit id: "chore: bump version to 1.38.0"
    checkout main
    merge release/v1.38.0 id: "v1.38.0" tag: "v1.38.0"
\`\`\`

## Technical Details

### Branches
- \`main\`: Authoritative development branch. All PRs target \`main\`.
- \`feature/*\` / \`fix/*\`: Short-lived developer feature branches.
- Tags: \`vX.Y.Z\` denotes official production releases consumed by \`update-system.mjs\`.

### Semantic Versioning (SemVer)
- **MAJOR (v2.0.0)**: Breaking changes to the Data Contract, schema changes requiring manual migration, or minimum Node.js runtime floor bumps.
- **MINOR (v1.39.0)**: New providers, new evaluation blocks, new web UI features, non-breaking CLI flags.
- **PATCH (v1.38.1)**: Bug fixes, scraper regex adjustments, security patches.

## Best Practices
- Never commit directly to \`main\`.
- Every PR must pass \`test-all.mjs\` and CodeQL scans prior to merge.

## Examples
\`\`\`bash
# Update local installation to latest stable release
node update-system.mjs check
node update-system.mjs apply --confirm
\`\`\`

## Future Enhancements
- Automated release note generation integrated with GitHub Releases.
`);

// 5. ContributionGuide.md
writeDoc('docs/development/ContributionGuide.md', `# Contribution Guide — career-ops

## Purpose
Provides guidelines for community developers contributing bug fixes, new job providers, features, or documentation.

## Scope
Covers issue triage, coding standards, PR templates, and licensing.

## Overview
We welcome community contributions! The most impactful way to contribute is by adding new job board adapters to \`providers/\` or refining evaluation modes.

## Diagrams

\`\`\`mermaid
flowchart TD
    Fork["Fork & Clone Repository"] --> Branch["git checkout -b feature/my-feature"]
    Branch --> Code["Write Code + Unit Tests"]
    Code --> Lint["npm run lint"]
    Lint --> Test["node test-all.mjs --quick"]
    Test --> Push["git push origin feature/my-feature"]
    Push --> PR["Open Pull Request on GitHub"]
    PR --> CI{"CI Checks Pass?\n(CodeQL, Test, CodeRabbit)"}
    CI -->|Yes| Merge["Maintainer Review & Merge"]
    CI -->|No| Fix["Address Failures"]
    Fix --> Code
\`\`\`

## Technical Details

### Contribution Checklist
1. **Source Indexing Policy**: Ensure target job sources are public, free for candidates, and comply with \`robots.txt\`.
2. **Provider Contract**: Must export \`name\`, \`detect(url)\`, and \`fetchJobs(boardId)\`.
3. **Dedicated Test**: Every provider must include a test suite in \`tests/providers/{name}.test.mjs\`.
4. **Data Contract Compliance**: Verify no changes touch User Layer files (\`DATA_CONTRACT.md\`).

## Best Practices
- Keep PRs focused on a single concern.
- Reference relevant GitHub issue numbers in commit messages and descriptions.

## Examples
- See \`providers/ashby.mjs\` and \`tests/providers/ashby.test.mjs\` as gold-standard reference implementations.

## Future Enhancements
- Contributor recognition badges on the community showcase board.
`);

// 6. EnvironmentVariables.md
writeDoc('docs/development/EnvironmentVariables.md', `# Environment Variables Reference — career-ops

## Purpose
Exhaustive reference of all configuration flags, API keys, and environment variables recognized by career-ops.

## Scope
Covers runtime paths, privacy controls, AI API keys, and testing overrides.

## Overview
career-ops reads configuration from environment variables or a local \`.env\` file in the workspace root.

## Diagrams

\`\`\`mermaid
flowchart LR
    Env[".env File / System Environment"] --> PathVars["Path Resolution Vars\n(CAREER_OPS_ROOT)"]
    Env --> PrivacyVars["Privacy & Security Vars\n(PRIVACY_REDACT)"]
    Env --> APIVars["AI Provider Keys\n(OPENROUTER_API_KEY)"]
    Env --> TestVars["Test & Engine Flags\n(CAREER_OPS_TEST_JOBS)"]
\`\`\`

## Technical Details

### Comprehensive Variable Reference

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| \`CAREER_OPS_ROOT\` | \`process.cwd()\` | Explicit override for the User Layer data root. |
| \`CAREER_OPS_TRACKER\` | \`{ROOT}/data/applications.md\` | Explicit path to the canonical applications tracker file. |
| \`PRIVACY_REDACT\` | \`0\` (Block) | Set to \`1\` to enable placeholder token redaction instead of blocking outbound PII. |
| \`OPENROUTER_API_KEY\` | - | API key for OpenRouter models (\`openrouter-runner.mjs\`). |
| \`GEMINI_API_KEY\` | - | API key for Google Gemini evaluation (\`gemini-eval.mjs\`). |
| \`OPENAI_API_KEY\` | - | API key for OpenAI-compatible evaluation endpoints. |
| \`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD\` | \`false\` | Set to \`1\` to skip automatic Chromium download during \`npm install\`. |
| \`CAREER_OPS_TEST_JOBS\` | CPU count | Maximum concurrent worker processes for \`test-all.mjs\`. |
| \`CAREER_OPS_HEADLESS\` | \`0\` | Signals to modes that execution is unattended (no interactive prompts). |

## Best Practices
- Never commit production API keys to git.
- Use \`.env.example\` as the template for new deployments.

## Examples
\`\`\`bash
# Example .env configuration
CAREER_OPS_ROOT=/Users/alex/my-job-search
PRIVACY_REDACT=1
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxx
\`\`\`

## Future Enhancements
- Encrypted secrets management using local OS keyrings.
`);

// 7. APIDevelopmentGuide.md
writeDoc('docs/development/APIDevelopmentGuide.md', `# API Development Guide — career-ops

## Purpose
Guides developers on authoring, testing, and securing Next.js route handlers in \`web/src/app/api/\`.

## Scope
Applies to all HTTP endpoints exposed by the Web UI.

## Overview
All Web UI API routes operate locally, binding to \`127.0.0.1\`. Route handlers act as orchestrators that execute core CLI scripts or read local Markdown files directly, returning standardized JSON payloads.

## Diagrams

\`\`\`mermaid
sequenceDiagram
    autonumber
    participant Client as Frontend UI / Client
    participant Route as Next.js Route Handler
    participant Core as Core Script (*.mjs)
    participant Disk as Local File System

    Client->>Route: POST /api/tracker/update { id: 12, status: "Applied" }
    Route->>Route: Validate payload schema
    Route->>Core: Execute set-status.mjs 12 Applied
    Core->>Disk: Atomic write data/applications.md
    Core-->>Route: Return exit 0
    Route-->>Client: 200 OK { success: true }
\`\`\`

## Technical Details

### API Route Conventions
1. **Directory Structure**: \`web/src/app/api/{resource}/route.ts\`.
2. **HTTP Methods**: Explicitly export \`GET\`, \`POST\`, \`DELETE\`, etc.
3. **Response Envelope**: Standardized JSON responses:
   \`\`\`typescript
   interface ApiResponse<T> {
     success: boolean;
     data?: T;
     error?: string;
   }
   \`\`\`
4. **Input Validation**: Validate query params and JSON bodies before triggering filesystem or CLI operations.

## Best Practices
- Never expose sensitive system paths in API error messages.
- Always handle child process exit codes gracefully.

## Examples
\`\`\`typescript
import { NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function POST(request: Request) {
  try {
    const { id, status } = await request.json();
    await execFileAsync('node', ['set-status.mjs', String(id), status]);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
\`\`\`

## Future Enhancements
- Zod schema validation across all API route handlers.
`);

console.log('Development docs generation complete.');

