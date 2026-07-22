# Compact-IQ IME2 baseline

The existing `GGML_RISCV64_SPACEMIT_IQ_IME2_TILE=1` path is coherent but slower than direct RVV because it dequantises each complete weight row to F32 and requantises it into 32-value Q8 blocks.

The deterministic MoE fixture used 64 output rows, K=512, routed rows 1, 2, 4, 5 and 8, and 30 repeated graph computes. All IQ type, row and thread combinations completed with `bad=0`.

| Type | Direct RVV, 1 thread | IME2 tile, 1 thread | Direct RVV, 8 threads | IME2 tile, 8 threads |
|---|---:|---:|---:|---:|
| IQ2_XS | 2,304.5 µs | 2,720.8 µs | 341.4 µs | 1,408.5 µs |
| IQ3_XXS | 1,775.5 µs | 3,598.4 µs | 269.1 µs | 1,855.4 µs |
| IQ4_XS | 1,214.2 µs | 2,988.7 µs | 202.5 µs | 1,631.5 µs |
| IQ4_NL | 3,593.0 µs | 3,032.1 µs | 1,131.0 µs | 1,646.8 µs |

The optimization target is direct compact-block decoding into the IME2 `[fp16 scale][32 × int8]` block layout, without a full-row F32 scratch buffer.
