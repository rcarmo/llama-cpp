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
