import fs from 'node:fs';
import path from 'node:path';

function writeDoc(relPath, content) {
  const fullPath = path.resolve(relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content.trim() + '\n', 'utf8');
  console.log(`Generated: ${relPath}`);
}

// 1. TestingStrategy.md
writeDoc('docs/testing/TestingStrategy.md', `# Testing Strategy & QA Architecture — career-ops

## Purpose
Establishes the quality assurance philosophy, test pyramid, test categorization, and CI gating standards.

## Scope
Covers syntax linting, unit tests, provider integration tests, visual regression, and migration safety.

## Overview
career-ops enforces rigorous, multi-layered quality gates. Because candidate reputation and application data integrity are at stake, test suites cover everything from regex SSRF protections to visual pixel drift in rendered CVs.

## Diagrams

\`\`\`mermaid
flowchart TD
    subgraph TestPyramid ["The career-ops Test Pyramid"]
        Visual["Visual E2E: Playwright CV Snapshot Tests (tests/cv-visual/)"]
        Migration["Migration Safety: updater-migration-tests.mjs"]
        Integration["Integration: Provider & Pipeline Tests (tests/providers/*)"]
        Unit["Unit Tests: Fact-checkers, Math, Parsers (tests/*.test.mjs)"]
        Lint["Fast Syntax Guard: scripts/check-syntax.mjs (1,900+ files)"]
    end

    Visual --- Migration
    Migration --- Integration
    Integration --- Unit
    Unit --- Lint
\`\`\`

## Technical Details

### Quality Gate Hierarchy
1. **Syntax Linting (\`scripts/check-syntax.mjs\`)**:
   - Compiles every \`.mjs\` file using Node's native parser without executing code.
   - Executes across 1,900+ files in under 4 seconds.
2. **Auto-Discovered Unit Suites (\`tests/**/*.test.mjs\`)**:
   - Discovered automatically by \`test-all.mjs\`.
   - Uses zero-dependency assertions from \`tests/helpers.mjs\`.
3. **Provider Contract Tests (\`tests/providers/*.test.mjs\`)**:
   - Asserts that every ATS scraper parses live or mocked job payloads correctly into standard \`Job\` objects.
4. **Data Contract & Migration Gates (\`updater-migration-tests.mjs\`)**:
   - Guarantees that updates never touch User Layer files and that rollback mechanisms function cleanly.
5. **Visual CV Regression (\`playwright.cv.config.mjs\`)**:
   - Playwright renders PDFs and compares pixel-diff snapshots against golden reference images.

## Best Practices
- Never check in tests that invoke \`process.exit()\`.
- Always mock external network calls in provider unit tests using local fixture files.

## Examples
\`\`\`bash
# Full comprehensive test run
node test-all.mjs

# Fast syntax check
npm run lint
\`\`\`

## Future Enhancements
- Automated fuzz testing for job posting HTML extraction.
`);

// 2. UnitTesting.md
writeDoc('docs/testing/UnitTesting.md', `# Unit Testing Guide — career-ops

## Purpose
Instructions and best practices for authoring, running, and debugging unit test suites.

## Scope
Applies to \`tests/**/*.test.mjs\`.

## Overview
Unit tests in career-ops are fast, isolated, and auto-discovered. Suites run in parallel worker processes, sharing execution status through a centralized runner.

## Diagrams

\`\`\`mermaid
flowchart LR
    Runner["test-all.mjs (Runner)"] --> Glob["Glob tests/**/*.test.mjs"]
    Glob --> Worker1["Child Worker 1 (tests/math.test.mjs)"]
    Glob --> Worker2["Child Worker 2 (tests/tracker.test.mjs)"]
    Glob --> Worker3["Child Worker 3 (tests/providers/*.test.mjs)"]
    Worker1 & Worker2 & Worker3 --> Reporter["Absorb Results & Print Summary"]
\`\`\`

## Technical Details

### Authoring Standards
- Test files must match \`tests/**/*.test.mjs\`.
- Import assertions and lifecycle utilities from \`tests/helpers.mjs\`:
  \`\`\`javascript
  import { pass, fail, results } from './helpers.mjs';

  export async function run() {
    if (1 + 1 === 2) {
      pass('Basic math passes');
    } else {
      fail('Basic math failed');
    }
  }
  \`\`\`
- Never invoke \`process.exit()\` or \`finish()\`.

## Best Practices
- Keep tests hermetic: clean up temporary fixture files in \`finally\` blocks using \`rmSync\` with retries.

## Examples
\`\`\`bash
# Run a specific unit test
node test-all.mjs --only tracker-columns
\`\`\`

## Future Enhancements
- Transition to Node.js native test runner (\`node:test\`) across all legacy test suites.
`);

