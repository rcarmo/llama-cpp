## Generalised asynchronous CPU splits

A CPU split normally occupies the scheduler thread while a GPU waits for its
next submission. This extension gives the scheduler one persistent CPU worker,
so it can submit independent work to another backend before waiting for the CPU
result. It replaces the original cold-expert tensor-name filter with operation
eligibility and dependency checks.

The extension is experimental and **disabled by default**. It can overlap real
CPU and CUDA computation, but the tested Qwen3.8 placements were slightly slower
end to end. Merging the implementation does not enable it in a production
profile.

## What can run concurrently

Successive transformer layers cannot run independently: each needs the preceding
layer's output. Within a layer there are useful candidates, including FFN gate
and up projections, which consume the same input before joining at SwiGLU.
Placement must put those branches on different backends. Enabling the worker
does not move weights, partition matrices, or automatically choose a placement.

```text
                     +-- CPU gate projection --+
normalised input ----+                         +-- SwiGLU --> down projection
                     +-- GPU up projection ----+
```

The scheduler separates a device split before an operation consuming a tensor
produced by the latest CPU split. This preserves an independent device prefix
that would otherwise be bundled with its dependent join. The rule uses graph
producers, not model names, tensor names, or Qwen-specific dimensions.

Only one CPU job may be outstanding. Another CPU split joins it before using
the CPU backend. This is a bounded extension of serial split execution, not a
work-stealing executor or a general out-of-order graph scheduler.

## Enabling it

The common CLI exposes both switches:

```bash
llama-server --sched-async-cpu ...
llama-server --no-sched-async-cpu ...
```

For llama API callers, set `llama_context_params.sched_async_cpu = true` before
creating the context. Its default is false. Direct GGML callers can use:

```cpp
ggml_backend_sched_set_async_cpu(sched, true);
```

Changing the mode synchronises the scheduler first. Configure it before graph
allocation to obtain the dependency-boundary split layout. Changing the switch
on an already allocated graph does not itself repartition that graph; reset and
allocate again when comparing layouts. Backend placement assignments should be
reapplied after a reset when required by the caller.

Existing tensor overrides can expose independent work. This was one tested
placement, **not a recommended production command**:

```bash
llama-server \
  -m /workspace/models/gguf-misc/Qwen3.8-27B-UD-Q4_K_XL.gguf \
  -ngl 39 -c 4096 -np 1 -t 4 -tb 4 -b 512 -ub 256 \
  -ctk q4_0 -ctv q4_0 -fa on \
  -ot 'blk\.(60|61|62|63)\.ffn_gate\.weight=CPU' \
  --sched-async-cpu --host 127.0.0.1 --port 19450
```

Compare against the identical command with `--no-sched-async-cpu`. Keep prompt,
seed, sampling, context, MTP settings and unrelated host workloads matched.
The standalone `llama-bench` parser does not expose this common CLI switch;
use the server or a caller setting the context parameter explicitly.

## Eligibility and fallbacks

A CPU split is eligible only when async mode is enabled, its backend is the
scheduler's final CPU backend, no evaluation callback is installed, expert
prefetch is disabled, and there is no active prefetch slot. It must contain
compute and only operations understood by the conservative allowlist:

| Operations | Treatment |
|---|---|
| `MUL_MAT`, `MUL_MAT_ID` | Eligible projections |
| `ADD`, `MUL`, `SCALE`, `SQR` | Eligible arithmetic |
| `UNARY`, `GLU`, `CLAMP`, `RMS_NORM` | Eligible activation/normalisation |
| View operations and `NONE` | Allowed, but do not alone make a compute job |
| Other operations | Serial fallback |

Custom callbacks and state-update operations are deliberately excluded. A later
split outside the allowlist also joins pending CPU work conservatively. Expert
prefetch and async CPU execution are not combined in this version. Existing
cold-expert chains can qualify through their operations, but no longer receive
special treatment through their names.

Adding an operation requires checking all memory side effects, not merely
whether it runs on CPU. Operations with hidden writes need additional modelling
or must remain serial.

