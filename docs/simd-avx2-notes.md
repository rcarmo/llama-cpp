# SIMD AVX2 notes for q4/q8 CPU inference

This branch keeps the CPU SIMD changes intentionally narrow: the AVX2
`q4_0 x q8_0`, `q5_0 x q8_0`, and `q8_0 x q8_0` dot-product kernels now
process two quant blocks per loop with independent `__m256` accumulators and
defer the horizontal reduction. This is in the same spirit as the
K3/llamafile-style kernels: keep independent register work live, reduce loop
overhead, and avoid serial accumulator dependencies in the hot loop.

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

Public Intel specs and the known Gracemont/Alder Lake-N feature set indicate
the following practical baseline for llama.cpp CPU quant kernels:

| Chip family | Likely core class | SIMD baseline to assume | Do not assume | Notes |
|---|---|---|---|---|
| Core i7-12700 local VM | Alder Lake P/E mix exposed through KVM | AVX2, FMA, F16C; local flags also expose AVX-VNNI | AVX-512, AMX | This is the measurement host. |
| N100 | Alder Lake-N / Gracemont E-cores | AVX2, FMA; AVX-VNNI is commonly listed for Alder Lake-N | AVX-512, AMX | Low-power target; prefer AVX2 unless runtime dispatch proves VNNI. |
| N95 | Alder Lake-N / Gracemont E-cores | AVX2, FMA; AVX-VNNI likely in the same class | AVX-512, AMX | Same optimization posture as N100. |
| U300 | low-power Intel mobile class, often E-core heavy | AVX2 and FMA are the safe common denominator; AVX-VNNI may be present depending on stepping/exposure | AVX-512, AMX | Verify on real hardware before enabling any VNNI-specific path. |

That makes AVX2 register blocking/unrolling the right first optimization layer
for q4/q8 inference across this i7 and those low-power Intel chips. The current
code changes intentionally stop at AVX2+FMA and leave AVX-VNNI as a separate
future dispatch path.

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
- `q1_0 x q8_0`: a two-block outer unroll passed the focused correctness test
  but was reverted because the short 4096-value benchmark regressed from avg
  `1.97` to `2.51` cycles / 32 values. Its existing inner four-q8-block
  structure is already better than the attempted outer unroll on this i7.
## Current scope boundary

The plain q*_0 AVX2 dot kernels with simple `q8_0` partners now have the
K3/llamafile-style independent-accumulator unroll applied where it was a
mechanical, testable change: `q4_0`, `q5_0`, and `q8_0`. Other inspected
q8_0 partners such as `iq4_nl`, `mxfp4`, and `nvfp4` already use two-block
AVX2 accumulator structure.

Offset/min kernels with `q8_1` partners (`q4_1`, `q5_1`) are deliberately
excluded from this pass after focused tests showed direct mechanical unrolls
are unsafe.
## AVX-VNNI note

This i7 exposes `avx_vnni`, and N100/N95/U300-class Intel parts often expose
AVX-VNNI too. The signed q*_0 dot helper already converts signed-byte operands
to unsigned-absolute x signed form and routes through the AVX-VNNI
`_mm256_dpbusd_avx_epi32` intrinsic when `__AVXVNNI__` is defined.

The local `-march=native` build defines `__AVXVNNI__` even though the explicit
`GGML_AVX_VNNI` CMake cache option is off. Disassembly confirms `vpdpbusd` plus
`vfmadd231ps` inside the accepted `q4_0 x q8_0`, `q5_0 x q8_0`, and
`q8_0 x q8_0` kernels. Therefore no additional VNNI helper patch is needed for
this build: the AVX2 unrolls already benefit from VNNI where the compiler target
supports it.

For portable binaries, do not assume that `-march=native` on this i7 matches the
actual N100/N95/U300 target. A future deployment pass should build on the real
target or use llama.cpp's explicit CPU-feature dispatch and verify the emitted
instructions there.


## Repro commands

Use short, spaced runs when validating on low-power systems:

```bash
# focused correctness oracle for the AVX2 q*_0 dot paths
cmake --build build-simd-test --target test-q4-avx2-dot -j 2
./build-simd-test/bin/test-q4-avx2-dot

# short microbenchmarks used for the numbers above
./build-simd-test/bin/test-quantize-perf --type q4_0 --op vec_dot_q --size 4096 --iterations 200
./build-simd-test/bin/test-quantize-perf --type q5_0 --op vec_dot_q --size 4096 --iterations 200
./build-simd-test/bin/test-quantize-perf --type q8_0 --op vec_dot_q --size 4096 --iterations 200
```

For N100/N95/U300 validation, run the same commands on the target host and
record `lscpu` flags beside the results. Do not infer AVX-VNNI behavior from
this i7 VM; add a separate VNNI-specific benchmark if a future patch uses it.
