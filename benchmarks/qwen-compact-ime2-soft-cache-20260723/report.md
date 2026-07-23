# Shared compact-IQ cache architecture — 2026-07-23

The compact-IQ IME2 cache now enforces one byte ceiling across IQ2_XS, IQ3_XXS, IQ4_XS and IQ4_NL. Q2_K_XL reaches 3.58 tok/s at 16K context with a 14 GiB shared tile cache and leaves 4.39 GiB available.

## Corrected architecture

Commit `174d56427` replaced four per-format managers with one shared manager. The final policy retains:

- tensor-safe keys with sampled weight fingerprints;
- one aggregate byte ceiling across compact formats;
- layer and expert routing metadata shared across gate/up/down projections;
- global tile-granular LRU reclamation;
- optional protected expert pool with soft per-layer reservations;
- scratch packing on allocation or cache bypass;
- bounded telemetry for hits, misses, admissions, demotions, evictions and bytes.

`GGML_RISCV64_SPACEMIT_IQ_IME2_CACHE_BYTES` provides a byte-level diagnostic ceiling. Production uses `GGML_RISCV64_SPACEMIT_IQ_IME2_CACHE_MB`.

## Correctness and pressure tests

The fixture passed all 80 combinations:

- IQ2_XS, IQ3_XXS, IQ4_XS and IQ4_NL;
- routed rows 1, 2, 4, 5 and 8;
- one and eight workers;
- IME2 off and on.

A forced 50,000-byte ceiling preserved correctness, reached a 34,816-byte peak and evicted probationary tiles under pressure.

## Q2 service results

Model: `Qwen3.6-35B-A3B-UD-Q2_K_XL.gguf`; 16K context; eight workers; batch 2,048; microbatch 512; q8_0 K/V; 64 generated tokens.

### Shared tile-LRU ceiling

| Shared ceiling | Warm generation | Cached prompt | Available memory |
|---:|---:|---:|---:|
| 8 GiB | 0.962 tok/s | 0.684 tok/s | not retained |
| 10 GiB | 1.201 tok/s | 0.711 tok/s | 8.30 GiB |
| 12 GiB | 1.670 tok/s | 0.877 tok/s | 6.32 GiB |
| 14 GiB | 3.585 tok/s | 6.625 tok/s | 4.39 GiB |
| 14 GiB, restart | 3.583 tok/s | 6.606 tok/s | comparable |

The 14 GiB run and restart produced identical cache telemetry: 3,839,120 hits, 507,664 misses, 75,555 evicted tiles and a 15,032,382,464-byte peak below the configured ceiling.

### Expert protection experiments

| Policy | Warm generation | Result |
|---|---:|---|
| Whole-expert eviction, immediate admission | 1.30 tok/s | Regressed; 8,500+ expert evictions |
| Whole-expert eviction, three-route admission | 1.37 tok/s | Regressed |
| 25% protected pool, two-route promotion | 0.70 tok/s | Promotion/demotion churn |
| 5% protected pool, three-route promotion | 0.59 tok/s | Promotion/demotion churn |

Qwen's routing changes too often for expert-level protection to help at these pool sizes. The promoted default is therefore a 0% protected pool: shared global tile LRU. Expert protection remains an opt-in diagnostic control for other models.

## Correction to the 22 July result

The earlier report described 2.41 tok/s as an 8 GiB cache result. The cache state was held separately by four static format traits, so each compact format could consume its own 8 GiB ceiling. That result did not enforce an 8 GiB aggregate limit and must not be used as the shared-ceiling baseline.

## Controls

| Variable | Meaning | Default |
|---|---|---:|
| `GGML_RISCV64_SPACEMIT_IQ_IME2_CACHE_MB` | Aggregate cache ceiling in MiB | 64 |
| `GGML_RISCV64_SPACEMIT_IQ_IME2_CACHE_BYTES` | Diagnostic byte ceiling | unset |
| `GGML_RISCV64_SPACEMIT_IQ_IME2_PROTECTED_PCT` | Optional protected expert pool | 0 |
| `GGML_RISCV64_SPACEMIT_IQ_IME2_CACHE_ADMIT_ROUTES` | Routes before expert protection | 1 |
| `GGML_RISCV64_SPACEMIT_IQ_IME2_LAYER_RESERVE_PCT` | Protected-pool share reserved softly across layers | 50 |
| `GGML_RISCV64_SPACEMIT_IQ_IME2_CACHE_PROFILE` | Emit aggregate shutdown telemetry | off |

## Deployment decision

The corrected manager and shared tile-LRU are suitable for opt-in use. The Q2 14 GiB profile is the fastest valid long-context result, but Q4_K_M remains the production service because it is still faster and leaves a larger operational margin. Q4 was restored after every test window and passed the final health check.
