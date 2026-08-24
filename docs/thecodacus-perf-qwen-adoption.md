# thecodacus/perf Qwen performance adoption assessment

Date: 2026-08-24

## Scope

Audited:

- local base: `1528f91c4f5680b420c981e79268c029d67ee265`
- remote: `thecodacus/llama.cpp`
- branch: `perf`
- audited tip: `0ac3d9b277209a82559ab484ff5452929d44e702`
- merge base: `8f5ab832ca7d8a7b4f23687693fb8b0ecbc227e7`

Target profile:

- NVIDIA RTX 3060, 12 GiB
- Qwen3.6 35B-A3B Q2_K_XL MTP
- five CPU MoE layers
- q4_0/q4_0 KV cache
- existing production defaults remain unchanged unless an end-to-end gate passes

## Executive decision

The useful MoE placement mechanisms from `thecodacus/perf` were already present in this fork:

- `20f5994bf` — optionally pin mmap-backed CPU weights for faster host-to-device uploads;
- `1163cb349` — overlap offloaded expert-weight uploads with computation;
- `5f83fbbe7` — size prefetch slots by layer and fix fallback lifetime handling.

They remain opt-in through:

```bash
GGML_CUDA_REGISTER_HOST=1
GGML_SCHED_PREFETCH_EXPERTS=N
```

The later static hot-expert VRAM cache and asynchronous hot/cold split were not adopted. The branch implementation required compatibility and correctness fixes on current Qwen, then regressed measured generation throughput. The TurboQuant fused-attention work was also not promoted because the active Qwen profile uses q4 KV after TurboQuant measured slower.

The missing routing trace and policy simulator were adopted so future MoE placement decisions can be based on measured routing rather than fixed assumptions.

## Commit assessment

| Commit | Subject | Decision |
|---|---|---|
| `20f5994bf` | Pin mmap-backed CPU weights | Already present; retain opt-in |
| `1163cb349` | Overlap expert uploads with compute | Already present; retain opt-in |
| `5f83fbbe7` | Per-layer prefetch slots and lifetime fix | Already present; retain opt-in |
| `5e7f6271c` | Usage and benchmark documentation | Superseded by this report |
| `170322f8d` | TurboQuant KV across backends | Core feature already present from earlier integration |
| `933820717` | CUDA Q2_0 support | Equivalent upstream support already present |
| `4cd54c684` | Mixed Turbo/q8 CUDA FA fix | Current fork contains the mixed-cache handling lineage |
| `40f20368d` | Fused Turbo MMA FA decode | Rejected for active q4 KV profile; separate Turbo-only experiment |
| `ac743f81f` | Static hot-expert VRAM cache | Rejected after correctness fixes and negative Qwen A/B |
| `8e5bc28c7` | Laguna graph wiring | Not relevant to Qwen placement |
| `0ac3d9b27` | Async CPU cold/GPU hot overlap | Rejected with the static cache; disabled-mode scheduler concept retained only as an experiment |

## Static-cache code audit

The cache ranks experts from a CSV routing profile, copies the top `S` experts per CPU-resident MoE layer into a GPU pack, maps selected IDs into disjoint hot/cold ID tensors, evaluates two FFN chains and adds their results.

The trial port exposed these issues:

1. current top-k IDs are a strided view and must be materialized with `ggml_cont_1d` before flattening;
2. the branch's packed path fell through into the normal activation/down-projection path, causing a Qwen shape assertion;
3. the graph API and per-layer SwiGLU clamp representation had changed;
4. splitting every prompt FFN into hot/cold chains caused a large prefill regression;
5. async CPU scheduling was enabled by default in the branch despite being beneficial only in specific decode graphs.

A corrected isolated port compiled and ran, but failed the performance gate.

## Routing evidence

A bounded trace used 128 Qwen decode steps and recorded:

```text
40 MoE layers
256 experts per layer
8 selected experts per token
5,920 CSV rows
```

Routing concentration:

```text
top 10% of (layer, expert) pairs: 18.4% of decode routing
top 25%:                           39.0%
top 50%:                           65.7%
```

Static-oracle simulated hit rates:

