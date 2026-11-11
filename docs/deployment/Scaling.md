# Scaling Architecture & High Throughput — career-ops

## Purpose
Guides users on scaling scan volumes, running parallel batch workers, and mitigating ATS rate limits.

## Scope
Covers `batch/batch-runner.sh`, `scan-ats-full.mjs`, and proxy configurations.

## Overview
When candidates sweep large ATS databases (e.g., 5,000+ companies across Ashby, Greenhouse, and Lever), career-ops uses persistent checkpoints and a shared Chromium instance for PDF rendering. Proxy routing is limited to provider HTTP requests (see below). There is no SOCKS5 or Tor pool.

## Diagrams

```mermaid
flowchart TD
    FullScan["node scan-ats-full.mjs"] --> Checkpoint["Checkpointing (Every 500 Companies)"]
    Checkpoint --> Scrapers["ATS Provider Adapters (providers/)"]
    Scrapers --> Dedup["scan-history.tsv (Instant Dedup)"]
    Dedup --> Inbox["data/pipeline.md"]
```

## Technical Details

### Scaling Techniques
1. **Batch Sweep Checkpointing**:
   - `scan-ats-full.mjs` checkpoints progress every 500 companies. If terminated or rate-limited, passing `--resume` restarts from the exact stoppage point.
2. **Headless Browser Sharing**:
   - `generate-pdf.mjs --batch=<manifest.json>` renders every document in a JSON manifest through a single shared Chromium instance.
3. **Provider Proxy Support**:
   - Provider HTTP requests in `providers/_http.mjs` honor the `HTTP_PROXY` and `HTTPS_PROXY` environment variables (lowercase forms too). No other part of the scanner routes through a proxy, and no proxy pool is built in.

## Best Practices
- Never exceed 5 concurrent Playwright workers on machines with less than 16GB of RAM.

## Examples
```bash
# Resume interrupted full-dataset ATS sweep
node scan-ats-full.mjs --resume
```

## Future Enhancements
- Distributed worker mesh using libp2p for collaborative public job board indexing.
