# K3 matmul scheduler sweep — 2026-07-20

This sweep compares the standard IME `MUL_MAT` scheduler paths. It does not alter arithmetic kernels and does not force the separate `MUL_MAT_ID` MoE scheduler.

Environment:

- branch `perf/k3-rvv-ime2-matmul-20260719`;
- eight threads;
- isolated pp/tg processes;
- three repetitions;
- Gemma batch/ubatch 256/128;
- A3B batch/ubatch 512/128;
- production server stopped.

## Gemma 4 E2B QAT

| Schedule | pp32 tok/s | vs auto | tg32 tok/s | vs auto |
|---|---:|---:|---:|---:|
| auto | 124.022 | — | 13.2153 | — |
| tcm-a | 112.920 | -9.0% | 11.8420 | -10.4% |
| tcm-b | **124.100** | +0.1% | 13.1807 | -0.3% |
| direct | 112.765 | -9.1% | 11.8332 | -10.5% |

Auto and TCM-B are equivalent within noise. TCM-A/direct are decisively worse.

## Qwen3.6-35B-A3B

| Schedule | pp64 tok/s | vs auto | tg32 tok/s | vs auto |
|---|---:|---:|---:|---:|
| auto | 30.8326 | — | 6.52449 | — |
| tcm-a | 30.4421 | -1.3% | 5.99237 | -8.2% |
| tcm-b | **31.1828** | **+1.1%** | **6.69746** | **+2.7%** |
| direct | 30.5205 | -1.0% | 6.03824 | -7.4% |

TCM-B wins both A3B workloads and materially improves generation. Auto sometimes selects TCM-A when its activation row block fits, but capacity alone is not a sufficient performance criterion.

## Decision

1. Preserve TCM staging; direct execution is not competitive on K3.
2. Prefer TCM-B over TCM-A in automatic ordinary `MUL_MAT` dispatch.
3. Keep the environment selector for regression diagnosis and future crossover work.
4. Benchmark the preference change against the full immutable Gemma/A3B matrix in a separate commit.
5. Treat MoE selected-row scheduling separately; this selector does not cover it.
