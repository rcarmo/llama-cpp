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

The standard IME matmul scheduler can also be forced for crossover diagnosis:

```bash
GGML_RISCV64_SPACEMIT_MATMUL_SCHEDULE=auto    # existing heuristic
GGML_RISCV64_SPACEMIT_MATMUL_SCHEDULE=tcm-a   # stage quantized activations
GGML_RISCV64_SPACEMIT_MATMUL_SCHEDULE=tcm-b   # stage weight columns
GGML_RISCV64_SPACEMIT_MATMUL_SCHEDULE=direct  # bypass both TCM paths
```

Forced TCM modes fall through to the direct scheduler when their capacity constraint is not met. This selector does not change arithmetic kernels or the separate MoE scheduler.


### Whole-token profiling

Use the opt-in aggregate profiler for short, isolated requests:

```bash
GGML_CPU_WHOLE_TOKEN_PROFILE=1 build-upstream/bin/llama-server ...
```

It emits cumulative process totals at exit for matrix, attention, recurrent, copy and other work, including node wall time, summed active-thread time, thread capacity, estimated idle/synchronization time and logical source/destination bytes. Profiling mode adds barriers at node boundaries to make wall measurements well-defined, so use separately measured unprofiled throughput for performance claims and use active-thread shares to locate dominant families. Fused nodes are attributed to the first operation in the fused pair. In a tiny 100-process fixture, profiler-enabled and disabled wall time was indistinguishable (36.633 s versus 36.640 s), but this does not bound enabled overhead on a model graph with many short nodes. The environment-unset path retains the original barrier schedule.

## Compact-IQ IME2 controls

The compact-IQ routed-MoE path is separate from the standard matmul scheduler:

```bash
# Direct compact-IQ × Q8_K RVV
GGML_RISCV64_SPACEMIT_IQ_IME2_TILE=0

# Direct IQ2/IQ3/IQ4 packing into IME2 tiles with a bounded cache
GGML_RISCV64_SPACEMIT_IQ_IME2_TILE=1 \
GGML_RISCV64_SPACEMIT_IQ_IME2_CACHE_MB=8192 \
  build-upstream/bin/llama-server ...

# Exercise IME2 scratch packing without cross-request cache reuse
GGML_RISCV64_SPACEMIT_IQ_IME2_TILE=1 \
GGML_RISCV64_SPACEMIT_IQ_IME2_CACHE_MB=0 \
  build-upstream/bin/test-spacemit-iq-moe-correctness 8
```

`GGML_RISCV64_SPACEMIT_IQ_IME2_CACHE_BYTES` sets an exact byte ceiling and takes precedence over the MiB setting. The cache budget is shared across IQ2, IQ3 and IQ4 formats. `GGML_RISCV64_SPACEMIT_IQ_IME2_CACHE_ADMIT_ROUTES`, `GGML_RISCV64_SPACEMIT_IQ_IME2_PROTECTED_PCT` and `GGML_RISCV64_SPACEMIT_IQ_IME2_LAYER_RESERVE_PCT` expose diagnostic admission/protection policies; global tile LRU with a 0% protected pool is the default because tested protected-expert and whole-expert policies regressed Qwen.

The cache profile now reports hits, misses, bypasses, admission/demotion/eviction counts and current/peak bytes. `pack_calls` counts pack-function invocations; `pack_direct_rows` and `pack_fallback_rows` count source rows; `pack_us` is pack-function wall time; `pack_input_bytes` is compact source-row storage consumed; and `pack_output_bytes` is the full Q8 tile-buffer footprint materialized per call, including unused row capacity in a partial tile. These fields separate direct compact block packing and float-fallback staging from IME2 matrix execution.

When the tile gate is enabled and neither byte nor MiB ceiling is set, the budget is 64 MiB. Cache allocation failure uses per-thread scratch packing; it does not switch the current operation to RVV.

Use `test-spacemit-iq-moe-correctness` before model tests. The current fixture covers IQ2_XS, IQ3_XXS, IQ4_XS and IQ4_NL at routed row counts 1, 2, 4, 5 and 8 with one and eight workers.

Run prompt-only and generation-only `llama-bench` processes when comparing Q2. Combined pp+tg Q2 invocations produced valid rows and then aborted with `malloc(): invalid size (unsorted)` during graph teardown/rebuild. The persistent server lifecycle completed short, cached, 16K-context and restart tests without that failure.

The original 22 July Q2 sweep used one cache manager per compact format, so its `CACHE_MB` value was not an aggregate ceiling. The corrected shared manager reaches 0.96, 1.20, 1.67 and 3.58 tok/s over 64 warm tokens at 16K with aggregate ceilings of 8, 10, 12 and 14 GiB respectively. The 14 GiB profile leaves about 4.4 GiB available. This is a benchmark profile, not the live default; Q4_K_M remains the production service.

Benchmark result directories are not intended to be committed wholesale. Promote the selected immutable baseline and final tables into a report with links or checksums for retained raw artifacts.