## Memory and lifetime rules

The graph allocator assumes ordered execution and can assign unrelated tensors
to the same storage at different points in that order. Graph edges alone are
therefore insufficient to establish safe concurrency.

The worker follows view roots and checks storage overlap. Shared roots are
conservatively treated as aliases, even for disjoint subviews. For distinct
roots, allocated byte ranges are compared where buffers share an address space:
the same buffer, or host-backed buffers. Missing allocation information does
not establish a physical alias between distinct roots. Backend buffer identity
and host-address-space reporting must be accurate; externally aliased device
allocations hidden behind unrelated buffer objects are not modelled.

Before launch, all earlier backend submissions are drained, including input
copies. This protects storage reused from earlier splits at the cost of a
synchronisation barrier. Later work checks these hazards before copying inputs
or submitting compute:

| Hazard | Required wait |
|---|---|
| Read after CPU write | Wait before reading an outstanding result or alias |
| Write after CPU read | Wait before overwriting storage the CPU still reads |
| Write after CPU write | Wait before overwriting outstanding CPU output |
| Input-copy destination alias | Wait before the copy overwrites CPU storage |

A zero-input backend transition can skip its blanket previous-CPU wait only
while a pending job has passed the hazard checks. Other transitions retain the
existing synchronisation behaviour.

The worker borrows the scheduler's graph view. Every exit from split execution
uses a scope-exit drain, including a failure from a later backend. Normal
completion propagates the worker status; an already failing path drains the
worker while preserving that path's error. Destruction drains before releasing
worker-owned resources. Callers must still obey GGML's normal input, output and
backend lifetime contract; this does not make concurrent mutation of one
scheduler safe.

## Diagnostics and actual overlap

`GGML_SCHED_ASYNC_CPU_PROFILE=1` prints per-evaluation job count, CPU duration,
join wait and `unjoined` duration. The latter is `max(cpu_time - wait_time, 0)`.
It is **not measured GPU overlap** and must not be presented as such.

`GGML_SCHED_ASYNC_CPU_TRACE=1` prints the next split's backend, node count,
first/last node, eligibility and join decision. For the gate-on-CPU placement,
the trace showed `join=0` at CUDA `ffn_up` projections and `join=1` at SwiGLU.
Disable diagnostic output for final timing comparisons.

Nsight Systems can establish device overlap. The test has optional NVTX ranges
around CPU computation and labelled sync/async modes. On the measured host:

```bash
# Run from the checkout; paths below match its CUDA installation.
g++ -std=c++17 -O2 -DTEST_ASYNC_NVTX \
  -Iggml/include -I/usr/local/cuda-12.8/include/nvtx3 \
  tests/test-sched-async-cpu.cpp \
  -Lbuild-cuda/bin -Wl,-rpath,"$PWD/build-cuda/bin" \
  -lggml -lggml-base -lggml-cpu \
  -L/usr/local/cuda-12.8/lib64 -Wl,-rpath,/usr/local/cuda-12.8/lib64 \
  -lnvToolsExt -pthread -o build-cuda/bin/test-async-profile

nsys profile --trace=cuda,nvtx --cuda-graph-trace=node \
  --sample=none --cpuctxsw=none --force-overwrite=true \
  -o overlap-modes build-cuda/bin/test-async-profile gpu
nsys export --type sqlite --force-overwrite=true \
  --output overlap-modes.sqlite overlap-modes.nsys-rep
```

Node-level graph tracing matters: graph-level tracing can hide individual
kernel intervals. Compare CUPTI kernel timestamps with NVTX CPU ranges inside
each labelled mode:

```sql
SELECT m.text, COUNT(k.start) AS overlapping_kernels,
       ROUND(COALESCE(SUM(MIN(k.end,n.end)-MAX(k.start,n.start)),0)/1e6,6)
         AS cumulative_overlap_ms
FROM NVTX_EVENTS m
LEFT JOIN NVTX_EVENTS n
  ON n.start >= m.start AND n.end <= m.end
 AND n.text = 'async-test CPU compute'
LEFT JOIN CUPTI_ACTIVITY_KIND_KERNEL k
  ON k.start < n.end AND n.start < k.end
WHERE m.text IN ('async mode','sync mode')
GROUP BY m.text;
```

