# Qwen Q4_K/Q5_K MoE m4 contract

Date: 20 July 2026

The opt-in `GGML_RISCV64_SPACEMIT_MOE_M4` path adds m4→m2→m1 edge decomposition for non-contiguous MoE output rows. Q4_K and Q5_K m4 wrappers currently compose two proven m2 kernels; they establish routing and correctness before a register-fused assembly implementation.

The deterministic `MUL_MAT_ID` fixture now covers:

- Q4_K, Q5_K, IQ2_XS, IQ3_XXS, IQ4_XS and IQ4_NL;
- routed-row counts 1, 2, 4, 5 and 8;
- one and eight GGML threads;
- gate disabled and enabled.

All 120 combinations passed with `bad=0`. Gate-enabled traces confirmed both wrappers executed:

```text
SPACEMIT_MOE_M4 kernel=i8i4 rows=4
SPACEMIT_MOE_M4 kernel=i8i5 rows=4
```

The composed contract is performance-neutral within noise. At eight routed rows and eight threads:

| Type | Existing m2, µs | Composed m4, µs |
|---|---:|---:|
| Q4_K | 33.71 | 34.29 |
| Q5_K | 41.03 | 41.01 |

A generic RVV/reference m4 prototype was numerically correct but rejected. Q4_K took 639.59µs and Q5_K took 1,290.20µs. Four-row reuse only pays when decoded weights and four output accumulators remain in IME2 registers.

The zero-point Q4 path already consumes most vector registers for packed weights, scales, corrections and two output rows. A fused m4 assembly needs an explicit spill-free register budget and generated-assembly review; it must remain gated until it beats the m2 family in focused and end-to-end Qwen tests.
