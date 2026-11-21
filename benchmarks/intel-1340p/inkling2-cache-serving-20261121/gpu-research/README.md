# Inkling GPU placement screens, 21 November 2026

Neither tested automatic-copy GPU placement improved 512-token prefill. CPU/SIMD4/16 with cache768 remains live at http://192.168.1.70:11434/. Both native phases restored its exact retained container/argv/UI/closure and passed native/API checks. No GPU serving, push or boot change occurred.

## Profiler-off 512/64 result

One fresh process per arm; one complete workload warmup excluded, then two measured repetitions. A2 and B2 ran serially in the same phase. C1 ran later after production became idle. This is an uncounterbalanced feasibility screen; the C1 comparison is time-separated. No counterbalanced or 2048 confirmation was run for these slower points.

| Placement | Prefill tokens/s | Decode tokens/s | Replay wall seconds | Peak full estimate GiB |
|---|---:|---:|---:|---:|
| CPU fallback | 24.204 | 7.720 | 29.477 | 21.779 |
| Expert group6 | 18.579 | 7.776 | 35.829 | 22.929 |
| Dense Q/K/V/output | 20.201 | 7.719 | 33.694 | 22.032 |

Expert group6 lost23.24% prefill throughput and added21.55% wall time. Dense placement lost16.54% prefill throughput and added14.30% wall time against retained A2. Small decode differences do not establish a gain. [A2/B2 individual rows](v2/screen-v2.results.csv), [C1 individual rows](dense/dense-idle1.results.csv), [screen validation](v2/screen-v2.results.json), [time-separated comparison](dense/dense-vs-reference.json).

The pattern alone changes: CPU fallback `^$`; expert group `^blk\.(6|7)\.ffn_(gate_up|down)_exps\.weight$` (four tensors/1,146,617,856 bytes); dense `^blk\.[0-9]+\.attn_(q|k|v|output)\.weight$` ([96 Q8_0 tensors/481,296,384 bytes](dense/selected-tensors.json)). A pattern match is eligibility, not proof that every matched tensor ran on GPU.

All arms use the same immutable Vulkan 1dadee62b closure and teacher-forced 576-token stream: 512 prompt+64 decode, 4/16 strict pools, masks 0x55/0xffff, poll 50, 65,536 context, compact F16 KV/FA off, b512/ub128, mmap/no-host/no-repack, n_gpu_layers0, CPU KV/recurrent state, one context, prefetch0, offload threshold32. The fixture is the retained stable-deduplication code sequence, with no sampler. The fixed replay length is a benchmark bound; production generation/reasoning remain unlimited. Both measured full-logit/argmax hashes repeat within each arm; cross-backend full-logit hashes differ. Startup/shader warmup are excluded, and the whole-replay measurement includes checks outside the decode timer. [Exact runtime environment/argv](runtime-settings.json), [binary/library hashes](gpu-runtime.sha256), [provenance/build](provenance.json), [pinned model/projector](model-manifest.json).

## Numerical and ownership scope

Each candidate has eight matched, finite full-vocabulary frames (200,058 entries/frame);8/8 argmax agree with A2. Maximum JS divergences are5.1665e-5 and 6.4183e-5 nats. These are teacher-forced probability diagnostics; independent coding/model quality and a broad noninferiority bound are untested. [Full metrics](screen-numerics.json).

The retained instrumented 128/8 down6 series has CPU KV 2048+200 MiB and RS 3.66 MiB. Its captured single-token decode graph assignments are CPU-only; prefill includes Vulkan routed matmuls and adjacent stateless operations. Reservation rows are separate from runtime-phase rows. These statements apply to that diagnostic selector. The new uninstrumented patterns retain CPU state allocations and batch-one exclusion in the source policy, but precise new-pattern operator/phase assignments were not traced. Their cumulative engine counters establish GPU activity, not an isolated kernel speedup. [Prior phase audit](retained-down6-phase-assignments.json), [prior numerical series](retained-down6-numerics.json). Instrumented timings are not performance evidence.

## Resource and recovery checks

Actual enforced ceiling 24,964,497,408 bytes (23.25 GiB), swap0, cpu.max1600000/100000. The continuous guard separately accounts full model+projector backing, non-model RSS, conservative per-client DRM max(total,resident), and 256 MiB supervisors, with at least 2 GiB host reserve. VulkanHost allocations may also appear in RSS; keep that conservative overlap. All three arms stayed within bounds with swap/OOM/CPU-throttling0. Monitor/cgroup/library evidence and compact native extracts are under v2/ and dense/. [Full native log hashes and retained paths](raw-native-logs.json) identify unchanged raw logs outside Git. Thermal samples are retained; power/frequency and per-copy exposed latency were not measured, so transfer overhead, shared power and microbatch size are hypotheses rather than isolated causes.

