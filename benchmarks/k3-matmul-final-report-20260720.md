# SpaceMIT K3 RVV/IME2 matmul campaign

Date: 20 July 2026  
Branch: `perf/k3-rvv-ime2-matmul-20260719`  
Baseline: `26e8b4f869ece5bda3880fc186c0b501ceb2db14`  
Final tested commit before this report: `868175a00403`

## Result

The existing automatic IME2 scheduler remains the default. Per-call compact-IQ packing is slower than direct compact RVV for the tested MoE tiles. Persistent load-time IQ-to-Q8_0 repacking is much faster after amortisation, but its 1.89–3.68× weight expansion makes it an opt-in path on memory-constrained systems.

The campaign added reproducible model benchmarks, matmul tracing and schedule controls, Q4_K edge coverage, a compact-IQ MoE fixture, a persistent-trait dispatch fix and a one-thread TCM deadlock fix. No speculative scheduler or compact-IQ mode was enabled by default.

## Existing model paths

The immutable model baselines used eight threads and isolated prompt and generation processes:

| Model | Case | Baseline, tok/s | Final branch, tok/s | Change |
|---|---:|---:|---:|---:|
| Qwen3.6-35B-A3B Q4_K_M | pp64 | 30.521 | 29.148 | -4.5% |
| Qwen3.6-35B-A3B Q4_K_M | pp128 | 32.238 | 30.055 | -6.8% |
| Qwen3.6-35B-A3B Q4_K_M | tg32 | 6.583 | 6.007 | -8.7% |

The branch provides no model-level speed-up for the existing Q4_K A3B model. Forced TCM-B scheduling gave small wins in selected A3B cases but regressed Gemma and larger prompts. The attempted automatic preferences were reverted. `auto` remains the evidence-based scheduler default.

`llama-bench` still emits valid JSON and then sometimes aborts during SpaceMIT teardown with `malloc(): invalid size (unsorted)`. The harness accepts exit 134 only after validating a non-empty result. This campaign did not change that pre-existing teardown behaviour.

## Compact-IQ MoE

The focused fixture covers IQ2_XS, IQ3_XXS, IQ4_XS and IQ4_NL; activation-row counts 1, 4 and 5; and one and eight compute threads. It compares three modes:

- direct compact RVV;
- per-call compact decode and IME2 tile packing;
- persistent load-time IQ-to-Q8_0 repacking followed by the standard IME path.

All 72 final mode/type/row/thread combinations passed with `bad=0`. Direct compact NMSE was about 1.47e-5–1.69e-5 for IQ2/IQ3/IQ4_XS and 2.4e-14–3.3e-14 for IQ4_NL. Tiled and persistent modes produced about 1.3e-5–3.0e-5 NMSE. One- and eight-thread outputs matched.

Persistent repacking reduced focused compute time from 67–1,401 microseconds to 21–35 microseconds, a 3.13–40.42× speed-up over direct RVV. Its one-time packing cost broke even after 1.9–211.8 calls. Per-call IME2 packing cost about 1.4–1.9 milliseconds and lost every tested comparison.

| Source type | Persistent Q8 size multiplier |
|---|---:|
| IQ2_XS | 3.68× |
| IQ3_XXS | 2.78× |
| IQ4_XS | 2.00× |
| IQ4_NL | 1.89× |

A real Qwen3.6-35B-A3B IQ4_XS fixture contained 381 IQ4_XS tensors and occupied 18.05GiB. Direct mode reached 31,968,588KiB peak RSS and did not finish pp64 within the 1,200-second limit. The K3 has 31GiB RAM and no swap. Persistent Q8 repacking cannot fit safely on this host, so `GGML_RISCV64_SPACEMIT_IQ_MOE_REPACK` remains disabled by default. Memory-rich deployments can enable it explicitly after checking model size and reuse.

## Correctness and service validation

The final focused run passed these tests at one and eight threads:

- F32 projection-to-Q8;
- BF16 projection-to-Q8;
- Q4_K rows 1–9 and 32, including m1, m4 and mixed tails;
- compact-IQ direct RVV;
- compact-IQ per-call IME2;
- compact-IQ persistent repack.

The restored Gemma 4 E2B QAT MTP service uses four 65,536-token slots. It completed 32 concurrent validation requests in eight rounds, all with HTTP 200. Per-request generation ranged from 9.31 to 12.51 tok/s. The service stayed active, `/health` returned `{"status":"ok"}`, and all four slots returned idle after each round.

## Defaults

- Keep `GGML_RISCV64_SPACEMIT_MATMUL_SCHEDULE=auto`.
- Keep `GGML_RISCV64_SPACEMIT_IQ_IME2_TILE` disabled.
- Keep `GGML_RISCV64_SPACEMIT_IQ_MOE_REPACK` disabled unless memory sizing proves the expanded model fits.
- Keep compact-IQ direct RVV as the memory-safe fallback.
- Keep the production Gemma service at four 65,536-token slots with MTP.

Detailed evidence is in:

- `benchmarks/k3-matmul-baseline-20260719.md`;
- `benchmarks/k3-matmul-profile-20260719.md`;
- `benchmarks/k3-matmul-schedule-sweep-20260720.md`;
- `benchmarks/k3-matmul-correctness-20260720.md`;
- `benchmarks/k3-compact-iq-correctness-20260720.md`;
- `benchmarks/k3-compact-iq-crossover-20260720.md`.
