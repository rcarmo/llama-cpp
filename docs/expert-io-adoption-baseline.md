# Expert-I/O adoption baseline

## Purpose

Freeze behavior before adding router-aware advice or raw expert caching. The
baseline records throughput, load, faults, storage reads, RSS, and whole-token
CPU timing for identical warm/cold runs.

## Primary target

Model:

```text
/workspace/models/gguf-misc/Qwen3.6-35B-A3B-UD-Q2_K_XL-MTP.gguf
```

Initial CPU/mmap baseline command:

```bash
GGML_CPU_WHOLE_TOKEN_PROFILE=1 build-expert-io/bin/llama-bench \
  -m /workspace/models/gguf-misc/Qwen3.6-35B-A3B-UD-Q2_K_XL-MTP.gguf \
  -ngl 0 -t 6 -p 32 -n 8 -r 1 -o json
```

This deliberately uses CPU-only execution and mmap so routed expert page demand
is observable without GPU/offload placement confounding the first baseline.
After the planner/advice path is correct, repeat the live-like placement with
full GPU offload plus the validated `--n-cpu-moe 5` profile.

Secondary target, when available in the same format, is a Gemma MoE model using
the same command shape.

## Warm/cold protocol

Use `tools/run-expert-io-baseline.py` with one-minute load <= 2.0 and at least
five minutes between heavy runs.

Warm:

```bash
tools/run-expert-io-baseline.py \
  --output /workspace/tmp/expert-io-qwen-warm.json --mode warm -- \
  env GGML_CPU_WHOLE_TOKEN_PROFILE=1 COMMAND...
```

Cold-file approximation without global cache dropping or root access:

```bash
tools/run-expert-io-baseline.py \
  --output /workspace/tmp/expert-io-qwen-cold.json --mode cold \
  --evict /workspace/models/gguf-misc/Qwen3.6-35B-A3B-UD-Q2_K_XL-MTP.gguf -- \
  env GGML_CPU_WHOLE_TOKEN_PROFILE=1 COMMAND...
```

`POSIX_FADV_DONTNEED` is a best-effort per-file eviction hint, not proof that all
filesystem/device caches are cold. Record and interpret major faults/read bytes
rather than labeling the run perfectly cold.

## Captured fields

- prompt/generation throughput and elapsed time;
- start/end load;
- child major/minor faults;
- sampled `/proc/<pid>/io` read/write bytes;
- child user/system CPU time and RSS;
- whole-token per-op/family/total profile;
- model filesystem/device and mount options;
- mmap/direct-I/O/GPU/CPU-MoE placement.

No expert advice/cache behavior is enabled in this baseline.

## Measured Qwen CPU/mmap baseline

Host storage: `/dev/sdb`, ext4 at `/srv`, QEMU non-rotational 512 GiB disk.
Model file: 12,574,128,416 bytes. Direct I/O off; mmap on; CPU-only, 6 threads,
32 prompt tokens, 8 generated tokens, one repetition.

| Mode | Wrapper wall | Prompt tok/s | Generation tok/s | Minor / major faults | Sampled physical reads | Max RSS |
|---|---:|---:|---:|---:|---:|---:|
| warm | 16.94 s | 35.54 | 15.03 | 381,403 / 0 | 12.574 GB | 12,662,312 KiB |
| best-effort cold | 18.01 s | 42.84 | 15.18 | 381,534 / 0 | 12.574 GB | 12,662,188 KiB |

The cold hint increases full process wall time by about 6.3%. Single benchmark
throughput samples are noisy and occur after model loading, so they do not by
themselves measure cold-start penalty.

Whole-token profiling shows a clearer execution difference:

| Mode | Graph time | Matrix time | MUL_MAT_ID time | Total idle/sync |
|---|---:|---:|---:|---:|
| warm | 2.282 s | 2.025 s | 1.002 s | 1.932 s |
| cold | 3.892 s | 2.468 s | 1.070 s | 10.188 s |

Across 11 graphs, routed `MUL_MAT_ID` performs 1,320 calls and accounts for
115.47 GB of logical reads. Matrix operations account for 131.09 GB of 141.79
GB total logical reads. Expert-aware instrumentation should therefore focus on
MUL_MAT_ID/router selections and persistent-server page residency.

Both fresh processes physically read roughly the whole model. Future advice
A/B tests should use a persistent server and per-request counters so process
startup/model mapping does not dominate the storage signal.

Raw evidence:

```text
/workspace/tmp/expert-io-qwen-warm.{json,stdout,stderr}
/workspace/tmp/expert-io-qwen-cold.{json,stdout,stderr}
```

