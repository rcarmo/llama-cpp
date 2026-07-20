# K3 matmul shape profile — 2026-07-19

Branch: `perf/k3-rvv-ime2-matmul-20260719`  
Profile source: baseline `26e8b4f86` plus opt-in telemetry only  
Models: hashes recorded in `k3-matmul-baseline-20260719.md`

## Method

`GGML_RISCV64_SPACEMIT_MATMUL_TRACE=1` emits one structured line from thread zero for every SpaceMIT `MUL_MAT` or `MUL_MAT_ID` invocation. Each model was traced in isolated `pp32` and `tg1` processes with eight threads. `scripts/summarize-k3-matmul-trace.awk` groups exact shapes and reports:

- call count and percentage;
- relative MAC count as `calls × M × N × K`;
- for `MUL_MAT_ID`, token/batch dimensions from `src1_ne2 × src1_ne3`.

Relative MACs prioritize work but are not elapsed-time measurements; quant decode, activation packing, memory traffic, barriers and TCM transfer can dominate differently.

Tracing is disabled by default. A three-repeat Gemma check after adding telemetry measured pp32 124.179, pp128 131.172 and tg32 13.2276 tok/s, within the immutable baseline range/noise except tg32 at -0.30%, below the 2% significance threshold.

## Gemma 4 E2B QAT

All traced matmuls use `MUL_MAT`, Q4_0 weights, F32 activations and eight threads. Prompt and generation use the same projections; N changes from 32 to 1.

### Prompt pp32 — leading shapes by relative MACs

| Calls | MAC share | M | N | K | Interpretation |
|---:|---:|---:|---:|---:|---|
| 80 | 39.96% | 12,288 | 32 | 1,536 | large expansion/output projection |
| 40 | 13.32% | 1,536 | 32 | 12,288 | corresponding contraction |
| 60 | 9.99% | 6,144 | 32 | 1,536 | feed-forward projection |
| 30 | 9.99% | 1,536 | 32 | 6,144 | feed-forward contraction |
| 70 | 7.77% | 1,536 | 32 | 4,096 | projection family |
| 70 | 7.77% | 4,096 | 32 | 1,536 | projection family |

The 12,288×32×1,536 family alone is about 40% of estimated arithmetic.

### Generation tg1 — leading shapes by relative MACs

| Calls | MAC share | M | N | K |
|---:|---:|---:|---:|---:|
| 80 | 33.12% | 12,288 | 1 | 1,536 |
| 2 | 17.66% | 262,144 | 1 | 1,536 |
| 40 | 11.04% | 1,536 | 1 | 12,288 |
| 60 | 8.28% | 6,144 | 1 | 1,536 |
| 30 | 8.28% | 1,536 | 1 | 6,144 |
| 70 | 6.44% | 4,096 | 1 | 1,536 |

The 262,144-row output/head matmul becomes prominent at N=1 despite only two calls.

## Qwen3.6-35B-A3B

The A3B graph separates dense/router `MUL_MAT` from selected-row MoE `MUL_MAT_ID`.

### Prompt pp32 — leading shapes by relative MACs

| Calls | MAC share | Op | Type | M | N | K | Token batch |
|---:|---:|---|---|---:|---:|---:|---:|
| 56 | 27.64% | MUL_MAT_ID | Q4_K | 512 | 8 | 512 | 32 |
| 200 | 27.64% | MUL_MAT | Q8_0 | 512 | 32 | 2,048 | — |
| 72 | 17.77% | MUL_MAT_ID | Q5_K | 512 | 8 | 512 | 32 |
| 72 | 17.77% | MUL_MAT_ID | Q6_K | 512 | 8 | 512 | 32 |
| 40 | 5.53% | MUL_MAT | Q8_0 | 2,048 | 32 | 512 | — |

### Generation tg1 — leading shapes by relative MACs

| Calls | MAC share | Op | Type | M | N | K | Token batch |
|---:|---:|---|---|---:|---:|---:|---:|
| 56 | 22.98% | MUL_MAT_ID | Q4_K | 512 | 8 | 512 | 1 |
| 200 | 22.98% | MUL_MAT | Q8_0 | 512 | 1 | 2,048 | — |
| 72 | 14.77% | MUL_MAT_ID | Q5_K | 512 | 8 | 512 | 1 |
| 72 | 14.77% | MUL_MAT_ID | Q6_K | 512 | 8 | 512 | 1 |
| 40 | 4.60% | MUL_MAT | Q8_0 | 2,048 | 1 | 512 | — |

MoE selected-row calls retain N=8 while the token batch changes from 32 to 1. They need their own scheduling/kernel strategy rather than being folded into ordinary N=1 dispatch.

## Kernel priorities

1. **Gemma Q4_0 N=1 latency path** for 12,288×1×1,536 plus the large 262,144×1×1,536 output projection.
2. **Gemma Q4_0 N=32 throughput path** for the same projection families.
3. **A3B Q8_0 dense N=1/N=32 paths**, especially 512×N×2,048.
4. **A3B MoE selected-row path** for Q4_K/Q5_K/Q6_K at 512×8×512 with token batches 1 and 32.
5. Edge/tail work comes after these aligned dominant shapes; the trace shows the hot dimensions are predominantly block aligned.

## Development implications

- Dispatch must distinguish ordinary N=1, prompt N≈32, and `MUL_MAT_ID` selected rows.
- A single global register tile is unlikely to serve Q4_0 projection, Q8_0 dense and K-quant MoE paths equally.
- Call count must not drive optimization priority without MAC/time weighting.
- The existing IME path owns all traced rows; compact-IQ telemetry remains unexercised because no compact-IQ model fixture is installed.
- The next phase should add explicit latency/throughput classification without changing kernels, then benchmark candidate register-tiled kernels behind a gate.
