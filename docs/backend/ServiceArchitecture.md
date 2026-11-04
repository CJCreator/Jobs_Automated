# Service Architecture — career-ops

## Purpose
Details the internal service topology, command dispatching, batch execution model, and background workers.

## Scope
Covers root execution scripts, `openrouter-runner.mjs`, and `batch/batch-runner.sh`.

## Overview
career-ops executes as an on-demand process engine rather than a daemon service. Tasks are dispatched as isolated Node.js child processes or headless AI CLI instances, coordinating execution through state ledgers.

## Diagrams

```mermaid
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
```

## Technical Details

### Batch Execution Pipeline (`batch/batch-runner.sh`)
1. **Queue Definition**: Reads pending target URLs from `batch/batch-input.tsv`.
2. **State & Resume**: Tracks completion status in `batch/batch-state.tsv` so interrupted runs resume cleanly.
3. **Worker Spawning**: Runs up to `--parallel` workers simultaneously.
4. **Isolated Output**: Each worker writes an independent TSV snippet to `batch/tracker-additions/{id}.tsv`.
5. **Reconciliation**: `merge-tracker.mjs` locks the primary tracker and merges all completed rows atomically.

## Best Practices
- Never allow child workers to write directly to `data/applications.md` concurrently; always use the addition spool directory.

## Examples
```bash
# Run parallel batch worker on 10 offers
./batch/batch-runner.sh --parallel 3 --max-retries 2
```

## Future Enhancements
- Node.js native worker threads replacing shell script batch runners.