| Slots/layer | Approx. cache fraction | Hit rate |
|---:|---:|---:|
| 4 | 1.56% | 19.3% |
| 8 | 3.12% | 30.9% |
| 16 | 6.25% | 44.7% |
| 32 | 12.5% | 63.5% |
| 64 | 25% | 84.1% |

The Q2 expert slab was approximately 1.08 MiB for gate, up and down tensors together. For the five CPU-MoE layers, 8–16 slots require roughly 43–86 MiB of GPU weight storage, excluding maps and graph buffers.

## Hot-cache A/B

Reduced offload was used so the audit did not terminate unrelated GPU workloads. Placement remained five CPU MoE layers. Runs used pp64/tg32 with three repetitions.

Initial branch behavior:

| Mode | pp64 tok/s | tg32 tok/s |
|---|---:|---:|
| Cache off | 273.02 | 29.13 |
| 8 slots | 213.08 | 26.86 |
| 16 slots | 219.79 | 27.45 |

After limiting the packed path to decode-sized batches and making async scheduling opt-in:

| Mode | pp64 tok/s | tg32 tok/s |
|---|---:|---:|
| Cache off, async off | 286.24 | 29.19 |
| Cache off, async on | 273.05 | 29.55 |
| 8 slots, async off | 266.62 | 28.04 |
| 8 slots, async on | 272.24 | 27.22 |

The cache did not pass the no-regression gate. Simulated hit rate was insufficient to amortize graph splitting, ID remapping, dual dispatch and output merge overhead.

## Existing scheduler-prefetch A/B

The already-integrated `GGML_SCHED_PREFETCH_EXPERTS` path was measured with five repetitions and async CPU scheduling off:

| Slots | pp64 tok/s | tg32 tok/s |
|---:|---:|---:|
| 0 | 299.64 | 28.46 |
| 1 | 132.88 | 23.57 |
| 2 | 203.59 | 29.68 |
| 3 | 208.50 | 28.29 |

Two slots produced a noisy 4.3% decode increase while reducing prompt throughput by about 32%. This does not justify enabling it in the production launcher. The implementation remains available for models with substantially more CPU-offloaded experts or prefill-dominated workloads.

## Adopted tooling

Build:

```bash
cmake --build build-cuda --target llama-moe-trace -j4
```

Capture routing:

```bash
MOE_TRACE_OUT=qwen-moe.csv \
  ./build-cuda/bin/llama-moe-trace \
  -m model.gguf -ngl 99 -ncmoe 5 -fa on \
  -p "representative prompt" -n 256
```

Simulate policies:

```bash
python3 tools/moe-trace/simulate.py qwen-moe.csv \
  --budgets 0.015625,0.03125,0.0625,0.125 \
  --slab-mb 1.08
```

Prompt rows have negative positions; decode rows have non-negative positions. `static-oracle` is an upper bound, not a deployable online policy. Use multiple representative prompts before selecting any static profile.

## Operational guidance

Defaults remain unchanged. If evaluating the existing placement controls:

1. benchmark each variable independently;
2. keep output, prompt, seed, batch, context and offload fixed;
3. record prompt and decode throughput separately;
4. reject candidates with more than 3% regression in either production metric;
5. require at least 5% repeated end-to-end gain before changing a launcher;
6. keep `GGML_CUDA_REGISTER_HOST` and `GGML_SCHED_PREFETCH_EXPERTS` unset otherwise.

`GGML_CUDA_REGISTER_HOST=1` is relevant only with mmap-backed CPU weights. The active RTX 3060 launcher uses `--no-mmap`, so host registration does not apply without changing load policy.

## Final decision

Accepted:

- the already-integrated opt-in mmap registration and bounded expert prefetch scheduler;
- routing trace and simulation tooling;
- explicit Qwen placement methodology and performance gates.

Rejected:

- static hot-expert VRAM cache;
- default async CPU split scheduling;
- production enablement of scheduler prefetch for the current five-layer placement;
- fused TurboQuant attention for the active q4 KV profile.

Revisit the cache only when a trace demonstrates stronger routing skew, more CPU-resident MoE layers make transfer cost dominant, or a backend can fuse hot/cold dispatch without duplicating the FFN graph.
