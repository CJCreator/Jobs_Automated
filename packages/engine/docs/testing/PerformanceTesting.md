# Performance Testing & Benchmarking — career-ops

## Purpose
Documents latency thresholds, throughput benchmarks, memory limits, and load testing.

## Scope
Covers ATS scraping throughput, SQLite indexing speed, and Playwright PDF generation latency.

## Overview
Performance is critical when candidates sweep hundreds of company boards. career-ops establishes strict performance budgets to guarantee snappy local execution.

## Diagrams

```mermaid
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
```

## Technical Details

### Performance Budgets
- **Syntax Check (`check-syntax.mjs`)**: $< 5.0$ seconds for 1,900+ files.
- **SQLite Index Sync (`tracker.mjs sync`)**: $< 100$ ms for 500 applications.
- **Zero-Token Scrape Throughput**: $> 20$ job listings per second per ATS board.
- **PDF Generation**: $< 2.0$ seconds per document via Playwright Chromium.

## Best Practices
- Use batch rendering (`generate-pdf.mjs --batch`) to share a single Chromium browser instance across multiple documents.

## Examples
```bash
# Benchmark SQLite re-indexing speed
time node tracker.mjs sync
```

## Future Enhancements
- Continuous performance benchmarking tracked in GitHub Actions.