// 3. IntegrationTesting.md
writeDoc('docs/testing/IntegrationTesting.md', `# Integration Testing Guide — career-ops

## Purpose
Specifies multi-component integration testing, pipeline synchronization, and updater safety validation.

## Scope
Covers \`updater-migration-tests.mjs\`, \`verify-pipeline.mjs\`, and multi-step workflows.

## Overview
Integration tests verify that disparate subsystems (CLI scripts, SQLite indices, lock files, and Markdown tables) interact harmoniously without race conditions or data loss.

## Diagrams

\`\`\`mermaid
sequenceDiagram
    autonumber
    participant Test as updater-migration-tests.mjs
    participant Temp as Isolated Temp Workspace
    participant Updater as update-system.mjs
    participant Contract as DATA_CONTRACT.md

    Test->>Temp: Seed sandbox with User Layer files (cv.md, tracker)
    Test->>Updater: Execute update-system.mjs apply
    Updater->>Temp: Overwrite System Layer files (*.mjs)
    Updater->>Temp: Verify User Layer remains UNTOUCHED
    Test->>Contract: Assert zero overlapping paths
    Test-->>Test: PASS: Data Contract 100% Intact
\`\`\`

## Technical Details

### Integration Test Targets
1. **Pipeline Verification (\`verify-pipeline.mjs\`)**:
   - Asserts tracker status validity against \`templates/states.yml\`.
   - Flags orphaned report links or mismatched report IDs.
2. **Updater Migration Tests (\`updater-migration-tests.mjs\`)**:
   - Simulates upgrading from legacy career-ops versions to the latest release.
   - Validates that user customizations in \`modes/_profile.md\` survive intact.

## Best Practices
- Always run integration tests within isolated sandbox directories created via \`mkdtempSync\`.

## Examples
\`\`\`bash
# Run pipeline integrity verification
npm run verify
\`\`\`

## Future Enhancements
- Simulated concurrent batch runner race-condition testing in CI.
`);

// 4. E2ETesting.md
writeDoc('docs/testing/E2ETesting.md', `# End-to-End (E2E) & Visual Testing — career-ops

## Purpose
Covers visual regression testing for rendered PDF resumes and browser-driven portal scrapers.

## Scope
Applies to \`tests/cv-visual/\`, \`playwright.cv.config.mjs\`, and Playwright scrapers.

## Overview
Because a minor CSS drift can push a tailored resume onto an awkward second page or misalign header margins, career-ops executes automated pixel-diff visual testing using Playwright Chromium.

## Diagrams

\`\`\`mermaid
flowchart TD
    HTML["Rendered HTML CV (output/cv.html)"] --> Playwright["Playwright Chromium Headless"]
    Playwright --> Snapshot["Generate Viewport Screenshot"]
    Snapshot --> Comparator{"Pixel Comparator vs. Golden Snapshot"}
    Comparator -->|Diff < 0.1%| Pass["PASS: Visual Parity Verified"]
    Comparator -->|Diff >= 0.1%| Fail["FAIL: Visual Drift Detected"]
\`\`\`

## Technical Details

### Visual Testing Configuration
- Configuration file: \`playwright.cv.config.mjs\`.
- Tests location: \`tests/cv-visual/cv-visual.spec.mjs\`.
- Viewport: Standard Letter (\`8.5in x 11in\`) and A4 at 96 DPI.
- Snapshot update command: \`npm run test:cv-visual:update\`.

## Best Practices
- Run visual tests in a consistent Linux container in CI to prevent font-rendering discrepancies between macOS and Windows.

## Examples
\`\`\`bash
# Run CV visual regression tests
npm run test:cv-visual
\`\`\`

## Future Enhancements
- Automated Playwright E2E testing for the Next.js Web UI Kanban board.
`);

// 5. PerformanceTesting.md
writeDoc('docs/testing/PerformanceTesting.md', `# Performance Testing & Benchmarking — career-ops

## Purpose
Documents latency thresholds, throughput benchmarks, memory limits, and load testing.

## Scope
Covers ATS scraping throughput, SQLite indexing speed, and Playwright PDF generation latency.

## Overview
Performance is critical when candidates sweep hundreds of company boards. career-ops establishes strict performance budgets to guarantee snappy local execution.

## Diagrams

\`\`\`mermaid
gantt
    title Typical Single-Offer Performance Profile
    dateFormat X
    axisFormat %s ms
    section Pre-Flight
    Liveness Check (check-liveness.mjs) :0, 450
    Blacklist & Dealbreaker Gate       :450, 480
    section AI Inference
    A-H Deep Evaluation (LLM API)      :480, 2800
    section Asset Prep
    Fact Verification (verify-cv-facts):2800, 2920
    Playwright PDF Generation          :2920, 4200
    SQLite Derived Index Sync          :4200, 4250
\`\`\`

## Technical Details

### Performance Budgets
- **Syntax Check (\`check-syntax.mjs\`)**: $< 5.0$ seconds for 1,900+ files.
- **SQLite Index Sync (\`tracker.mjs sync\`)**: $< 100$ ms for 500 applications.
- **Zero-Token Scrape Throughput**: $> 20$ job listings per second per ATS board.
- **PDF Generation**: $< 2.0$ seconds per document via Playwright Chromium.

## Best Practices
- Use batch rendering (\`generate-pdf.mjs --batch\`) to share a single Chromium browser instance across multiple documents.

## Examples
\`\`\`bash
# Benchmark SQLite re-indexing speed
time node tracker.mjs sync
\`\`\`

## Future Enhancements
- Continuous performance benchmarking tracked in GitHub Actions.
`);

console.log('Testing docs generation complete.');
