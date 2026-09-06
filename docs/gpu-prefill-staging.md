## GPU-prioritised prefill and bounded expert staging

CUDA already chooses whether to offload CPU-backed operations using a batch
threshold. `GGML_OP_OFFLOAD_MIN_BATCH` defaults to 32 tokens. Matrix multiply
uses its token-column dimension; routed matrix multiply uses its token batch
dimension. This makes large prefill operations eligible for GPU execution
without necessarily moving short decode operations. It is a shape heuristic,
not an explicit prefill/decode/MTP phase classifier.

The scheduler's existing expert-prefetch path is a different mechanism: it
uploads host expert weights for operations already assigned to a device. The
new budget guard limits this extra staging memory, without inventing a second
placement mechanism or enabling prefetch by default.

## Controls and accounting

```bash
GGML_SCHED_PREFETCH_EXPERTS=2 \
GGML_SCHED_PREFETCH_BUDGET_MIB=256 \
GGML_SCHED_PREFETCH_RESERVE_MIB=256 \
llama-server ...
```

`GGML_SCHED_PREFETCH_EXPERTS` remains the existing opt-in ring control. The
budget guard is active only when `GGML_SCHED_PREFETCH_BUDGET_MIB` is present.
Omitting it retains legacy unbudgeted prefetch behaviour. A zero budget rejects
new staging. Invalid numeric values disable prefetch rather than accepting a
partially parsed value. The reserve defaults to 256 MiB when budgeting is used.

The guard checks current slots, requested slot size, serial allocate-before-free
replacement peaks, and device free memory after reserving headroom. Existing
scheduler copies, model, KV and compute allocations are already reflected in
the free-memory snapshot; they are not charged again to the staging budget.
Backend/event overhead and allocation rounding can consume additional memory,
and concurrent device allocations can race the snapshot. Reserve is therefore
headroom, not a guarantee or a global GPU memory limit.

If admission fails, prefetch resources are synchronised and released and the
scheduler uses ordinary transfers. This does **not** relocate the operation to
CPU. The pre-existing placement still applies. Persistent staging is retained
across short decode turns unless disabled or freed by the normal lifecycle.

`GGML_SCHED_PREFETCH_TRACE=1` prints admission size, slot count, budget, device
free memory, reserve and decision. It is opt-in diagnostic output and should
be disabled for performance comparisons.

## Qwen3.6 agentic measurements

The deployed 16-slot expert-cache profile was used as the baseline. Two runs
per offload threshold completed the same serial tool task:

| Offload threshold | Tool-result prefill tok/s | Task time |
|---|---:|---:|
| 32 (default) | 1375-1396 | 7.07-7.49 s |
| 8 | 1372-1376 | 6.93-7.35 s |
| 1000000 (effectively disabled) | 798-829 | 10.23-10.62 s |

Threshold 8 changed prefix reuse on one turn and did not establish a clear
repeatable gain. Keep 32. GPU-prioritised prefill is already beneficial here.

With five CPU-MoE layers, staging wanted two 102,760,448-byte buffers but free
memory was only 126,222,336 bytes. All 0/128/256 MiB budgets fell back. With six
CPU-MoE layers there was still insufficient headroom for that ring plus reserve.
Seven CPU-MoE layers admitted staging at a 256 MiB budget and reserve.

At seven CPU-MoE layers, the first matched ordinary-transfer runs reached
931-938 prefill tok/s; admitted staging reached 805-815. A later same-placement
comparison produced task times of 8.74 s with zero budget and 8.81 s with
admitted staging. Host contention makes these small samples unsuitable for a
universal ranking, but no deployment gain was demonstrated. Both configurations
lose against the tuned production placement.

Request-aligned Nsight tracing of an admitted run, excluding startup, found:

| Turn | HtoD bytes | Cumulative copy duration |
|---|---:|---:|
| Initial tools request | 1,846,599,936 | 76.685 ms |
| Large tool result | 11,064,529,552 | 452.511 ms |
| Cached follow-up | 1,918,744,764 | 81.729 ms |

These sums include all host-to-device traffic in each request, not just staging.
Copy duration is not exposed latency and cannot be added to kernel time to
calculate wall-clock cost. The trace establishes transfer volume, not an
end-to-end staging benefit. Raw captures and request-alignment scripts are on
the benchmark host under `/workspace/tmp/gpu-prefill/`.

## Tests and limits

`test-prefetch-budget` covers parsing, overflow, exact fits, reserve exhaustion,
retained buffers and sequential resize peaks. It runs alongside the six async
scheduler tests, all passing in the isolated CPU build. CUDA server compilation
also passes.

Invalid-budget, zero-budget and admitted-staging runs at identical placement
produced matching tool arguments and final text. An admitted run reached
31,689 prompt tokens and completed the expected correction; cancellation and
short-task recovery passed afterward. This is response parity for the fixture,
not a claim of exhaustive numerical equivalence.

Staging-buffer allocation failure was injected on the first and second slot,
armed after model loading. Both cases completed two agentic cycles and matched
the ordinary-transfer control's tool arguments and final text. The second case
exercises partial-ring cleanup. No new alias handling or operation semantics
were introduced. These integration checks supplement, rather than replace, the
arithmetic helper tests.

The Linux-only test interposer is not linked into production:

```bash
g++ -shared -fPIC -Iggml/include tests/prefetch-allocation-fault.cpp \
  -ldl -o /tmp/prefetch-fault.so
# Launch candidate with LD_PRELOAD=/tmp/prefetch-fault.so and:
# PREFETCH_FAULT_MARKER=/tmp/prefetch-armed
# PREFETCH_FAULT_BYTES=102760448 PREFETCH_FAULT_NTH=2
# After /health is OK, touch /tmp/prefetch-armed before the first request.
```

Match the byte size to the admission trace of the tested model. The shim fails
the selected matching buffer allocation once; it is not a universal allocator
fault injector. Injection logs must follow staging admission to confirm the
intended path was exercised. Explicit phase classification, CPU placement fallback,
and a calibrated transfer-versus-compute cost model remain outside this patch.

Production is unchanged: prefetch remains off and the offload threshold remains
32. Only the memory guard is a candidate reusable safety improvement; the tested
staging settings are not recommended for this host.
