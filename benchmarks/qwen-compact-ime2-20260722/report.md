# Compact-IQ IME2 tile packing and cache — 2026-07-22

## Summary

The compact-IQ routed-MoE path now has direct IQ2_XS, IQ3_XXS, IQ4_XS and IQ4_NL packing into the IME2 `[fp16 scale][32 × int8]` layout plus a bounded cross-request LRU tile cache. The path remains opt-in.

The implementation is correct and substantially accelerates cached microkernels, but the Q2_K_XL model is still slower than the live Q4_K_M model in sustained end-to-end generation. The Q4 service was therefore restored rather than replacing it.

## Implementation

Environment controls:

- `GGML_RISCV64_SPACEMIT_IQ_IME2_TILE=1` enables compact-IQ IME2 tile dispatch.
- `GGML_RISCV64_SPACEMIT_IQ_IME2_CACHE_MB=<MiB>` sets the bounded LRU cache budget. The default while the tile gate is enabled is 64 MiB; `0` disables caching.
- Direct compact-IQ × Q8_K RVV remains the fallback when the IME2 gate is off or the cache cannot allocate an entry.

Packing changes:

- IQ4_NL and IQ4_XS decode nibbles directly through `kvalues_iq4nl` and emit Q8 bytes without a full F32 row.
- IQ3_XXS decodes grid/sign codes directly into a 32-value integer subgroup and emits Q8 bytes.
- IQ2_XS decodes only the required mixed-scale 32-value subgroup before Q8 quantisation.
- Generic bounded 256-value decode remains as a fallback.
- Cache keys include tensor address, sampled weight fingerprint, tensor geometry, expert and output-row tile.
- LRU eviction enforces the configured byte budget.

## Correctness

The deterministic routed-MoE fixture covers:

- IQ2_XS, IQ3_XXS, IQ4_XS and IQ4_NL
- routed row counts 1, 2, 4, 5 and 8
- 1 and 8 workers
- IME2 gate off and on

All 80 compact-IQ combinations completed with `bad=0` after direct packing and cache integration.

## Microkernel results

Fixture: 64 output rows, K=512, 30 repeated graph computes, eight workers.

| Type | Direct RVV, row count 1 / 8 | Cached IME2, row count 1 / 8 |
|---|---:|---:|
| IQ2_XS | 107 / 636 µs | 35 / 70 µs |
| IQ3_XXS | 86 / 519 µs | 38 / 67 µs |
| IQ4_XS | 69 / 388 µs | 35 / 69 µs |
| IQ4_NL | 302 / 2,238 µs | 36 / 67 µs |

With caching disabled, direct IME2 packing still costs approximately 1.1–1.4 ms per graph compute. Cross-request reuse is therefore essential.

## Q2_K_XL service validation

Model: `Qwen3.6-35B-A3B-UD-Q2_K_XL.gguf` (12.57 GB)

### Prompt benchmark

`llama-bench` pp128:

| Path | Prompt throughput |
|---|---:|
| Direct compact RVV | 0.894 tok/s |
| IME2 tile + cache | 1.653 tok/s |

IME2 improved pp128 by 84.9%. Both combined pp+tg `llama-bench` runs later aborted with `malloc(): invalid size (unsorted)` while transitioning between the prompt and generation subtests. Prompt-only and generation-only invocations exited cleanly, as did the persistent server lifecycle. This benchmark teardown/rebuild issue remains documented rather than ignored.

### Cache sweep at 4K context

Three-token generation after one repeat:

| Cache budget | Cold generation | Warm generation | Available memory after fill |
|---:|---:|---:|---:|
| 512 MiB | 0.335 tok/s | 0.336 tok/s | 17.65 GiB |
| 2 GiB | 0.765 tok/s | 5.93 tok/s | 14.65 GiB |
| 4 GiB | 1.17 tok/s | 5.96 tok/s | 12.26 GiB |

The recurrent working set exceeds 512 MiB. Short generations fit within 2 GiB, but longer expert-routing sequences expand the working set.

### 16K context and sustained generation

| Cache budget | Warm 16-token generation | Warm 64-token generation | Available memory after fill |
|---:|---:|---:|---:|
| 2 GiB | 0.585 tok/s | not run | 14.31 GiB |
| 4 GiB | 1.069 tok/s | not run | 10.29 GiB |
| 8 GiB | 4.356 tok/s | 2.429 tok/s | 6.29 GiB |

The 8 GiB profile successfully loaded at 16K context and reproduced after a complete server restart. Restart validation yielded 2.414 tok/s over 64 warm tokens.

Native MTP draft-1 did not help Q2: 2.380 tok/s warm over 64 tokens with 72% acceptance, versus 2.429 tok/s without speculation.

## Decision

Do not replace the live Q4 service yet.

The best validated Q2 profile is:

```text
GGML_RISCV64_SPACEMIT_IQ_IME2_TILE=1
GGML_RISCV64_SPACEMIT_IQ_IME2_CACHE_MB=8192
context=16384
workers=8
batch=2048
microbatch=512
KV=q8_0/q8_0
MTP=off
```

It provides four times the current live context and much more model-file headroom, but sustained warm generation is only about 2.4 tok/s. The restored Q4 service produced 6.10 tok/s in its final health request and remains the better interactive default.

The next optimization, if pursued, should be cache admission/segmentation by layer and expert frequency rather than a larger global LRU. The current cache proves that IME2 compute is fast once tiles remain resident; eviction churn is now the production bottleneck.

## Live service after test

The Q4_K_M draft-1 service was restored on port 8090 and verified:

- health: HTTP 200 / `{"status":"ok"}`
- short generation: 6.104 tok/s
- available memory: approximately 8.5 GiB
- no restart-window abort, corruption, segmentation or service errors
