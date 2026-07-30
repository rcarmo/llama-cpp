# TurboFieldfare technique adoption report

## Outcome

Adopted the low-risk, evidence-gated parts of TurboFieldfare's expert-I/O
strategy: expert range mapping, behavior-neutral metrics, bounded miss-only page
advice, a single bounded asynchronous worker, adaptive policy modes, safe same-
block lookahead, and Prometheus visibility.

A fixed-slot raw expert cache and concurrent `pread`/pinned-buffer cache were not
implemented because the measured go/no-go threshold was not met on this host.

## Baseline and layout

Target: Qwen3.6-35B-A3B Q2_K_XL, CPU-only mmap, 6 threads.

- Model file: 12.57 GB on ext4 `/dev/sdb`.
- 41 routed layers, 256 experts/layer.
- Each expert is exactly three contiguous aligned ranges (gate/up/down), usually
  about 1.01 MB total.
- Routed expert tensors occupy 10.78 GB.
- Whole-token baseline: routed `MUL_MAT_ID` is about 1.00 s of 2.28 s warm graph
  time and 115.47 GB of logical reads across 11 graphs.
- Fresh warm/cold processes physically read approximately the full model; the
  best-effort cold hint increased process wall time by 6.3%.

## Implemented

- `tools/inspect-expert-gguf-layout.py`: validates real GGUF expert layout and
  emits stable offsets/lengths.
- Pure overflow-safe expert range planner with deduplication, sorting,
  coalescing, and byte/range limits.
- Focused synthetic planner tests.
- Opt-in `GGML_CPU_EXPERT_IO_PROFILE` selection/reuse/range/residency metrics.
- Stable C metrics snapshot plus `llamacpp:expert_io_*` Prometheus counters.
- `GGML_CPU_EXPERT_IO_ADVISE_MODE=off|bounded|adaptive`.
- Miss-only page-aligned advice, per-node/per-graph byte/range/time caps,
  failure/slow-call circuit breaker, and bounded reuse state.
- One lazily-created worker with bounded queue (default depth 1); graph end
  drains work for mapping lifetime safety.
- Same-block lookahead only when the next `MUL_MAT_ID` reuses the exact same
  already-materialized IDs tensor. Cross-layer lookahead is forbidden.
- Linux/macOS mapped advice and Windows `PrefetchVirtualMemory` abstraction;
  unsupported systems safely return `ENOTSUP`.

## Correctness and safety

- Planner and focused quant tests pass.
- Default/off mode emits no expert profile output and does not create the advice
  worker.
- Enabled modes preserve model/system fingerprint, token counts, and output
  prefix in bounded server tests.
- No invalid IDs, advice syscall failures, scheduler stalls, or major faults
  were observed.
- Graph byte/range/time budgets and queue limits stopped submissions as designed.
- Forced diagnostics validated worker/circuit behavior without changing
  defaults.
- Apple `mincore` vector typing, tensor contiguity, index narrowing, environment
  overflow, unbounded reuse state, and profiler barrier overhead were explicitly
  hardened during review.

## A/B results

Persistent-server request after `POSIX_FADV_DONTNEED`:

| Mode | Request wall | Physical reads | Major faults | Minor faults | Advice calls |
|---|---:|---:|---:|---:|---:|
| off | 0.982 s | 0 | 0 | 19,470 | 0 |
| bounded | 0.986 s | 0 | 0 | 19,366 | 0 |
| adaptive | 0.994 s | 0 | 0 | 19,349 | 0 |

All modes produced identical token counts/output prefix. Active mmap pages
remained resident, so normal advice correctly issued zero calls. Differences
(+0.4%/+1.2%) are noise; no performance win is claimed.

Warm llama-bench runs similarly issued no advice. After removing a duplicate
residency scan, bounded/adaptive overhead returned to noise level.

## Fixed-slot cache decision

**No-go on this host.** The acceptance threshold is residual expert storage I/O
of at least 10% of token wall time after bounded advice, plus evidence of useful
expert reuse under page pressure. The 64 GB host showed zero request-time
physical reads and zero major faults, so a raw slot cache would add complexity,
memory pressure, and lifetime risk without measured benefit.

Consequences:

- no fixed aligned expert slot cache;
- no concurrent `pread`/pinned-buffer prototype;
- no raw-to-packed promotion implementation.

The design remains documented for future memory-constrained hardware. Any raw
expert cache must remain separate from the existing compact-IQ IME2 packed-tile
cache, with independent budgets/ownership/invalidation.

## Existing features not duplicated

Audit confirmed existing fused QKV, Flash Attention, batch/ubatch prefill,
backend feature tiers, compact-IQ caching, whole-token/Vulkan profiling, and
generic mmap prefetch. Apple10 TensorOps and Metal `bytesNoCopy` were not ported.

## Platform limitations

- Linux: active mapped `MADV_WILLNEED` policy and residency filtering.
- macOS: active mapped `MADV_WILLNEED`; `F_RDADVISE` deferred until stable owning
  file descriptor/offset plumbing exists.
- Windows: `PrefetchVirtualMemory` primitive compiles, but automatic miss policy
  is not claimed because there is no `mincore`-equivalent integration yet.
- Real benefit still requires a memory-constrained host or controlled page
  pressure where expert pages actually become nonresident.

## Rollback

All behavior is off by default. Unset `GGML_CPU_EXPERT_IO_PROFILE`,
`GGML_CPU_EXPERT_IO_ADVISE`, and `GGML_CPU_EXPERT_IO_ADVISE_MODE` to restore the
original execution path. The default server metrics remain zero-valued.
