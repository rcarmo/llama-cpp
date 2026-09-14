## Borrowing the expert cache for prefill

The hot expert cache is used only at eight tokens or fewer, but normally keeps its GPU allocation throughout prefill. `LLAMA_SHARED_VRAM=1` now releases that allocation for larger batches and restores it before short-batch execution. This is opt-in, inference-only, and has not demonstrated a repeatable latency improvement on our RTX 3060.

The implementation saves packed tensors in host memory at model load, preserving tensor metadata and allocation offsets. Before changing residency it drains registered model contexts, releases scheduler staging, clears CUDA graph executables and resets reusable graph results. A recursive model lock serialises participating inference calls; target and native MTP contexts share the registry. Context creation and graph reservation restore residency before referencing cache tensors. Training rejects this mode because the saved weights would become stale.

The active scheduler may borrow at most the released buffer's byte size. Idle schedulers release their staging before ownership changes. Complete tensors are admitted individually; the ring can shrink to one slot, and tensors larger than the budget use ordinary scheduler transfers. Growing a ring releases its previous allocation first. This budget covers staging payload allocations, not all GPU memory, CUDA event overhead or scheduler compute buffers.

## Controls

```bash
LLAMA_SHARED_VRAM=1 \
GGML_SCHED_PREFETCH_EXPERTS=2 \
GGML_SCHED_PREFETCH_BUDGET_MIB=256 \
GGML_SCHED_PREFETCH_RESERVE_MIB=64 \
GGML_SCHED_PREFETCH_TRACE=1 \
llama-server ...
```

The model must already have a routing-profile hot cache. `LLAMA_SHARED_VRAM` accepts exactly `1`; omitting it preserves normal residency. Prefetch must be enabled separately. The explicit staging budget and free-memory reserve still apply in addition to the borrowed-capacity limit. A 64 MiB reserve was tested here, not selected as a new default; the existing 256 MiB default rejects staging at this placement.

On the 16-slot, five-CPU-MoE-layer Qwen3.6 configuration, eviction releases 80,619,520 bytes (76.9 MiB). One 77,594,624-byte tensor (74 MiB) fits; the 102,760,448-byte tensor does not. The smaller slot persists across eligible prefill batches and is released before decode-cache restoration. Admission tracing confirms actual staging rather than fallback.

Restoration allocation failure leaves the cache evicted and returns an allocation error. The server reports HTTP 500 for that request; a later request can retry restoration. Staging allocation failure uses ordinary transfers. Cancellation does not force immediate restoration: the next short batch or graph reservation restores it, or model teardown releases the remaining resources.

## Measurements and checks

Same-binary three-turn agentic runs include eviction and restoration in wall-clock task time:

| Order | Relocation off median | Relocation on median |
|---|---:|---:|
| Off then on, three runs each | 7.153 s | 7.246 s |
| On then off, three runs each, after reservation safeguards | 7.526 s | 7.429 s |

The direction changes across runs. These small differences do not establish a repeatable gain, so the running service keeps relocation and prefetch disabled. The control retains the same explicit prefetch settings but cannot admit the ring without relocation.

The CUDA server builds. Seven CPU regression tests pass, including borrowed-slot arithmetic (exact fit, no fit, zero and overflow boundaries) and repeated staging release while draining CPU work. Runtime checks passed a 31,689-token agentic conversation, cancellation followed by recovery, and tool arguments/final-text parity across six initial comparison runs. These are fixture-level response checks, not exhaustive numerical equivalence.

The test-only allocation interposer in `tests/prefetch-allocation-fault.cpp` was armed after model loading. Failing the 80,619,520-byte restoration allocation produced HTTP 500; the following agentic task restored the cache and passed. Failing the 77,594,624-byte staging allocation fell back and completed the agentic task. Logs must confirm the selected allocation failure: a prompt of eight tokens does not trigger eviction.

Raw run directories and scripts are under `/workspace/tmp/shared-vram/` on the benchmark host. The GPU scheduler test also passes repeated graph-cache clearing (including clearing an empty cache), subsequent recapture and numerical output checks. Two independent contexts sharing one model also completed concurrent prefill/decode with admitted staging, using `LLAMA_TEST_SINGLE_MODEL=1` with `test-thread-safety`, `-np 2 -c 2048 -b 2048 -ub 512 -n 96`. The long prompt initially exceeded a 512-token batch limit and asserted; correcting the test batch limit to 2,048 passed. This is a bounded concurrency check, not exhaustive stress. Allocation-address reuse under a dedicated CUDA graph-lifetime test remains a validation gap. The shared-model lock is not a promise that unrelated mutation APIs or simultaneous calls on one context become thread-safe.
