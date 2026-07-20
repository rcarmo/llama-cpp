# Qwen MoE tile occupancy

Date: 20 July 2026

Five identical 64-token native-MTP requests were run with the m4 contract enabled and `GGML_RISCV64_SPACEMIT_MOE_TILE_PROFILE=1`.

| Expert-row tile | Calls | Share |
|---|---:|---:|
| m4 | 97,712 | 4.48% |
| m2 | 534,216 | 24.49% |
| m1 | 1,549,552 | 71.03% |

Mean generation was 10.0027 tokens/s and draft acceptance remained 230/245. Profiling overhead was below 2%.

Qwen routes eight experts from 256, so most per-expert groups contain one row. A fused Q4_K/Q5_K m4 kernel can accelerate at most 4.5% of MoE tile dispatches and a smaller share of total wall time. The zero-point Q4 assembly already consumes nearly all vector registers for packed weights, scales, correction vectors and two accumulators. A four-row implementation has high spill/correctness risk and cannot clear the end-to-end 2% promotion threshold for this routing distribution.

Decision: retain the env-gated m4 edge contract and its correctness fixture, but do not implement or promote fused Q4_K/Q5_K m4 assembly for Qwen3.6-35B-A3B. The existing assembly m2 kernel covers the material multi-row share; m1 is unavoidable across different experts because weights cannot be shared.