## Routed-expert storage map

`tools/inspect-expert-gguf-layout.py` validates the target GGUF and emits exact
per-expert file ranges.

For Qwen3.6-35B-A3B Q2_K_XL:

- 41 routed-expert layers;
- 256 experts per layer;
- three tensors/ranges per expert: gate, up, down;
- the expert index is the outer storage dimension;
- every expert slice is contiguous and 32-byte aligned;
- tensor data is mmap-backed;
- no missing/mismatched projections or offset errors;
- routed-expert tensors occupy 10,779,361,280 bytes of the model file.

Per-expert storage patterns:

| Layers | Gate | Up | Down | Total per expert |
|---:|---:|---:|---:|---:|
| 37 | 303,104 B | 303,104 B | 401,408 B | 1,007,616 B |
| 2 | 303,104 B | 303,104 B | 557,056 B | 1,163,264 B |
| 1 | 401,408 B | 401,408 B | 557,056 B | 1,359,872 B |
| 1 | 344,064 B | 344,064 B | 450,560 B | 1,138,688 B |

A selected expert can therefore be represented as exactly three stable file
ranges, usually about 984 KiB total. With eight routed experts per layer, an
uncapped advice request could approach 7.7–10.4 MiB per layer, which reinforces
the need for strict miss/byte/range limits and range deduplication.

Raw mapping evidence is `/workspace/tmp/qwen-expert-layout.json`.

## Behavior-neutral expert observability

Set `GGML_CPU_EXPERT_IO_PROFILE=1` to extend the existing whole-token CPU
profiler. The hook runs immediately before CPU `MUL_MAT_ID` execution and emits
one aggregate line at exit. Default execution is unchanged when the variable is
unset.

Captured fields:

- routed matrix nodes;
- total selected IDs;
- unique and duplicate IDs within each node;
- repeated `(weight tensor, expert)` selections across graphs;
- invalid IDs;
- derived selected expert ranges/bytes from `nb[2]`;
- bounded first-page residency sampling using `mincore` on Linux/macOS.

`GGML_CPU_EXPERT_IO_SAMPLE_PAGES` controls the maximum selected experts sampled
per node (default 16). Sampling is diagnostic only; it does not advise or read
pages.

Tiny Qwen validation (`p4/n2`) reported:

```text
nodes=360 selections=2880 unique=2880 duplicates=0 repeated=684
invalid_ids=0 ranges=2880 range_bytes=983236608
resident_pages=2880 sampled_pages=2880
```

The 684 repeated selections show meaningful reuse potential. All sampled pages
were resident immediately before execution in this post-load warm process;
cold/persistent-server request boundaries are needed to observe nonresident
expert pages.

## Bounded Linux advice proof

`GGML_CPU_EXPERT_IO_ADVISE=1` enables Linux/macOS mapped-range
`madvise(MADV_WILLNEED)` for nonresident experts only. It is off by default and
shares the pure range planner.

Per-node controls:

```text
GGML_CPU_EXPERT_IO_ADVISE_MAX_BYTES       default 8 MiB
GGML_CPU_EXPERT_IO_ADVISE_MAX_RANGES      default 16
GGML_CPU_EXPERT_IO_ADVISE_COALESCE_GAP    default 0
```

Per-graph controls:

```text
GGML_CPU_EXPERT_IO_ADVISE_GRAPH_BYTES     default 64 MiB
GGML_CPU_EXPERT_IO_ADVISE_GRAPH_RANGES    default 128
GGML_CPU_EXPERT_IO_ADVISE_GRAPH_US        default 2000 us
```

Safety/adaptation controls:

```text
GGML_CPU_EXPERT_IO_ADVISE_SLOW_US         default 500 us
GGML_CPU_EXPERT_IO_MAX_SEEN               default 65536 profiler keys
```

The implementation skips resident first pages, invalid/noncontiguous layouts,
exhausted graph budgets, and an open failure/time circuit breaker. Advice is
page-aligned and overflow-checked. Linux and macOS mincore vector types are
handled separately.

A warm p4/n2 validation observed all 2,880 selected expert slices resident and
therefore issued zero advice calls/bytes. This is correct miss-only behavior and
also demonstrates that same-node advice after model load cannot help a fully
resident run. Safe lookahead/overlap is required to test useful advice under
page pressure.

## Bounded asynchronous advice worker

Advice execution uses one lazily created worker thread with a bounded queue
(default depth 1). Jobs contain only page-aligned address/length pairs. Graph end
drains outstanding work, preventing mapped ranges from outliving graph/model
use. There is no unbounded thread pool.

