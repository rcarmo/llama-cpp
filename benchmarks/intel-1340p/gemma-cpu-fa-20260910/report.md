# CPU Flash Attention at 64K: a retained SIMD improvement

Fusing F16 value loads, conversion and FP32 accumulation improved this CPU Flash Attention branch: request latency fell 9.59% and decode throughput rose 10.16% across eight counterbalanced runs. It still trails the retained FA-off CPU path, so it is an opt-in research improvement, not a new hybrid default or deployment.

## Exact comparison

Both confirmation profiles used the same isolated CPU backend based on `abdbeadfb`, Gemma E4B QAT Q4_0, Q8_0 MTP3, 8 decode / 16 prefill threads, batch/microbatch 1024/256, compact SWA, F16 KV, CPU FA-on and two 131072-token slots. The only enabled candidate flag was `GGML_CPU_EXPERIMENTAL_FA_FUSED_VALUE=1`. Other experimental flags were off.

Each run restored the same validated 64662-token KV history from the earlier GPU FA-off campaign, transposed V losslessly for FA-on and aligned the text-token wrapper/version for the retained CPU. It then evaluated the same 25 new prompt tokens and generated 128 tokens. All three keys were recalled correctly; each confirmation accepted 90 of 110 MTP proposals. Autoregressive parity was recorded diagnostically, not used as a quality gate.

| Median across four runs per profile | CPU FA default | CPU FA fused SIMD |
|---|---:|---:|
| Request wall time | 33.840 s | 30.594 s |
| Decode throughput | 4.301 tok/s | 4.738 tok/s |
| Prompt evaluation | 4.025 s | 3.487 s |
| v3-to-v2 alignment, measured separately | 2.545 s | 2.581 s |

Order was ABBA/BAAB with a fresh worker and restore per observation. Request wall time excludes startup, restore and alignment. The existing exact 64K V-layout transpose was reused, so these figures do not claim a net full GPU-to-CPU handoff speedup including a new transpose on every request.

The prior CPU FA-off screen reached about 7.24 tok/s at the same context on this counting/recall fixture. That is an earlier sequential measurement, not a new balanced FA-off/FA-on comparison. It is sufficient to avoid promoting CPU FA as a general replacement on current evidence.

## How the candidate was found

The earlier GPU FA failure did not establish CPU FA correctness or performance. The CPU-only path passed a 4K restore, recall and cached append, then a 64K screen, without rerunning full GPU prefill.

| CPU FA candidate | 64K screen decode throughput | Interpretation |
|---|---:|---|
| Original CPU FA | 4.30-4.56 tok/s | Correct, slower than prior FA-off |
| FP32 value accumulator through temporary converted row | 3.15-3.19 tok/s | Correct, extra conversion traffic costly |
| Existing tiled kernel enabled for small MTP query groups | about 1.02 tok/s | Correct, but still computes all 64 padded query rows |
| Same tiled branch, GEMM uses active query rows | 1.46-1.67 tok/s | Useful improvement to a slow branch; still not competitive |
| Fused F16 load/convert/FP32 multiply-add | 4.84-4.92 tok/s | Promising screen; confirmed separately above |

These variants remain as historical patches and results. Their regressions identified concrete opportunities; none was discarded merely for being slower. Source review delegation timed out initially; a later focused review of the standalone fused patch completed.

## SIMD change

The retained single-chunk FA kernel normally accumulates F16 values in an F16 output buffer. The fused path keeps the output in the existing FP32 buffer. An AVX2/F16C/FMA helper loads eight F16 elements, converts them to FP32 and performs one multiply-add without materialising a separate FP32 value row. Scalar tails are bounded; no larger scratch allocation is required.

- ISA guards cover both definition and call site.
- The environment flag is opt-in and process-static; absence preserves the original path.
- `params->use_ref` disables the experiment so the native tester's reference remains unchanged.
- K precision, masks, scaling, sinks, layout and default dispatch are unchanged.
- `int64_t` length/index avoids the helper's initially reviewed narrowing concern.
- FP32 accumulation and FMA intentionally change rounding relative to the original F16 accumulator. This is not byte-equivalent arithmetic.

`patch/fused-only.patch` contains the standalone source/header change against `abdbeadfb`. It excludes the slower FP32-temporary and small-query tiled experiments. The final standalone backend was rebuilt and reverified after extraction; the eight timing confirmations used the equivalent combined backend with the other flags off. Standalone extraction was not given another full timing campaign.

The intermediate `patch/cpu-fa-*.patch` files document successive trials and may depend on the preceding patch. The standalone patch is the review/apply entry point. Native runtime source snapshots and hashes distinguish every variant.

## Correctness evidence

- Eight state-layout tests pass, including text-only v3/v2 alignment, explicit FA layout matching, malformed input rejection and exact V-layout roundtrip.
- Native helper tests pass: 21 active-row GEMM equivalence cases and seven fused value cases, including non-vector tails, repeated accumulation and an output sentinel.
- Four masked grouped-query attention cases pass on both default and fused CPU paths against the unchanged reference: 32768/65536 KV positions, query counts 1/4/25, width 512, eight Q heads and two KV heads. Test precision/tolerances were unchanged.
- The standalone candidate passes 64663-token recall with 64662 cached / one evaluated, a saved-state scan with zero NaN/Inf, an uninterrupted short tool round trip in slot 1, and a return to the long slot with 64684 cached / 15 evaluated. The earlier combined-backend lifecycle check also passed.
- Final original-service tool/cache and identity checks pass. The known implicit-answer prompt failure in the earlier restoration campaign was not rerun or erased.

These are bounded numerical and task checks, not broad coding noninferiority, native crash/driver recovery or fully populated dual128K qualification. The tests include FP32-reference behavior, but do not cover every exceptional IEEE input or architecture.

## Safety and restoration

Fresh speech clearance was recorded at 18:38:22 UTC on 10 September. Job state, native CPU work and queued socket bytes were checked before and during supervised maintenance. All completed trials stayed above the 6 GiB available-memory reserve and at zero trial process swap. Temperature remained annotation-only.

Only experiment-owned processes were started/stopped; STT settings, private media and transcripts were untouched. Each unit restored production automatically. Final service PID 602513 is active, NRestarts=0, zero process swap, two idle 128K slots, unchanged baseline argv/env/unit/library hashes and healthy API. No candidate library or FA setting was installed in production.

The build emitted an existing non-exhaustive enum-switch warning in the old CPU source; builds and native tests completed. Failed authoring/syntax attempts were corrected before model runs. Their absence from run data is not a successful runtime measurement.

## Retained opportunities

1. Preserve fused SIMD as a measured CPU-FA-specific improvement; test other models/quantised-KV or long-query mixes where FA is otherwise preferable.
2. Keep active-row tiling as a partial improvement to the small-query branch. Converting/transposing tiles and processing small head groups still cost more than the original path here.
3. Keep GPU prefill FA-off and the prior aligned CPU FA-off route as the fastest validated whole-workflow configuration so far. No unsupported switch to CPU FA is proposed.
4. Further GPU attention work should change a specific profiled dispatch or memory operation, not repeat the completed thread/batch screens.

## Artifacts

`results.json` and `audit-results.ts` retain all run assertions and costs. `validation-plan.json`, `amendments.json` and `review.json` record the hypotheses, amendments and review limits. `runs/` contains request bodies, responses, timing, memory and native test logs. `final-verification.txt` records unchanged production. Large slot files, copied source trees and runtime binaries stay local; version-controlled exports include patches and manifests instead.
