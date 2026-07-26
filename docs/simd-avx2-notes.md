# SIMD AVX2 notes for q4/q8 CPU inference

This branch keeps the first CPU SIMD change intentionally narrow: the AVX2
`q4_0 x q8_0` dot-product kernel now processes two quant blocks per loop with
independent `__m256` accumulators and defers the horizontal reduction. This is
in the same spirit as the K3/llamafile-style kernels: keep independent register
work live, reduce loop overhead, and avoid serial accumulator dependencies in
the hot loop.

## Local test CPU

The local machine reports a 12th Gen Intel Core i7-12700 under KVM with these
relevant flags:

- `avx`, `avx2`, `fma`, `f16c`
- `avx_vnni`
- `bmi1`, `bmi2`
- `sse4_1`, `sse4_2`, `ssse3`

The q4/q8 dot path optimized here uses only AVX2+FMA, so it is a safe common
x86-64 target for this box without relying on AVX-512 or AMX.

## Alder Lake-N / N100 / N95 / U300 notes

Public Intel specs for N100/N95/U300-class small-core parts indicate the same
practical baseline for llama.cpp CPU quant kernels:

- AVX2 and FMA are available.
- AVX-VNNI is commonly available on Alder Lake-N / related Gracemont parts, but
  code should still keep AVX2 as the baseline because packaging/VM exposure can
  differ.
- AVX-512 and AMX should not be assumed.

That makes AVX2 register blocking/unrolling the right first optimization layer
for q4/q8 inference across this i7 and those low-power Intel chips.

## Focused validation so far

- Added `test-q4-avx2-dot`, a q4-only correctness test that compares the q4/q8
  dot result against dequantized reference data for small and medium sizes.
- `test-q4-avx2-dot` passed on the local AVX2 build.
- Short `test-quantize-perf` q4_0 vec-dot run at 4096 values / 200 iterations:
  - baseline merge commit `69e55f3e5`: avg `3.38` cycles / 32 values
  - unrolled commit `7ae4202cd`: avg `2.98` cycles / 32 values

All timings are short, local microbenchmarks only; repeat before making broader
claims.