`GGML_CPU_EXPERT_IO_ADVISE_QUEUE_DEPTH` controls queue depth. For diagnostics
only, `GGML_CPU_EXPERT_IO_ADVISE_RESIDENT=1` bypasses miss filtering to exercise
the worker/circuit path; normal operation must leave it unset.

A forced-resident p1/n1 validation with tight graph limits reported 32 advice
calls, 10.29 MB advised, 0 failures, 88 us total advice time, 98 skipped ranges,
and 463 nodes disabled after graph budgets were exhausted. Queue depth remained
1. Normal warm mode still issued zero calls and skipped 2,880 resident experts.

## Advice policy modes

Use `GGML_CPU_EXPERT_IO_ADVISE_MODE=off|bounded|adaptive`. The legacy
`GGML_CPU_EXPERT_IO_ADVISE=1` maps to bounded mode.

- `off`: no worker or advice/profile output unless profiling is enabled.
- `bounded`: obey per-node/per-graph caps; slow calls are counted but do not
  permanently disable later graphs.
- `adaptive`: failures open the process circuit immediately; consecutive slow
  jobs open it after `GGML_CPU_EXPERT_IO_ADVISE_MAX_SLOW` (default 3).

`GGML_CPU_EXPERT_IO_ADVISE_SLOW_US` defaults to 500 us. A forced diagnostic with
threshold 0 and max-slow 1 issued one 7-range/2.42 MB job in 17 us, classified it
slow by construction, and disabled 479 later nodes. This validates circuit
behavior; production values must use real latency thresholds.

## Metrics endpoint

`ggml_cpu_get_expert_io_metrics()` exposes a stable cumulative snapshot. A
server started with `--metrics` publishes `llamacpp:expert_io_*` Prometheus
counters for nodes, selections, unique/repeated experts, selected range bytes,
advice calls/bytes/failures/skips/time, and resident skips. Disabled mode
exports zeros and does not enable profiling or advice.

## Advice-only execution overhead

Expert advice/observability is decoupled from `GGML_CPU_WHOLE_TOKEN_PROFILE`.
Advice-only mode does not insert the profiler's per-node barriers. Thread 0
plans/submits bounded jobs while other CPU workers may begin current-node
compute, and graph end drains the single worker for lifetime safety.

A forced advice-only p1/n1 validation (no whole-token timing enabled) issued 32
calls / 10.31 MB in 72 us with no failures. The shared exit dumper still emits
a zero-valued whole-token summary alongside expert counters; that output does
not imply profiling barriers were active.

## Dependency-safe same-block lookahead

The CPU graph loop advises the next `MUL_MAT_ID` only when it reuses the exact
same already-materialized `src[2]` IDs tensor and appears within a bounded
16-node scan. This covers gate/up/down work inside one MoE block without reading
future-layer router outputs early. Cross-layer lookahead is intentionally
forbidden.

A forced diagnostic doubled bounded advice work to 64 calls / 20.61 MB while
observation remained 480 nodes / 3,840 selections (no double counting). Advice
completed in 152 us with zero failures. Normal miss-only mode remains a no-op
when selected pages are resident.

## Persistent-server warm A/B and cache decision

After server health, `POSIX_FADV_DONTNEED` was issued for the model file and one
identical deterministic p4/n8 request was measured per mode with five-minute
spacing:

| Mode | Request wall | Physical reads | Major faults | Minor faults | Advice calls |
|---|---:|---:|---:|---:|---:|
| off | 0.982 s | 0 | 0 | 19,470 | 0 |
| bounded | 0.986 s | 0 | 0 | 19,366 | 0 |
| adaptive | 0.994 s | 0 | 0 | 19,349 | 0 |

All modes produced the same token counts and output prefix. Selected expert
pages were already resident; advice modes skipped all misses and issued no
syscalls. Bounded/adaptive deltas (+0.4%/+1.2%) are within single-run noise.

Because the active mmap kept the 12.6 GB model resident on this 64 GB host,
file-level `POSIX_FADV_DONTNEED` could not manufacture request-time misses. The
current host therefore provides no evidence that fixed raw-expert slots would
help. The fixed-slot/pread cache is a **no-go here** until testing on a
memory-constrained machine or under controlled page pressure shows residual
expert storage I/O of at least 10% of token wall time after bounded advice.

The raw expert cache remains conceptually separate from the compact-IQ IME2 tile
cache; no slot cache or pinned-buffer prototype is implemented without that
go/no-go threshold being met.