Both phases restored the same cache768 container 4c82176224511e875c63e78af85c94b4c8553e0e23b4cd14afd518c323eacce4, unchanged accepted argv/decoded UI/immutable libraries/native limits. API tools42, prefix215, actual-delta cancellation/idle drain and natural-EOG READY passed. Original Inkling, Gemma and the cache256 SIMD rollback stayed stopped. [A2/B2 restoration](v2/screen-v2.restored-verification.log), [A2/B2 API](v2/screen-v2.restored-api.json), [C1 restoration](dense/dense-idle1.restored-verification.log), [C1 API](dense/dense-idle1.restored-api.json). These check the restored CPU service, not GPU serving/cancellation/vision qualification.

## Retained failures and guard fix

The first attempt stopped before inference when the first fdinfo snapshot was empty. The old monitor rendered an empty GPU field as0 while its guard correctly failed closed. v1 also retained its old output root, leaving the unique failed A1 under the previous experiment directory. No benchmark result existed and no valid arm was repeated. Preserve all frozen attempts and raw evidence. [Failure receipts](retained-failures.json), [original guard stop](failed-startup.guard-stop.txt), [original startup sample](failed-startup.monitor.csv).

v2 fixes the exact output root and adds three bounded 50 ms snapshot-read attempts. A complete numeric tuple and successful reader exit are required; persistent missing/malformed data still aborts. Unsupported residency remains known-clients<count and still aborts. The host watchdog recognises the explicitly owned Podman sibling cgroup and stops only trial-owned work if another native model/build starts. [Snapshot helper](harness/drm-snapshot.sh), [guard](harness/gpu-guard.sh), [seven regression cases](harness/test-snapshot.mjs), [passing test log](snapshot-tests.log). The reused accounting parser and native-limit inequalities are unchanged. Published affinity text has trailing horizontal whitespace removed; raw affinity evidence is unchanged.

The initial dense attempt failed busy-slot admission before maintenance or native creation. It did not stop production. C1 launched only after the slot became idle, with a fresh phase receipt and the same frozen controller. No private prompt/media content was inspected for admission.

## Retained opportunities and exclusions

- Measure transfer/command overhead for a new selector with the existing diagnostic hooks; keep profiling separate from timings. Neither losing selector was traced in the performance run.
- The existing Vulkan shared-allocation/CPU-view APIs and lifecycle tests are useful prior work. The [CPU-view API](../../../../ggml/src/ggml-vulkan/ggml-vulkan-buffers.cpp) requires a Vulkan-owned, host-visible/coherent/cached allocation and rejects CPU_Mapped/imported-host storage; it cannot wrap the current mmap buffer directly. Trained-model integration must preserve raw-weight ownership, graph-cache validity and buffer lifetimes. The CPU-mmap screen used normal scheduler copies; it did not exercise a trained zero-copy weight path. No unsupported cross-context SWA/recurrent handoff is permitted.
- Larger GPU batches could amortise commands, but the baseline already reserves about 2442 MiB VulkanHost compute space at ub128. Project memory before loading; do not shrink 64K, F16 or the accepted production profile, or relax the 23.25 GiB ceiling to admit a candidate. Expert prefetch remains excluded from this isolated comparison.

These two points do not establish a global GPU ranking. Counterbalanced 512/2048, append/cancel/fallback, independent quality,real GPU serving/UI/vision and native crash recovery need a promising resource-safe candidate first. Populated 64K, CUDA and Metal remain unqualified. Cache768/SIMD production remains the accepted baseline; its [adoption report](../README.md) is unchanged by these experimental results.

Raw run: `tmp/llama-cpp/runs/inkling-gpu-cache768-20261121-1dadee62b`. Existing old controllers and paused task249b9639 still restore obsolete cache256 and must not be resumed. Archived scripts retain qualified host paths; inspect them when preparing a new namespace and never overwrite active launchers or repeat valid arms. The frozen manifests refer to original retained locations, not the archive directory. No native binary rebuild occurred. This checkpoint publishes evidence/harness fixes only; model code and serving defaults are unchanged.
