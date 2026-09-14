# TurboFieldfare technique audit

Source audited: `drumih/turbo-fieldfare` at `f8abc4422e33a8808d5a5c1032a0e97ed5aa5118` / tag `0.3`.

## What it is

TurboFieldfare is a Swift 6.2 / Metal 4 runtime specialized for Gemma 4
26B-A4B on Apple Silicon. It is not a llama.cpp fork. Its primary design goal is
running a model with roughly 14.3 GB of installed weights on 8 GB Macs by
keeping shared weights/KV resident and streaming routed experts from SSD.

Published results emphasize memory efficiency rather than peak speed:

- M2: 5.1–6.3 tok/s at roughly 1.9–2.1 GB process footprint;
- M5 Pro: 31–35 tok/s at roughly 2.1 GB;
- MLX on the M5 Pro: 76–82 tok/s but roughly 8.3–9.8 GB RSS and 14.7–15.3 GB GPU allocation.

On the M2 diagnostic profile, expert reads account for about 83% of decode wall
time. This validates the project's focus on expert storage/I/O scheduling.

## Techniques worth leveraging

### 1. Expert-aware bounded page/read advice — highest priority

TurboFieldfare knows the selected routed experts before executing them and:

- computes exact expert file ranges;
- advises only cache misses;
- coalesces adjacent/overlapping ranges;
- caps the number of misses and advised bytes;
- tracks slow advice calls and can skip or reduce later advice;
- exposes call/byte/failure/skip/latency diagnostics.

llama.cpp currently supports mmap-wide prefetch/random advice, but not router-
selected expert advice. A portable Linux implementation can use
`posix_fadvise(POSIX_FADV_WILLNEED)` or `madvise(MADV_WILLNEED)` on tensor-backed
ranges. macOS can use `F_RDADVISE`; Windows needs an equivalent/no-op fallback.

This is especially relevant to our Qwen MoE profiles where several MoE layers
remain on CPU (`--n-cpu-moe`) and model pages may be demand-faulted from mmap.

Recommended first experiment:

1. expose mapped file offset/length for routed expert tensors;
2. after router top-k selection, collect cache-miss expert ranges;
3. sort/coalesce ranges;
4. issue bounded asynchronous advice for the next layer/token;
5. record faults/read bytes/advice latency/token throughput;
6. automatically disable advice when calls are slow or hit rate is poor.

Keep it behind an environment/config gate and impose strict byte/miss ceilings.

### 2. Fixed-slot expert cache with explicit plans — promising but larger

The runtime maintains per-layer fixed-size expert slots and separates planning
from execution:

- identify hits first;
- reserve in-use/avoided slots;
- choose eviction candidates using LFU with LRU tie-breaking (or pure LRU);
- assign every miss before I/O starts;
- concurrently `pread` misses into page/2 MiB-aligned buffers;
- expose hit/miss/slot metrics.

For llama.cpp this could become a bounded CPU/pinned-host expert cache for models
that cannot remain resident. CUDA/Vulkan copies could source from stable pinned
slots. It should not replace the existing SpaceMIT compact-IQ tile cache: that
cache stores compute-ready packed tiles, whereas this proposal stores raw routed
expert weight regions. The two levels need separate budgets and metrics.

Risks:

- GGUF expert tensors may not be contiguous per expert/model;
- pinned buffers consume scarce host memory and can harm the page cache;
- expert reuse varies heavily by prompt/model;
- concurrent reads can make SSD latency worse without queue-depth caps.

Prototype only after the advice-only experiment proves I/O is a real bottleneck.

### 3. Overlap expert I/O with GPU work

TurboFieldfare fetches misses concurrently and pipelines routed-expert work while
GPU operations are in flight. llama.cpp can potentially overlap next-layer
expert advice/read with current-layer CUDA/Vulkan execution.

This requires explicit dependency/lifetime handling and bounded queue depth. It
is useful only when profiling shows storage latency on the critical path; avoid
adding threads when weights are already resident.

### 4. Hardware/shape-gated optimized paths with explicit fallback

The Apple10 prefill optimization is exemplary engineering:

- enabled only on Apple10;
- strict head/shape/scale/full-attention checks;
- preferred mode falls back to the existing causal tiled kernel;
- explicit mode fails when unsupported;
- dedicated correctness tests for selection/fallback.

The implementation uses Metal TensorOps, 8 query heads per group, 64-key tiles,
and 2D validity masks. The exact kernel is Apple10-specific, but the selection
pattern should be copied for Vulkan cooperative-matrix/Intel/ARM tuning and any
future CUDA specialization.

Our Vulkan capability tiers already follow this direction. Any vendor shader
must retain a generic fallback and log the chosen path.

### 5. Per-stage diagnostics and bounded adaptive policy

The runtime reports expert I/O, command buffers, cache planning, advice calls,
bytes, failures, slow calls, and per-stage timing. Adaptive advice uses explicit
miss, byte, and slow-call caps.

Our newly merged whole-token CPU profiler and Vulkan perf logger provide a good
base, but expert-specific counters are missing. Add metrics before optimizing:

- routed expert selections/hits/misses;
- advised/coalesced/read bytes;
- advice/read latency and overlap;
- page faults where available;
- cache occupancy/evictions;
- token time with and without expert advice/cache.

## Techniques already present in llama.cpp

Do not duplicate these TurboFieldfare ideas:

- fused QKV tensor/graph paths already exist;
- Flash Attention and specialized Metal/Vulkan kernels already exist;
- prefill batching/chunking is covered by batch/ubatch execution;
- compact-IQ compute-ready tile caching is now merged for SpaceMIT;
- whole-token CPU profiling and Vulkan pipeline profiling are merged;
- hardware/feature-gated backend dispatch already exists;
- mmap and general model prefetch advice already exist.

The useful delta is router/expert-aware storage policy, not generic fusion or
another matmul rewrite.

## Apple-specific ideas that do not transfer directly

- Metal `bytesNoCopy` shared buffers rely on Apple unified memory.
- Apple10 MPP TensorOps and 2D validity kernel are not portable APIs.
- `F_RDADVISE` is Darwin-specific.
- Metal command-buffer scheduling and storage modes require backend-specific
  equivalents.

Use their control structure and measurement discipline, not verbatim code.

## Recommended implementation order

1. Add expert I/O metrics and mapped-range discovery with no behavior change.
2. Implement bounded expert-miss page advice behind a gate.
3. Benchmark Qwen/Gemma MoE with cold/warm page cache and advice on/off.
4. Add adaptive caps/disable policy based on measured advice latency/hit rate.
5. Only if storage remains dominant, prototype fixed slots and asynchronous
   `pread`/pinned-buffer overlap.
6. Keep raw-expert cache separate from compact-IQ packed-tile cache.
7. Validate on Linux/NVMe first, then map the same policy to macOS and Windows.

## Bottom line

The most valuable transferable technique is **router-aware, bounded expert I/O
planning**, not the Apple10 TensorOps kernel. It targets a real gap in llama.cpp
and complements the existing compact-IQ compute cache. Start with advice and
metrics because it is lower-risk; fixed-slot expert streaming is promising but
should be justified by cold-cache MoE benchmarks before implementation.
