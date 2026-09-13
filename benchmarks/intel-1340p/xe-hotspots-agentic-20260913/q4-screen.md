# Q4 width-4 tile screen

The isolated AVX2 2x4 candidate is bitwise equal to the existing 4x2 route on seven tested shapes. Width1 retains the unsupported/fallback return. No production source or model was changed.

The screen used a network-disabled container capped at two CPUs and 2GiB memory with no swap allowance, under an explicitly admitted 1-2 minute CPU-only window. Compilation and execution completed successfully; the container was removed and the window released. It did not collect host available-memory samples, process placement, CPU quota throttle deltas or a process-contention timeline. The timings are exploratory, not qualified model-speed measurements.

Each sample averages 32 invocations; two worker threads are created once per sample. Eight alternating pairs per shape form ABBA/BAAB order. Correctness uses deterministic inputs, exact output bytes and tails of widths 1,2,3,4,5. This covers the two profiled Q4 FFN weight shapes with query width4, but is not an eight-thread inference run.

| m,n,k | Reference median ms | Candidate median ms | Change | Candidate faster pairs |
|---|---:|---:|---:|---:|
| 64,4,256 | 0.004552 | 0.005381 | +18.2% | 4/8 |
| 65,4,288 | 0.004839 | 0.004789 | -1.0% | 5/8 |
| 65,2,256 | 0.002775 | 0.002772 | -0.1% | 5/8 |
| 65,3,256 | 0.004416 | 0.004384 | -0.7% | 4/8 |
| 65,5,256 | 0.009067 | 0.009393 | +3.6% | 4/8 |
| 10240,4,2560 | 2.312046 | 2.038742 | -11.8% | 8/8 |
| 2560,4,10240 | 2.048500 | 2.029344 | -0.9% | 5/8 |

The large first FFN shape merits confirmation. Retain the 0.9% observation as uncertain; the ranges overlap and unchanged-width controls also vary. The small-shape regression is retained and argues against widening dispatch unconditionally before confirmation.

Next: instrument the candidate dispatch separately from timing; measure at the actual inference thread count with resource/affinity/throttle evidence; then test the combined handoff+kernel candidate on independently graded workflows. No minimum percentage cutoff applies, but a noisy estimate does not establish a gain.

Files: `q4-native.cpp`, `prepare-q4.ts`, `build-q4.sh`, `evidence/q4-screen.log`, `evidence/q4-screen-identity.sha256`, `q4-summary.json`, `summarize-q4.ts`. Generated full SGEMM sources and binary remain local under `q4-build/`; hashes identify them.
