# Inkling copy/dispatch findings, 22 November 2026

CPU backend calls dominate the bounded down6 probe. Copy elimination alone has little measured wall-time budget in this fixture. CPU/SIMD cache768 remains accepted; no GPU placement was promoted.

## Measured host-call budget

One instrumented128-token prefill and8 teacher-forced decode steps, after one excluded full warmup. This is diagnostic data, with serial Vulkan profiling enabled. It cannot be compared as a speedup against the earlier profiler-off512/64 screens.

| Profiled prefill component | Milliseconds |
|---|---:|
| CPU backend calls | 5069.459 |
| GPU backend calls, including profiler overhead | 267.395 |
| Scheduler input-copy/callback/wait wrappers | 57.776 |
| Other host work outside those calls | 7.803 |
| Complete instrumented prefill | 5402.433 |

CPU backend calls account for93.84% of this prefill. GPU calls contain255.560ms of logged GPU operators and11.835ms outside their timestamp intervals. The latter includes input drain, host command recording, waits and query/logging costs; it is not a standalone synchronisation measurement.

Copy/wait wrappers account for1.07%. The weight callback occupies43.587ms, including42.940ms inside its23 tensor-set API calls. These nested intervals must not be added again. Generic synchronise API time is also nested. CPU backend time includes graph execution overhead; this probe does not isolate individual CPU kernels.

## Actual transfer requests and shared-bank scope

The retained scheduler audit has one191,102,976-byte physical weight declaration, blk.6.ffn_down_exps.weight, reused by three routed matmuls at effective layers6/24/36. Counting it once per loop visit overstates the scheduler input span. Runtime tracing adds a further correction: cache_mib0 still uses llama_context::sched_copy_experts.

The callback reads65,056bytes of strided routing ids back from GPU, groups selected experts, and requests23 weight ranges. Both warmup and profiled prefill request146,324,992bytes:98 complete expert payloads plus11,776bytes of512-byte tail padding. The tensor span is191,102,976bytes; it is not the copied-byte count. The27 other scheduler-copy requests account for67,680,864bytes. These are software API payloads, not measured DMA or physical DRAM traffic.

The ordinary callback calls Vulkan tensor_set_async. For an unregistered mmap source, the source path falls back to staging, records buffer copies and calls ggml_vk_synchronize for each range. Pinned sources can use a different path. Shared DRAM does not remove those software copies or make a PCIe cost model appropriate.

Only98/128 experts were populated by these observed weight uploads. This does not prove that a later loop reads a missing expert. The next correctness gate is to compare later-loop routed ids with the uploaded ranges, including buffer lifetime and warmup reuse. Bit-identical finite output across profiling variants does not establish that coverage or model quality. Do not promote GPU placement before that check.

The source-derived full-bank512/ub128 estimates remain conditional: group6 four tensors/4,586,471,424bytes; dense96 tensors/1,925,185,536bytes. The callback result prevents treating those estimates as measured traffic.

## Allocation and execution observations

Both prefills have9 GPU timing groups,33 logged operators,3 routed matmuls and21 dependency-sync log markers. Decode has no GPU timing groups or GPU backend calls. Log markers are not hardware dispatch/fence counters.

Memory logging records9 buffer-memory events during warmup (including staging growth to12.81MiB), then none during the profiled prefill/decode. This establishes reuse for the logged buffers only; query pools, CPU allocations and driver internals are not covered. Reserved compute space is200.25MiB Vulkan plus2442.33MiB VulkanHost. VulkanHost memory can overlap RSS/DRM accounting and is not private VRAM.

## Logger fix, failures and tests

The original Vulkan logger asserted on ctx->compute_ctx.expired() when input copies had already queued a compute context. Isolated fix f07f44b9e drains those inputs before timestamp-pool reuse, only when profiling is enabled. The profiler-off path is unchanged. The tiny original-library test passes with profiling off and reproduces assertion134 with profiling on. Fixed-library tests pass off/on/concurrent, with exact results and small/large/small query-pool reuse. Two CTest profiler aliases are registered.

A second model attempt failed136 because the operator selected print frequency0; the implementation uses modulo, so zero is invalid. This configuration error and successful restoration are retained. Explicit frequency1 passed the tiny regression before further model use. No failed attempt supplies a timing result.

Parser checks: retained trace10, original harness6, operator profile7, revised copy timing8, transfer ranges8. Temporary scheduler variants each pass12 CPU cases (six modes, logging off/on) plus the existing Vulkan queued-copy/lifetime/canary test. The initial copy parser rejected its false full-bank-copy assumption; source and runtime evidence corrected it to the callback path. Four incremental build/test stages used actual4GiB/swap0/2CPU limits. Full CPU CI, CUDA and Metal were not rerun for this scoped logger change.

The three successful profiled variants produce the same6,401,856-byte eight-frame logit dump (SHA256 9ed6c4d7801a2ca4a256850b3b70e7aae3e98193a447d2c579559664f1b2e228). These are finite teacher-forced diagnostics, not coding-quality or broad GPU correctness qualification.

## Preservation and next work

Every model attempt restored exact cache768 container4c82176224511e875c63e78af85c94b4c8553e0e23b4cd14afd518c323eacce4 and inherited argv/UI/library/native limits. Tools42, prefix reuse215, real-delta cancellation/drain, READY and natural EOG pass; production output/reasoning remain uncapped. Native limits stay24,964,497,408bytes/swap0/16CPU with full backing/non-model RSS/DRM and256MiB supervisors, >=2GiB host reserve. Final transfer run peak conservative estimate23,620,408,896bytes; swap/OOM/throttling0. Populated64K, GPU serving/vision and native-crash respawn remain unqualified.

Temporary ggml-backend.cpp hooks were removed; their exact patch and diagnostic closures are retained. Permanent code is the logger fix and regression tests. Original immutable runtimes, dirty primary files, raw failures and stopped rollbacks are preserved. No push, boot change, unrelated restoration, other-agent coordination or old-task resumption occurred.

Next: verify shared-bank route coverage before further GPU qualification, then profile CPU graph/operator work before another placement sweep. Existing CPU-view APIs require Vulkan-owned coherent/cached allocations and cannot directly wrap this CPU_Mapped weight owner; trained reuse still needs ownership and graph-cache/lifetime proof.

Raw evidence: tmp/llama-cpp/runs/inkling-copy-dispatch-20261122-2d079cf5b. The raw-native-logs.json ledger records hashes and original paths. Archived frozen manifests refer to retained locations; inspect controllers, never resume old ones.
