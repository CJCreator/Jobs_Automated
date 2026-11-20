# Provider parity

ADR 0003: before a provider is offered, or a trial model is used, the same fixtures run through it and the fact-gate pass rate and keyword coverage are recorded here. Free models may pass the fact check less often than paid ones, and the user sees which model they are on.

A provider or trial model stays hidden until its row below exists and the owner has signed it. Hidden means: not in `launchProviders()` (OpenAI and Groq stay off `ROLEWRIGHT_EXTRA_PROVIDERS`), and no `ROLEWRIGHT_TRIAL_*` key and model set in production.

## How to run it

From `apps/web`. The script calls the same library functions as the tailorings route (line selection, `suggestRewrites`, `buildSuggestions` with the engine fact gate), against 5 invented resumes and 5 job descriptions in `tests/fixtures/parity/`. It exits non-zero when the engine gate cannot load.

Offline, against the mock provider (no key; the mock invents claims on purpose, so most rewrites block):

```
ROLEWRIGHT_ALLOW_MOCK_LLM=1 node scripts/provider-parity.mjs --provider mock
```

With a real key. The key comes from `PARITY_KEY` in your shell only. It is never an argument, and is never printed, logged or written:

```
PARITY_KEY=... node scripts/provider-parity.mjs --provider gemini --model <model id> --out ../../docs/reviews/provider-parity-runs.md
```

Providers: `gemini`, `openrouter`, `anthropic`; `openai` and `groq` when named in `ROLEWRIGHT_EXTRA_PROVIDERS`. To run the trial models exactly as the server would (reads `ROLEWRIGHT_TRIAL_GEMINI_KEY`, `_MODEL`, `ROLEWRIGHT_TRIAL_OPENROUTER_KEY`, `_MODEL`):

```
node scripts/provider-parity.mjs --trial --out ../../docs/reviews/provider-parity-runs.md
```

Do not commit run output that you have not read. It holds counts and fixture ids only, never resume, job or model text.

## Reading the table

- **rewrites**: usable rewrites the model returned (a known line, once, with text). Free models may return too few to measure, so read the counts, not only the rates.
- **pass / warn / block**: the check verdict on each rewrite. The summary row also gives the share of checked rewrites.
- **block issue kinds**: the kinds of issue behind blocks, counted per issue (a rewrite can have several).
- **coverage before / after**: job keywords found in the resume, as covered/total, before and after every non-blocked rewrite is applied.
- **error**: `none`, or the error code of a failed call (for example `quota`, `rate_limited`, `invalid_key`). A failed fixture has zero rewrites.

## What "accepted" means

A row is accepted when the owner reads it and signs it in the table below. There is no automatic threshold. Things to weigh: the share of rewrites that pass or warn, whether blocks are mostly honest catches (invented figures, tools, employers) or false blocks, and whether coverage rises. A model that returns too little to judge is not accepted on that run.

## Accepted runs

| Date | Provider | Model | Rewrites | Pass | Warn | Block | Coverage before / after | Signed by |
|---|---|---|---|---|---|---|---|---|
| | | | | | | | | |
