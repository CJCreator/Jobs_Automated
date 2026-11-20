# Claims audit: what the repository claimed versus what the code did

- **Date:** 2026-11-19
- **Reviewed at:** commit `4ecbf5e`.
- **Method:** each claim's code path was found and its cheapest entry point was run. No live job-portal scans and no paid AI calls.

| Claim | Finding | Action taken |
|---|---|---|
| "740 listings evaluated, 68 applied, 12 interviews, 1 offer" | No data in the repository backs it. It is the upstream author's personal story. | Removed from README and agent guide |
| "110+ engineers landed offers" | `HIRED.md` and `docs/hired-count.json` both said 22. | Removed with the Hired Wall |
| "Zero-fabrication" fact gate | The engine gate's self-test passes, but invented employer names ("at Acme Corp") and some unit-bearing metrics ("14M evaluations per month") passed when absent from the source. Forbidden-phrase checks are skipped without `config/cv-facts.json`. | Phase 0 blocker (ADR 0005) |
| Ghost-job detection | `lib/scanners/ghost-job-detector.mjs` passes its tests, but nothing calls it. | Kept in the engine, not surfaced |
| Multi-agent enclave and negotiation simulator | Stubs with hardcoded scores and fixed multipliers. | Removed |
| SQLite derived index | Works on a fixture; 4 of 13 service tests failed. | Kept in the engine |
| Go terminal dashboard | Built and ran. | Removed by the owner's choice |
| "60+ zero-token ATS scrapers" | 130 provider modules load (not all are ATS APIs). No live fetch was run. | Kept for future job discovery |
| Playwright PDF export | Entry point runs; rendering needs Chromium installed. | Used by `apps/web` export |
