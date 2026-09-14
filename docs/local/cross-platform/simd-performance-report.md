# Bounded SIMD performance report

## Scope

This report covers short CPU-only measurements on a 6-vCPU KVM guest exposing a
12th Gen Intel Core i7-12700. It evaluates the accepted independent-accumulator
unrolls for q4_0/q5_0/q8_0 and explicit AVX2 versus AVX2+AVX-VNNI builds.

It does **not** claim measured N100/N95/U300 performance: matching reachable
hardware was unavailable. `simd-target-validation.md` contains the exact future
validation procedure.

## Load and energy controls

- CPU-heavy builds/tests/benchmarks were serialized with at least five minutes
  between runs.
- Builds used at most two jobs.
- Matrix runs used a one-minute load guard of 2.0; suspect cells were repeated
  below 1.0 load.
- Explicit profile builds took 47–50 seconds and raised one-minute load to about
  1.4–1.5 on six vCPUs.
- Microbenchmark matrix invocations completed within one timestamp second.
- End-to-end samples took 4–7 seconds each.
- All performance samples intentionally use one bounded repetition or 200 tiny
  kernel iterations; they are directional measurements, not confidence bounds.

## Accepted kernel changes versus merge baseline

Across the nine load-corrected q4_0/q5_0/q8_0 matrix cells (three sizes), the
current explicit VNNI build has a geometric-mean speedup of **1.142x** versus
the merge baseline, or **14.2%**. Individual cycle reductions range from 1.2%
to 36.4%; q8_0 contributes the largest consistent gains.

| Size | q4_0 delta | q5_0 delta | q8_0 delta |
|---:|---:|---:|---:|
| 4,096 | -1.3% | -8.9% | -36.4% |
| 65,536 | -1.5% | -1.6% | -26.7% |
| 655,360 | -3.6% | -1.2% | -21.8% |

No load-corrected cell regressed, so the accepted q4_0/q5_0/q8_0 unrolls were
retained. q1_0 was reverted after a measured regression; q4_1/q5_1 direct
unrolls were reverted after focused correctness failures.

## Explicit AVX2 versus AVX2+VNNI

Both profiles pass `test-x86-quant-dot`. Across the same nine matrix cells,
explicit VNNI has a **1.069x geometric-mean speedup** over explicit AVX2, or
**6.9%**. VNNI wins eight of nine cells; q5_0 at 4,096 values regresses 11.6%,
while larger q5_0 rows improve 8–11%.

The end-to-end fixed Gemma4 E2B Q4_0 gate started at nearly identical low load:

| Build | Prompt tok/s | Generation tok/s | Start load | Wall time |
|---|---:|---:|---:|---:|
| explicit AVX2 | 125.99 | 20.85 | 0.51 | 7 s |
| explicit AVX2+VNNI | 185.00 | 24.09 | 0.49 | 4 s |

VNNI is **46.8% faster for prompt processing** and **15.5% faster for token
generation** than explicit AVX2 in this bounded same-commit comparison.

## Deployment recommendation

- This i7: prefer explicit AVX2+VNNI or the portable dispatch build.
- Mixed fleets: use `GGML_BACKEND_DL=ON` + `GGML_CPU_ALL_VARIANTS=ON`.
  llama.cpp can select `alderlake` for AVX-VNNI-capable hosts and `haswell` as
  the AVX2 fallback.
- N100/N95/U300: do not publish performance claims until the committed target
  validation procedure runs on real hardware. AVX2+FMA remains the safe common
  denominator; AVX-VNNI should be selected only after CPUID/runtime validation.

## Evidence

- Reproducible baseline and matrices: `docs/simd-baseline.md`
- Accepted/rejected kernel notes: `docs/simd-avx2-notes.md`
- Target validation procedure: `docs/simd-target-validation.md`
- Build/inspection tools: `tools/simd-build-profiles.sh`,
  `tools/simd-inspect-profile.sh`
- Load-guarded runner/parser: `tools/simd-run-bench.sh`,
  `tools/simd-parse-bench.py`
