# Shared expert-bank coverage, 22 November 2026

The sparse callback left experts unuploaded for later Inkling loop visits. Local fix fea919c6d now uses the existing full-tensor scheduler copy for expert tensor pointers shared across model layers. CPU/SIMD cache768 remains deployed; no GPU placement or new server binary was adopted.

## Failure and corrected coverage

One read-only route trace captured logical8x128 I32 IDs with strides4/512 before host-to-GPU copies. The first route mask exactly matched the98 experts in the measured uploads. Three effective layers used the same bank buffer/data identity throughout warmup and profiled prefill. Previous warmup uploads did not cover the later missing IDs.

| Effective layer | Required experts | Missing before fix | Missing after fix |
|---|---:|---:|---:|
|6|98|0|0|
|24|99|13|0|
|36|97|10|0|

Layer24 missing IDs: 14, 23, 34, 41, 43, 51, 52, 86, 94, 110, 112, 114, 121. Layer36 missing IDs: 13, 14, 17, 23, 43, 52, 86, 112, 114, 121.

Before:146,324,992bytes/23 sparse ranges/98 complete experts. After: one191,102,976-byte full-tensor request/128 experts. Both fixed warmup and profiled prefill have complete coverage, including later loop routes; destination buffer/data identity is unchanged within each process. Decode stays CPU-only.

The earlier same-GPU-profile hash agreement did not detect this defect. Corrected finite eight-frame logits differ from the underfilled-bank result: 2507540d5e3f5001e1abb8167d5ea8ff5a855828b4db650a45233bbc7dfb405a. This is an expected consequence of changing missing weight data; no new paired CPU quality reference or broad task suite was run. Earlier sparse-copy GPU results cannot qualify correctness. Retain their timings and finite/argmax observations as historical diagnostics only. Dense-attention qualification is separate.

## Source fix and tests

src/llama-moe-copy.h checks the four expert tensor roles for pointer sharing across model.layers. llama_context::sched_copy_experts declines both sparse callback paths for shared weights before the MoE cache can handle the first split. The scheduler then copies the full source tensor once. Unshared expert banks keep their callback. This is conservative for layer-shared pointers; distinct tensor views and other graph-level alias patterns need separate review.

The test-context-handoff fixture checks null, unrelated, unique, shared and cross-role pointers, then restores model metadata before executing its existing state tests. Default/Gemma/Qwen/Nemotron controls pass. The changed binary also passes12 scheduler cases, the Vulkan queued-copy/lifetime/canary regression, and the route-mask unit. Ten coverage parser checks test stale/allocation identity, missing uploads and route layouts; the fixed parser additionally recognises a full-tensor API request. The first unit build failed on a missing include flag; failure retained, fresh build2 passed.

Two distinct128/8 model diagnostics were run: route-value capture, then the corrected full-copy control. No profiler-off screen or completed benchmark was repeated. Temporary scheduler hooks were removed from source after validation. The49-line permanent fix/test patch and the profiler repair are locally integrated; dirty primary bytes and its untracked list compare unchanged. No push.

## Corrected diagnostic budget and limits

The fixed instrumented prefill spends5.458s in CPU backend calls,0.276s in GPU backend calls and0.026s in copy/wait wrappers, within5.767s. These profiler-on observations locate work; they are not a before/after speed comparison. Full-tensor API payload is software accounting, not measured DMA/DRAM traffic.

Builds/tiny tests enforce4GiB/swap0/2CPU; model diagnostics enforce24,964,497,408bytes/swap0/16CPU, full model/projector backing, non-model RSS, deduplicated DRM,256MiB supervisors and2GiB host reserve. Fixed peak full estimate23,606,830,656bytes; per-process swap0. Kernel and monitor receipts are retained.

Both diagnostics restored exact cache768 container4c82176224511e875c63e78af85c94b4c8553e0e23b4cd14afd518c323eacce4, runtime1dadee62b, strict4/16,64K/F16/FAoff, b512/ub128, Q8 CPU vision, embedded UI, high reasoning and uncapped production output/reasoning. Tools42, prefix215, actual-delta cancellation/drain and natural READY pass. Populated64K, native-crash recovery and GPU serving/UI/vision remain unqualified. Stopped rollbacks and the paused old task are preserved.

## Next work

Keep the measured CPU/SIMD cache768 winner. Reuse the retained70-bucket CPU profile to investigate Q8_0 projections and CPU graph/operator costs before another placement sweep. Any corrected GPU performance candidate needs a fresh declared mechanism, profiler-off controls, full routed-weight coverage and task/serving qualification. No GPU speedup is accepted from these diagnostics.

Prior-feature reuse and bounded plans are retained under route-coverage/plan.md and shared-expert-fix/plan.md. Exact raw paths/hashes are in provenance.json. Original frozen namespaces and immutable runtimes remain unchanged; never resume their old controllers.
