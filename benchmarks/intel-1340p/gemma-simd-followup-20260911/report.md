# SIMD follow-up: both candidates slower, B0 retained

Neither new SIMD candidate improved the saved64K workload. Score3 no-unroll reduced generation speed by **1.65%**; the packed-Q4 streamed-dot candidate reduced it by **4.15%**. Both passed their numerical controls, but neither proceeds to independent confirmation or deployment. The earlier **+3.124% score3 improvement remains deployed**.

## Matched screens

Each candidate used four fresh native CPU workers in baseline/candidate/candidate/baseline order, with the same library within its comparison. The other experimental change was disabled. Both retained smallbatch, ATTN4, score3, CPU8/prefill16, draft8/16, MTP3, F16 compact KV, FA off, two allocated131072-token slots and cacheRAM0. Work was frozen at64658 cached /25 evaluated /128 generated tokens, seed42, temperature0, top-k1. Every run retained90/110 accepted draft tokens and the same output-token hash.

| Candidate | Baseline tok/s | Candidate tok/s | Generation change | Request time change |
|---|---:|---:|---:|---:|
| Score3 reduction-loop no-unroll | 9.2312 | 9.0787 | -1.65% | +2.02% |
| Packed Q4 streamed integer dots | 9.1850 | 8.8040 | -4.15% | +4.56% |

With two observations per arm, the table's means also equal its medians. Both candidate observations were below both control observations in each screen. Request time includes the25-token prompt evaluation and128-token generation, excluding worker startup and state restore. Individual observations, maps/flags, requests, timings, resource traces and decisions are in `results.json` and `runs/`.

These are screening losses, not independently confirmed regressions or estimates of a universal optimum. No arbitrary minimum gain rejected them: a reproducible small gain would have qualified for confirmation. Sustained512-token, secondary-context, broader quality and new-release gates were not run for these losing candidates.

## Score3 instruction scheduling

The deployed3x4 score tile uses12 FP32 vector accumulators and48-row jobs. Its Clang-generated inner loop spills two accumulators when unrolled. The candidate duplicates only the score3 helper with `#pragma clang loop unroll(disable)`; value products, tails, reductions and the existing parent path remain intact. `GGML_CPU_EXPERIMENTAL_SCORE3_NOUNROLL=1` selects it.

Eleven native score/value/control cases passed in both modes at unchanged tolerances. The real-model probe emitted2,072 score-override traces. The candidate binary still contains stack traffic: full-function static YMM stack references are8 in the original function and13 in the two-branch candidate function. These counts include different paths and are not dynamic spill counts. The attempted scheduling change did not produce a measured improvement; no claim of successful spill elimination is made.

## Q4 dispatch correction

The first source inspection found that AVX2 tinyBLAS handles four queries as two4x2 tiles. A narrowly flagged2x4 path passed19 numerical cases per mode, including model dimensions, excluded query/row counts, padded stride and a Q8 control.

The real-model probe emitted **no tinyBLAS Q4 trace**, despite the flag and mapped candidate library. Loaded model weights use the separate prepacked-Q4 backend. That probe failed its actual-dispatch gate; no tinyBLAS Q4 timing was accepted. The original patch and failed probe are retained. This corrects the initial assumption that the tinyBLAS path was the useful Q4 target.

The actual path is `ggml_gemm_q4_0_8x8_q8_0` in `ggml/src/ggml-cpu/arch/x86/repack.cpp`, pinned to `abdbeadfb`. It already reuses packed weights and uses AVX-VNNI integer dots. The replacement candidate processes8-element segments in smaller groups to reduce simultaneously live shuffled vectors, at the cost of additional loads and loop work. It preserves packed Q4_0x8/Q8_0x4 formats, per-block scales, integer dot arithmetic and FP32 accumulation. Its gate is AVX2/F16C without AVX512, four query rows, legal32-element blocks and8-column groups. Other types/row counts retain their parent implementation.

Sixteen direct packed-layout cases passed per mode against the existing generic reference, with the original5e-4 NMSE tolerance, finite outputs and output canaries. They cover all ten profiled model matrix geometries, short blocks, padded output strides and excluded8/16-query controls. The largest observed error was small relative to the tolerance; raw errors are retained. The real-model probe recorded404,928 `Q4_PACK_STREAM` calls. That trace-heavy probe is excluded from performance results. All eight timing runs had tracing disabled.

The corrected packed library links the original B0 score3 object, not the unsuccessful no-unroll object. There was no combined optimisation timing or deployment.

## Preserved failures and harness corrections

- Delegated read-only Q4 review timed out; direct source and assembly inspection supplied the decision. No review approval was inferred.
- A duplicate script identifier stopped the first preparation before compilation. The corrected build compiled and linked, then an undefined disassembly variable failed the post-build step. Only disassembly was resumed; the successful compile was retained.
- A human-readable native case file produced0/0 tests despite exit0. The gate rejected it. Numeric generic-op records were generated and tested with the retained strict parser.
- The native tinyBLAS Q4 run passed19 cases per mode but the outer monitor sampled an exited process and recorded `Missing counter VmRSS`. The monitor now permits absent memory counters only for an explicit zombie status; empty/unreadable or live missing counters still fail closed. Owned stop removes an explicitly stopping child from the active set before awaiting termination. Eight offline assertions cover parser/resource controls.
- A probe launcher retained an old argument parser after an ineffective text transformation. It failed before creating a worker and was replaced with a reviewed target-specific script.
- The first packed build rejected an assumed score-object path. It now obtains the exact object path from `compile_commands.json`.
- The standalone packed-reference test initially omitted `ggml_cpu_init`, leaving the CPU FP16 lookup table uninitialised. The flag-off reference failure was retained. Explicit CPU initialisation fixed the test; tolerances were not relaxed.

## Production and resources

All heavy build/native/model stages ran sequentially under bounded user-systemd units, with automatic restoration of the frozen current release. Speech stayed explicitly stopped. Guards retained at least6GiB available RAM and at most16MiB worker swap; temperatures95C and above remained annotations. Each completed timing run recorded zero worker swap. No GPU prefill, near128K retry, private speech data access or production fault injection occurred.

The final restoration check passed exact B0 unit/config hashes, nine mapped CPU files, argv and optimisation flags, tools, cached continuation, two idle slots and zero swap. Production remains `20260911-score3-stopped`. Its operational fallback is ATTN4; maintenance restores B0 itself. Models and long state hashes are inherited from the T01 manifest, with the exact screen fixture and built objects hashed separately.

## Reproduction

`verify-offline.sh` checks checksums, source hashes, both parent-to-candidate patches, numerical counts, real dispatch versus the ineffective first path, raw work/timing/resource data and restoration. It runs no inference or service actions. `build/prepare.ts` and `packed-build/prepare.ts` preserve compiler/link recipes and exact object selection; runtime binaries, models and multi-GB states stay local.

The next useful change would need a different mechanism: a score kernel with demonstrably better register scheduling, or a packed-Q4 transformation that reduces actual work without adding more load/shuffle cost. Repeating these two candidates, the old value3 tiles or generic VNNI enablement is not justified by these results.
