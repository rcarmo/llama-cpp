# Shape-resolved64K CPU decode: attention dominates

> Historical deployment snapshot (10-11 September 2026). The [15 September in-process zero-copy service](../gemma-zero-copy-service-20260915/README.md) supersedes the service identity, ports, active flags and rollback targets below. Commands in this snapshot are not current operating procedures.

F16 attention matrix products account for **10.79 seconds (64.06%)** of16.84 seconds instrumented node wall time on the deployed small-batch MTP baseline. Q4 projections account for3.44 seconds (20.40%). Activation packing is much smaller. The next candidate should address F16 attention loads/dot products rather than repeat thread or draft tuning.

## Diagnostic scope

Two isolated processes used the same saved64K state,64658 cached tokens,25 evaluated and128 generated. One ran current MTP3; one ran target-only. Both kept the target small-batch rule, CPU8/prefill16, F16 KV, FA off and two128K slots. Recall/count checks passed. No GPU or cold prefill ran.

The new profiler groups `MUL_MAT` by model tensor name, input type, dimensions and thread count. The cap is8192 groups; observed3579 MTP groups and3447 target-only groups had zero overflow. Shape node-wall sums exactly match the existing matrix-family wall total. Model tensor names are metadata, not user text.

| MTP matrix class, all recorded rows | Node wall |
|---|---:|
|F16 score products (`kq-*`) |6.024 s |
|F16 value products (`kqv-*`) |4.761 s |
|Other F16 products |0.054 s |
|Q4_0 projections |3.435 s |
|Q6_K projection |0.820 s |
|Q8_0 projections |0.231 s |

The small-query subset (at most four rows) contributes5.717 seconds of score products and4.314 seconds of value products. The rest includes the25-token appended prompt and its internal splits; these are not generation-only per-token counters. Long score shapes include K=512, M=64768, N=4, eight query heads and two KV heads. The large Q6_K node is the262144-row vocabulary projection.

Packing counters sum elapsed time across worker threads. F16 score/value conversion totals0.039/0.483 thread-seconds; Q4 repacking totals0.073 thread-seconds. These sums overlap work and are not wall time or physical DRAM traffic. The instrumentation adds barriers, mutex and string costs. Reported token throughput is diagnostic only, not a new speedup claim.

## Implementation and failures

The diagnostic backend reconstructs `abdbeadfb` sources and modifies `whole-token-profile.cpp`, `ggml-cpu.c` and `repack.cpp`, with an added bounded shape-counter helper. The already deployed small-batch `libllama` is retained. Only the isolated `libggml-cpu` changes. Counters require `GGML_CPU_SHAPE_PROFILE=1` together with the existing whole-token profiler.

A first build failed because `<unordered_map>` was missing. No inference ran; production was restored, the include was added, and the separate retry passed. Failed logs and source-edit corrections are retained. An attempted delegated source survey timed out and supplied no review approval.

The existing F16 two-row unrolled dot helper is a candidate for reuse. It shares the right-hand vector across two output rows; it does not fuse four MTP queries. A narrowly gated long-attention path could reduce repeated F16 loads/conversions, but requires standalone numerics, actual dispatch verification and uninstrumented native confirmation.

## Safety and restoration

Fresh speech clearance at23:41:55UTC covered the isolated build and two diagnostics. Continuous job/native/socket guards,6GiB reserve,16MiB swap ceiling and supervised restoration protected the current small-batch hybrid. All completed inference runs had zero trial swap. The failed build is excluded from inference success counts, not removed from evidence.

Production remained `20260910-smallbatch`; restoration verified exact unit/config, CPU argv/flag/mapped hashes, zero swap, explicit tools/cache and two idle slots. No instrumented library was installed. No STT settings or private files were changed.

The offline verifier reconstructs all modified sources from the pinned revision, checks their hashes, reconciles raw shape/whole-node counters, and reruns two audit tests/eight assertions. Model weights, runtime binaries, baseline secrets/config and multi-GB KV states stay local.
