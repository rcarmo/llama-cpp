# K3 matmul benchmark harness

`bench-k3-matmul.sh` records reproducible model-level `llama-bench` runs for the SpaceMIT RVV/IME2 optimization campaign.

The harness deliberately refuses to run when:

- `llama-server` is active;
- `llama-gemma-e2b-qat.service` is active;
- the worktree is dirty, unless `ALLOW_DIRTY=1` is explicitly set.

## Baseline example

```bash
MODEL=/home/me/models/gguf-misc/gemma-4-E2B-it-qat-UD-Q4_K_XL.gguf \
  scripts/bench-k3-matmul.sh gemma-baseline
```

The default sweep uses eight threads, five repetitions, prompt sizes 32/128/512 and generation sizes 32/128. SpaceMIT pins its own worker threads to the IME-capable mask (normally CPUs 8–15 / `ff00`); the harness deliberately does not wrap the process in `taskset`, since that prevents the backend affinity change. The inherited affinity, backend-selected mask, CPU models and frequencies are recorded. Override benchmark parameters through the environment:

```bash
MODEL=/path/model.gguf \
PROMPTS=32,64 GENERATIONS=16 REPETITIONS=3 \
THREADS=8 \
  scripts/bench-k3-matmul.sh quick-check
```

Each run creates a timestamped directory under `benchmarks/k3-matmul/` containing:

- `metadata.json`: commit, model hash, parameters and SpaceMIT environment;
- `system.txt`: CPU, memory, compiler, CMake, governor and frequency data;
- `command.txt`: shell-escaped benchmark command;
- `llama-bench.json`: raw benchmark output;
- `llama-bench.stderr`: backend diagnostics;
- `run.json`: elapsed wall time and row count.

Summarize one or more raw files with:

```bash
jq -rs -f scripts/summarize-k3-matmul.jq \
  benchmarks/k3-matmul/*/llama-bench.json
```

## Matmul shape tracing

Build with the campaign telemetry commit, then enable structured thread-zero tracing for a short isolated workload:

```bash
GGML_RISCV64_SPACEMIT_MATMUL_TRACE=1 \
  build-upstream/bin/llama-bench -m /path/model.gguf -p 32 -n 0 -r 1 -o jsonl \
  >trace.jsonl 2>trace.log

scripts/summarize-k3-matmul-trace.awk trace.log
```

Each `SPACEMIT_MATMUL` line records the selected path, operation, types, M/N/K, batch dimensions and thread count. The summarizer reports both call frequency and relative MAC weight; MAC weight is a prioritization estimate, not elapsed time. Tracing is disabled by default and cached once per process.

Benchmark result directories are not intended to be committed wholesale. Promote the selected immutable baseline and final tables into a report with links or checksums for retained raw artifacts.
