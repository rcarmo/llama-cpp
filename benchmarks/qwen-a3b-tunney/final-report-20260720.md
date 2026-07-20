# Qwen3.6-35B-A3B Tunney-style matrix campaign

Date: 20 July 2026
Branch: `perf/qwen-a3b-tunney-matmul-20260720`
Baseline commit: `2790768bf20b106c00fcfcef0e3589a9dde358b8`
Final tested commit before this report: `8e9e08129`

## Result

The campaign applied the Obsidian reference `Justine Tunney - LLaMA CPU matmul techniques.md` to Qwen3.6-35B-A3B native MTP on the SpaceMIT K3. It profiled steady-state inference, separated packing economics from kernel time, added explicit edge families, held output tiles in registers, reused B tiles across independent accumulators, preserved GGML worker scheduling and inspected generated assembly.

No experimental kernel cleared the 2% end-to-end promotion threshold. Safe defaults remain unchanged. The branch adds opt-in profilers, stronger Q4_K/Q5_K MoE correctness coverage, an m4 edge contract and a fused i8×i8 m2 kernel for future workloads.

## Baseline

The frozen one-slot 8K service used Q4_K_M native MTP with draft maximum 3, eight threads, batch 512 and microbatch 128.

| Metric | Baseline | Final safe defaults |
|---|---:|---:|
| Short generation | 10.1683 tok/s | 10.1821 tok/s |
| Draft acceptance | 230/245, 93.88% | 230/245, 93.88% |
| Minimum available memory | 8,291,552KiB | 8,322,592KiB during 2K smoke |

The 0.13% throughput difference is noise. Fingerprint `b10195-8e9e08129` identifies the final tested build.

## Steady-state profile

A perf-controlled 256-token request captured about 60,000 cycle samples with no loss. Main hotspots included:

| Symbol/path | Self cycles |
|---|---:|
| RVV `memcpy1d` main loop | 20.36% |
| `ggml_vec_dot_f32` | 6.34% |
| Q8_0 dequantisation | 4.65% |
| Q8_0×Q8_0 vector dot | 3.86% |
| Q6_K SpaceMIT `forward_mul_mat` | 2.18% |
| Gated delta net | 2.72% |
| SSM convolution | 2.55% |

Qwen is a hybrid recurrent/MoE model. Matrix kernels share runtime with recurrent-state operations, copies and generic vector dots, limiting the end-to-end leverage of any single microkernel.

## Packing economics

Five short requests copied:

| TCM copy category | Bytes |
|---|---:|
| Dense weights | 339.15GB |
| MoE weights | 7.60GB |
| MoE activations | 5.49GB |
| Dense activations | 2.03GB |

Removing staging with `GGML_RISCV64_SPACEMIT_MATMUL_SCHEDULE=direct` reduced generation from 10.168 to 9.334 tok/s, an 8.2% regression. The large copy volume buys more TCM locality than it costs. Dense packing remains enabled.

## Q4_K/Q5_K MoE m4

`GGML_RISCV64_SPACEMIT_MOE_M4=1` adds m4→m2→m1 decomposition for non-contiguous expert rows. The m4 wrappers currently compose two existing m2 assembly kernels. The test fixture now covers Q4_K, Q5_K and four compact-IQ formats at routed-row counts 1, 2, 4, 5 and 8, with one and eight threads. All 120 gate/type/row/thread combinations passed with `bad=0`.

A generic four-row RVV prototype was rejected: Q4_K took 639.59µs and Q5_K 1,290.20µs, versus 33.71µs and 41.03µs for existing m2 assembly. Register residency is mandatory.

Real Qwen occupancy was:

| Tile | Share |
|---|---:|
| m4 | 4.48% |
| m2 | 24.49% |
| m1 | 71.03% |

Eight selected experts are distributed across 256 experts, so most expert groups contain one row and cannot share weights. A fused m4 assembly kernel has insufficient end-to-end leverage for its zero-point register-pressure risk. The contract remains opt-in and is not promoted.

## Dense i8×i8 m2

`GGML_RISCV64_SPACEMIT_I8I8_M2=1` adds m4→m2→m1 decomposition for dense verification. The fused m2 kernel loads each 32×32 B tile once, applies it to two independent A rows and retains two FP32 output accumulators in vector registers.

All Q4_K activation-row cases 1–9 and 32, plus K=256 and K=1024 edges, passed at one and eight threads. Generated assembly has no vector spills.

| Rows | Existing, µs | Fused m2, µs | Local gain |
|---:|---:|---:|---:|
| 2 | 25.901 | 24.978 | 3.6% |
| 3 | 29.008 | 28.101 | 3.1% |
| 6 | 31.253 | 29.995 | 4.0% |
| 7 | 33.450 | 32.385 | 3.2% |

End-to-end Qwen changed from 10.0436 to 10.0523 tok/s, a 0.09% gain, with identical acceptance. The kernel remains gated.

## Vocabulary projection

All Q6_K SpaceMIT multiplication accounted for 2.18% of sampled cycles, including the 248,320×2,048 vocabulary projection. Even eliminating the complete path would barely meet the 2% threshold. A dedicated vocabulary GEMV kernel was not implemented.

## Regression suite

Final focused validation passed at one and eight threads:

- F32 projection-to-Q8;
- BF16 projection-to-Q8;
- Q4_K dense rows 1–9 and 32, gates off and on;
- Q4_K/Q5_K/compact-IQ MoE rows 1, 2, 4, 5 and 8, gates off and on.

The realistic context smoke processed 2,094 prompt tokens at 10.54 tok/s. A follow-up reused 1,962 cached tokens and processed 135 new tokens. Both responses accepted every draft token. Available memory remained above 7.94GiB and the one 8,192-token slot returned idle.

## Defaults and future work

Keep these defaults:

- automatic SpaceMIT matmul scheduling;
- dense and MoE TCM staging enabled;
- `GGML_RISCV64_SPACEMIT_MOE_M4` disabled;
- `GGML_RISCV64_SPACEMIT_I8I8_M2` disabled.

The next material performance work should profile and optimise the 20.36% copy caller in the recurrent-state path, F32 dot products, gated delta net and SSM convolution. Those are outside this matrix-only campaign but offer more measured leverage than another Qwen microtile.

Evidence:

- `20260720-baseline/manifest.md`;
- `20260720-copy-profile.md`;
- `20260720-moe-m4-contract.md`;
- `20260720-moe-tile-profile.md`;
- `20260720-i8i8-m2.md`.