This sums intersecting kernel/range durations, not unique wall-clock time or
saved latency. The CPU-only test uses a bounded 5 ms delay to make concurrency
observable; GPU mode disables it. Leaving that delay enabled allowed the tiny
CUDA workload to finish before CPU computation and produced a misleading
zero-overlap result.

## Tests and measured results

Build and run the CPU suite in a separate directory:

```bash
cmake -S . -B build-async-test -DGGML_CUDA=OFF \
  -DLLAMA_BUILD_TESTS=ON -DLLAMA_BUILD_TOOLS=OFF \
  -DLLAMA_BUILD_EXAMPLES=OFF -DCMAKE_BUILD_TYPE=Release
cmake --build build-async-test --target test-sched-async-cpu -j4
ctest --test-dir build-async-test -R '^test-sched-async-cpu' --output-on-failure
```

| Test mode | Coverage |
|---|---|
| Default | Distinct backend instances, concurrent vs serial execution, nested-view consumer |
| `single` | Forced worker execution without another backend |
| `alias` | Nested-view in-place write that must serialise |
| `reuse` | Allocator reuse enabled; numerical correctness |
| `failure` | Injected worker/later-backend failure, drain and subsequent recovery |
| `moe` | Repeated/nonadjacent `MUL_MAT_ID` selection against scalar reference |
| `gpu` (manual) | CPU/CUDA correctness, graph reuse; returns 77 if no GPU exists |

Reset/reallocation and teardown are exercised by the general fixture. Its two
CPU backends have distinct buffer-type identities to prevent scheduler pass 3
from merging them into one backend -- the original fixture passed without
exercising its intended asynchronous path.

On the RTX 3060 host, all six registered CPU tests passed. The manual CUDA test
also passed. Nsight measured 33 kernels overlapping CPU computation, totalling
0.990 ms, in async mode and zero in the synchronous control.

Qwen3.8 27B UD-Q4_K_XL was tested with 39 GPU layers, 4K context and FFN gate
weights in blocks 60-63 on CPU:

| Mode | Generation tok/s |
|---|---:|
| Synchronous | 4.24-4.28 |
| Asynchronous | 4.13-4.18 |
| Synchronous with embedded MTP, one sample | 5.96 |
| Asynchronous with embedded MTP, one sample | 5.77 |

Exact 64-token sync/async output parity passed with and without MTP depth one.
Streaming cancellation followed by another request and a health check passed.
These are small samples with diagnostic logging, so they establish no general
performance ranking. They do establish that this placement has not earned a
production recommendation.

The routed-expert fixture is not a full MoE-model regression. Qwen3.6 files
were absent during the initial extension work, but the subsequent
[MoE restoration](qwen36-async-retune.md) verified identical tokens across 12
resident sync/async runs with native MTP and a 24-slot cache. Async was about
3.4% slower in the cleaner comparison. This covers that prompt and placement,
not every MoE architecture. Synthetic kernel overlap does not establish useful
overlap on a full model.

## Deployment and further work

Leave `--no-sched-async-cpu` in the active Qwen3.6 launcher and retained Qwen3.8
rollback launcher. The merged code has since been rebuilt and deployed, but
production still uses synchronous scheduling. To roll back an
experimental caller, disable the flag and recreate its context; restore the
previous tensor placement as well if overrides were added for the experiment.

Further optimisation needs larger independent work relative to transfer,
barrier and dispatch costs, plus a full-model device trace. Broadening the
allowlist or removing drains without modelling memory hazards would trade
correctness for an unproven speedup. Production enablement still requires
repeatable end-to-end gains, broader full-model MoE regression, target/MTP parity,
cancellation/recovery and a realistic VRAM margin.
