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
