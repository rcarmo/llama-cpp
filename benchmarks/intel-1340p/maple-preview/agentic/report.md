# Maple Preview agentic comparison

Maple Preview does not replace Gemma 4 E4B as the primary local Pi provider. Maple has faster prompt ingestion and completed the disposable code-edit task faster, but Gemma generated faster, selected a narrower tool query, and produced the cleaner edit.

## Method

Both models used the same llama.cpp build and the same six API requests. Services ran serially to avoid CPU and memory interference. The final requests used bounded reasoning:

- 96 reasoning tokens and 192 total tokens for the missing-evidence case;
- 128 reasoning tokens and 256 total tokens for tools and strict JSON;
- 256 reasoning tokens and 1,024 total tokens for broad engineering prose.

The corpus contains:

- required repository search;
- dependent cached follow-up;
- strict JSON instruction following;
- missing-evidence refusal;
- implementation debugging;
- repository implementation planning.

The Pi edit case used a disposable TypeScript repository. Each model had `read`, `edit`, and `bash`, had to fix `src/clamp.ts`, and had to run `bun test`. An independent test ran after Pi exited.

## API results

| Case | Maple | Gemma | Maple wall | Gemma wall |
|---|---|---|---:|---:|
| Missing-evidence refusal | Pass | Pass | 7.60 s | 5.62 s |
| Cached follow-up | Pass | Pass | 18.74 s | 20.54 s |
| Strict JSON | Pass | Pass | 5.14 s | 5.21 s |
| Required tool | Pass | Pass | 13.76 s | 7.38 s |
| Implementation debugging | 1,024-token limit | 1,024-token limit | 60.14 s | 63.11 s |
| Repository planning | 1,024-token limit | 1,024-token limit | 62.23 s | 52.47 s |

Both models obeyed the reasoning budget and produced visible answers for the missing-evidence case. Both broad engineering prompts produced substantial content but reached the 1,024-token cap. They do not pass the non-converging-prose gate.

Gemma generated faster in five of six final cases. Maple prompt ingestion was faster because its compact model processes the prompt at about 63-75 tokens/s in this corpus. Gemma processed uncached prompt tokens at about 26-65 tokens/s and benefited from prefix caching on several requests.

The tool requests differed:

- Gemma requested `max_results: 3`, which matched the user instruction.
- Maple requested `max_results: 20` and added visible pre-tool text.

Both produced a valid `search_repository` call.

## Pi code edit

Both Pi runs fixed the implementation and passed the independent test.

| Model | Result | Time | Diff quality |
|---|---|---:|---|
| Maple | Pass | at most 113.2 s, estimated from fixture creation and final response timestamps | Correct line; added an unnecessary semicolon after the function declaration |
| Gemma | Pass | 127.1 s | Exact minimal one-line fix |

Maple's timestamp-derived upper bound is about 11% below Gemma's directly measured wall time. Gemma made the cleaner change.

## Decision

Keep `local-gemma/gemma-4-e4b-qat-mtp` as the primary operational local model. Register `local-maple/maple-preview-tq2-exact-head` as an explicit alternative for prompt-heavy tasks and evaluation. Do not change the hosted Pi default.

Evidence:

- `results/maple-final/`
- `results/gemma-final/`
- `results/comparison.json`
- `results/maple-edit.*`
- `results/gemma-edit.*`
