# Compact-IQ IME2 baseline — 2026-07-22

This frozen pre-optimisation baseline records the original per-call packer. Commit `1ea7900b7` replaced full-row decode with direct compact-block packing and added a bounded LRU tile cache. See [the completed campaign report](report.md) for current behaviour and deployment results.

The original `GGML_RISCV64_SPACEMIT_IQ_IME2_TILE=1` path was coherent but slower than direct RVV because it dequantised each complete weight row to F32 and requantised it into 32-value Q8 blocks.

The deterministic MoE fixture used 64 output rows, K=512, routed rows 1, 2, 4, 5 and 8, and 30 repeated graph computes. All IQ type, row and thread combinations completed with `bad=0`.

| Type | Direct RVV, 1 thread | IME2 tile, 1 thread | Direct RVV, 8 threads | IME2 tile, 8 threads |
|---|---:|---:|---:|---:|
| IQ2_XS | 2,304.5 µs | 2,720.8 µs | 341.4 µs | 1,408.5 µs |
| IQ3_XXS | 1,775.5 µs | 3,598.4 µs | 269.1 µs | 1,855.4 µs |
| IQ4_XS | 1,214.2 µs | 2,988.7 µs | 202.5 µs | 1,631.5 µs |
| IQ4_NL | 3,593.0 µs | 3,032.1 µs | 1,131.0 µs | 1,646.8 µs |

The target was direct compact-block decoding into the IME2 `[fp16 scale][32 × int8]` block layout without a full-row F32 scratch buffer. The completed implementation also caches packed tiles across graph computes.
