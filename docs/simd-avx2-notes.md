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
  - delta: about `11.8%` fewer cycles per 32 values
- Short `test-quantize-perf` q8_0 vec-dot run at 4096 values / 200 iterations:
  - baseline merge commit `69e55f3e5`: avg `3.05` cycles / 32 values
  - unrolled commit `3071e2772`: avg `2.52` cycles / 32 values
  - delta: about `17.4%` fewer cycles per 32 values
- Short `test-quantize-perf` q5_0 vec-dot run at 4096 values / 200 iterations:
  - baseline merge commit `69e55f3e5`: avg `4.04` cycles / 32 values
  - unrolled commit `aa7aea58b`: avg `3.51` cycles / 32 values
  - delta: about `13.1%` fewer cycles per 32 values

All timings are short, local microbenchmarks only; repeat before making broader
claims.
## Rejected/paused targets

- `q5_1 x q8_1`: a direct two-block AVX2 unroll was tried and reverted after
  the focused q4/q5/q8 dot microtest segfaulted. The offset/min contribution
  and q8_1 pairing make this path less mechanical than q4_0/q5_0/q8_0, so keep
  it paused until there is a narrower q5_1-specific debugger run and oracle.
- `q4_1 x q8_1`: a similar direct two-block AVX2 unroll was also tried and
  reverted after the same focused microtest segfaulted. Treat q*_1/q8_1 offset
  kernels as a separate follow-up rather than a mechanical unroll target.
## Current scope boundary

The plain q*_0 AVX2 dot kernels with simple `q8_0` partners now have the
K3/llamafile-style independent-accumulator unroll applied where it was a
mechanical, testable change: `q4_0`, `q5_0`, and `q8_0`. Other inspected
q8_0 partners such as `iq4_nl`, `mxfp4`, and `nvfp4` already use two-block
AVX2 accumulator structure.

Offset/min kernels with `q8_1` partners (`q4_1`, `q5_1`) are deliberately
excluded from this pass after focused tests showed direct mechanical unrolls
are unsafe.

