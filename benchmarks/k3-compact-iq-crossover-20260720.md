# K3 compact-IQ RVV/IME2 crossover — 2026-07-20

> Historical result: this report measures the original full-row per-call IME2 packer and persistent whole-tensor repacking. Direct block packing and a bounded cross-request cache superseded the per-call path on 22 July. See [the current compact-IQ IME2 report](qwen-compact-ime2-20260722/report.md).

## Method

The deterministic compact-IQ MoE fixture was run with eight compute threads and repeated graph compute:

- direct compact RVV: 100 iterations;
- per-call IME2 tile: 30 iterations;
- persistent load-time IQ→Q8_0 repack: 30 iterations.

Fixture dimensions: two experts, 64 output rows, K=512, two selected experts per token. `set_us` measures `ggml_backend_tensor_set`, including persistent repack when enabled. `compute_us` is average repeated graph compute time.

## Results

| Type / activation rows | Direct RVV µs | Per-call IME2 µs | Persistent repack µs | Compute speedup vs RVV | Extra setup µs | Break-even calls |
|---|---:|---:|---:|---:|---:|---:|
| IQ2_XS / 1 | 106.120 | 1,393.500 | 22.433 | 4.73× | 3,969 | 47.4 |
| IQ2_XS / 4 | 345.390 | 1,406.000 | 30.500 | 11.32× | 6,078 | 19.3 |
| IQ2_XS / 5 | 428.870 | 1,414.167 | 35.033 | 12.24× | 6,122 | 15.5 |
| IQ3_XXS / 1 | 84.620 | 1,827.367 | 22.033 | 3.84× | 13,254 | 211.8 |
| IQ3_XXS / 4 | 264.270 | 1,860.667 | 30.467 | 8.67× | 13,299 | 56.9 |
| IQ3_XXS / 5 | 323.780 | 1,858.367 | 34.800 | 9.30× | 13,313 | 46.1 |
| IQ4_XS / 1 | 67.050 | 1,593.800 | 21.400 | 3.13× | 8,248 | 180.7 |
| IQ4_XS / 4 | 200.840 | 1,674.333 | 30.767 | 6.53× | 8,214 | 48.3 |
| IQ4_XS / 5 | 241.570 | 1,601.367 | 34.833 | 6.94× | 8,232 | 39.8 |
| IQ4_NL / 1 | 299.610 | 1,618.933 | 21.733 | 13.79× | 2,603 | 9.4 |
| IQ4_NL / 4 | 1,129.780 | 1,693.300 | 32.933 | 34.31× | 2,572 | 2.3 |
| IQ4_NL / 5 | 1,401.170 | 1,639.633 | 34.667 | 40.42× | 2,589 | 1.9 |

## Findings

1. **Per-call IME2 tile packing loses for every fixture shape.** Re-decoding and packing all selected weight rows on every graph invocation costs 1.4–1.9ms, overwhelming IME2 compute.
2. **Persistent packing wins compute for every type and row count**, from 3.13× to 40.42× over direct compact RVV.
3. **Break-even is low relative to model lifetime.** Even the worst case (IQ3_XXS, one activation row) amortises after about 212 calls; model weights are reused thousands of times.
4. **IQ4_NL direct compact compute is especially slow**, making persistent conversion profitable after only about 2–10 calls.
5. Persistent and per-call IME2 modes have identical output values because both convert compact weights to Q8_0 tiles.
6. Numerical cost remains small: roughly 1.3e-5 to 3.0e-5 NMSE after the additional Q8 conversion.

## Policy at the time

The 20 July implementation stayed disabled because every per-call IME2 comparison lost to direct RVV. Persistent load-time repacking was suitable only when the expanded model fit in memory. Direct compact RVV remained the low-memory path.

The 22 July implementation changes this trade-off by caching directly packed active tiles under a byte budget. It remains opt-in because sustained Q2 service performance still trails the live Q4 service.
