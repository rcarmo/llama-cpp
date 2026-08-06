# rcarmo/llama-cpp

This fork turns llama.cpp into a measured inference stack for two constrained machines:

1. **LattePanda Sigma**, using its Intel Core i5-1340P CPU and 31 GiB of shared memory;
2. **SpaceMIT K3 / Milk-V K3**, using RVV, IME1/IME2 and tightly managed memory.

The Sigma work is the current priority and appears first throughout this README. The K3 work follows as the specialised RISC-V backend. Both campaigns use end-to-end promotion gates: a faster kernel is not enabled when the complete model or service regresses.

This repository tracks [`ggml-org/llama.cpp`](https://github.com/ggml-org/llama.cpp). Use the upstream project for general model, API and platform documentation. This page covers the fork-specific implementation, measurements and deployment profiles.

## Current status

| Machine | Area | Status | Measured result |
|---|---|---|---|
| LattePanda Sigma | Clang/native CPU build | Selected | Best general backend on this host |
| LattePanda Sigma | Qwen3.6 35B-A3B Q2_K_XL, 128K | Long-context and repository fallback | 99,104-token request; only matched repository-retrieval pass |
| LattePanda Sigma | Ornith 1.0 35B, 128K | Validated | 124,341-token prompt completed |
| LattePanda Sigma | Gemma 4 E4B, 128K | Primary local provider | Best overall matched quality; 25.77 generation tok/s |
| LattePanda Sigma | Maple Preview exact TQ2/F32, 128K | Prompt-heavy alternative | 76.03 / 71.79 / 56.91 prompt tok/s at 512 / 4K / 32K |
| LattePanda Sigma | Iris Xe SYCL/Vulkan | Rejected | Correctness or local wins did not survive end-to-end gates |
| SpaceMIT K3 | RVV/IME CPU backend | Selected | Qwen and Gemma live-verified |
| SpaceMIT K3 | Direct recurrent-state writes | Selected service option | 5.05% mean Qwen generation gain |
| SpaceMIT K3 | Compact-IQ IME2 tile cache | Opt-in | Valid under a bounded shared cache, not the service default |

## LattePanda Sigma: Intel Core i5-1340P

### Hardware and placement

The validated Sigma has:

- four P-cores with SMT and eight E-cores, for 12 cores and 16 logical CPUs;
- AVX2, FMA, F16C and AVX-VNNI, with no AVX-512 or AMX;
- 31 GiB usable shared memory and 8 GiB zram;
- Intel Iris Xe integrated graphics.

Eight inference threads pinned to logical CPUs `0-7` perform best for the 35B-A3B models. Adding the E-cores reduces generation throughput. The server process may use CPUs `0-15` for HTTP and supporting work while model compute remains on the P-core SMT pairs.

### Build the selected CPU backend

```bash
BUILD_JOBS=2 tools/build-intel-1340p.sh
```

The build helper uses an isolated Fedora container and produces a Clang 22 native x86 build with AVX-VNNI, OpenMP, the CPU backend and the embedded Web UI. Vulkan is disabled in this build.

Key entrypoints:

- `tools/build-intel-1340p.sh` - selected CPU build;
- `tools/run-intel-qwen-longctx.sh` - Qwen 128K service;
- `tools/run-intel-candidate.sh` - Ornith and Gemma profiles;
- `tools/validate-intel-candidate.sh` - no-install candidate validation;
- `tools/systemd/user/` - tracked user services.

### CPU baseline and model selection

The initial Qwen campaign established the CPU baseline and rejected Iris Xe generation offload.

| Model | Prompt pp128 | Generation tg32 | Peak profile memory | Decision |
|---|---:|---:|---:|---|
| Qwen3.6 35B-A3B Q4_K_XL | 53.608 tok/s | 13.166 tok/s | About 31 GiB | Quality profile at short context |
| Qwen3.6 35B-A3B Q2_K_XL | 28.807 tok/s | 14.895 tok/s | About 12.4 GiB RSS | Selected 128K weight format |
| Qwen3.6 27B Q2_K_XL | 4.335 tok/s | 2.909 tok/s | About 13.1 GiB RSS | Dense model, memory-bandwidth limited |

Against the published K3 Q4 baseline, the Sigma Q4 result is 58.7% faster at pp64, 65.5% faster at pp128 and 99.8% faster at tg32. These are hardware-specific measurements, not universal model claims.

Evidence: [`benchmarks/intel-1340p/final-report-20260731.md`](benchmarks/intel-1340p/final-report-20260731.md).

### Qwen 128K service and expert I/O

The selected long-context rollback profile uses:

| Setting | Value |
|---|---|
| Model | Qwen3.6 35B-A3B Q2_K_XL |
| Context | 131,072 tokens |
| Proven uninterrupted input | 99,104 tokens |
| MTP depth | 3 |
| KV | Q4_0 |
| Batch / ubatch | 1024 / 256 |
| Compute workers | 8 threads on CPUs `0-7` |
| Loading | mmap |
| Expert I/O | bounded, adaptive and miss-only |

The router-aware expert-I/O path records selected experts, maps their GGUF ranges, checks page residency and issues bounded asynchronous `MADV_WILLNEED` only for nonresident data. Prometheus counters expose selection, residency and advice behaviour.

A controlled cold-inode gate rejected a separate raw expert cache. The bounded cold request was only 0.64% slower than a warm bounded control, below the 10% residual-I/O gate. The extra ownership, eviction and slot-lifetime complexity was not justified.

The uninterrupted 99,104-token acceptance run took 21,663 seconds at 4.580 prompt tok/s and 2.104 generation tok/s, accepted 42/45 MTP drafts and recorded no process major faults or swap-in/out.

Operations and evidence:

- [`docs/intel-1340p-qwen-longctx-runbook.md`](docs/intel-1340p-qwen-longctx-runbook.md)
- [`benchmarks/intel-1340p/qwen-longctx-fieldfare/report.md`](benchmarks/intel-1340p/qwen-longctx-fieldfare/report.md)
- [`docs/expert-io-adoption-baseline.md`](docs/expert-io-adoption-baseline.md)

### Ornith and Gemma 128K validation

The final candidate profiles use F16 KV, Flash Attention off, mmap loading, batch 1024, ubatch 256 and eight model threads.

| Model | MTP | Repeated prompt | Repeated generation | Near-capacity prompt | Near-capacity generation |
|---|---:|---:|---:|---:|---:|
| Ornith 1.0 35B | 2 | 37.53 tok/s | 16.65 tok/s | 124,341 tokens at 13.14 tok/s | 2.63 tok/s |
| Gemma 4 E4B | 3 | 61.19 tok/s | 25.30 tok/s | 124,112 tokens at 22.49 tok/s | 4.49 tok/s |

Both near-capacity requests retained output headroom, used speculative decoding and ended with exactly one schema-valid `search_repository` call. Ornith accepted 37/44 draft tokens and peaked at 23,857 MiB PSS. Gemma accepted 29/42 and peaked at 11,141 MiB PSS.

The hardening campaign also added:

- architecture-neutral speculative phase timings through `GGML_SPECULATIVE_PROFILE`;
- forced target/draft checkpoint restoration for deterministic state-machine tests;
- model-shaped backend fixtures for Ornith and Gemma target/assistant graphs;
- source-slot-aware and stride-aware semantic replay;
- numerical replay of Ornith 150/150 operations twice and Gemma 141/141 twice;
- isolated SYCL build and correctness gates;
- explicit promotion and revert records for rejected source, backend and cache candidates.

Campaign records:

- [`docs/intel-1340p-ornith-gemma-campaign.md`](docs/intel-1340p-ornith-gemma-campaign.md)
- [`benchmarks/intel-1340p/ornith-gemma-optimization/completion-audit.md`](benchmarks/intel-1340p/ornith-gemma-optimization/completion-audit.md)
- [`benchmarks/intel-1340p/ornith-gemma-optimization/final-decisions.json`](benchmarks/intel-1340p/ornith-gemma-optimization/final-decisions.json)
- [`docs/intel-1340p-ornith-runbook.md`](docs/intel-1340p-ornith-runbook.md)
- [`docs/intel-1340p-gemma4-runbook.md`](docs/intel-1340p-gemma4-runbook.md)

### Gemma local Pi provider

The deployed Sigma profile exposes `local-gemma/gemma-4-e4b-qat-mtp` on loopback at `127.0.0.1:8091`.

| Setting | Value |
|---|---|
| Context per request | 131,072 tokens |
| Aggregate context | 262,144 tokens |
| Slots | 2 independent KV streams |
| MTP depth | 3, separate assistant GGUF |
| KV | F16 |
| Prompt-state cache limit | 12,288 MiB, allocated on demand |
| Reuse/checkpoints | 256-token reuse, 32 checkpoints, 8,192-token minimum spacing |

Two isolated 128K streams beat the queued single-slot profile on the fixed concurrency workload. Group wall time changed from 55.45 to 54.69 seconds for two requests and from 108.30 to 105.37 seconds for four requests. Two- and four-slot unified-KV profiles were slower. Extra callers run in two-request waves.

```bash
systemctl --user status llama-gemma-local-provider.service
curl -fsS http://127.0.0.1:8091/health
pi --provider local-gemma --model gemma-4-e4b-qat-mtp
```

Installation, Pi registration, diagnostics and rollback:

- [`docs/gemma-local-provider-runbook.md`](docs/gemma-local-provider-runbook.md)
- [`docs/gemma-local-provider-benchmark-2026-08-02.md`](docs/gemma-local-provider-benchmark-2026-08-02.md)

### Maple, Gemma and Qwen role comparison

The matched campaign on 5-6 August 2026 used exact per-tokenizer 512, 4,096 and 32,768-token prompts, a 512-token prompt with 64 generated tokens, identical bounded API cases and identical real Pi tasks. Each model ran alone on eight P-core threads with its accepted service profile.

| Model | Prompt 512 | Prompt 4K | Prompt 32K | Generation | Bounded API | Real Pi | Role |
|---|---:|---:|---:|---:|---:|---:|---|
| Maple exact TQ2/F32 | **76.03** | **71.79** | **56.91** | 18.77 | 4/6 | 3/4 | Fast prompt ingestion |
| Gemma 4 E4B | 65.24 | 60.96 | 44.32 | **25.77** | 4/6 | 3/4 | Primary local model |
| Qwen3.6 35B-A3B Q2 | 31.89 | 26.87 | 10.95 | 11.40 | 3/6 | **4/4** | Repository-grounded fallback |

The blind substantive review ranked Gemma first, Qwen second and Maple third. Qwen alone found the requested source path and function. Gemma alone obeyed the requested tool-result limit. Maple and Gemma each failed one repository-retrieval task, while all three passed constrained edits, independent tests, exact replies and cancellation recovery.

Maple remains useful for large prompt ingestion, but it does not replace Gemma for general interactive work. Qwen remains useful when repository grounding matters more than latency. The hosted default remains `github-copilot/gpt-5.6-terra`.

Full report, raw responses, telemetry, identities and validators:

- [`benchmarks/intel-1340p/maple-qwen-campaign/report.md`](benchmarks/intel-1340p/maple-qwen-campaign/report.md)
- [`benchmarks/intel-1340p/maple-qwen-campaign/README.md`](benchmarks/intel-1340p/maple-qwen-campaign/README.md)

### Iris Xe: measured and rejected

Iris Xe remains a validation target, not the deployed inference backend.

Vulkan passed 1,544/1,544 focused `MUL_MAT_ID`, `RMS_NORM`, `ROPE` and `SOFT_MAX` cases. Full Q2 offload generated 9.90 tok/s versus 14.90 tok/s on CPU; a Q4 10-layer split generated 7.62 tok/s versus 13.17 tok/s on CPU.

SYCL discovered the Level Zero device and passed focused model-shaped operations, but broad quant support, decode throughput and graph stability were insufficient. Full and partial offload regressed generation, and the tested Gemma graph split failed.

Further Vulkan prototypes were also rejected:

- Q2 exact-row end-to-end results ranged from -2.8% to +0.7%;
- Q4 exact-row geometric mean was -0.14%;
- deferred MTP catch-up regressed generation by 3.04% and wall time by 3.59%;
- CPU/Vulkan routed-expert overlap did not clear the promotion gate.

Evidence:

- [`benchmarks/intel-1340p/cpu-vulkan-interleaving-report-20260731.md`](benchmarks/intel-1340p/cpu-vulkan-interleaving-report-20260731.md)
- [`benchmarks/intel-1340p/qwen35moe-vulkan-mtp/report.md`](benchmarks/intel-1340p/qwen35moe-vulkan-mtp/report.md)
- [`benchmarks/intel-1340p/ornith-gemma-optimization/sycl/`](benchmarks/intel-1340p/ornith-gemma-optimization/sycl/)

## SpaceMIT K3 / Milk-V K3

### Backend

The K3 backend adds hardware-specific CPU paths for:

- RVV activation, reduction and compact-quant kernels;
- IME1/IME2 matrix dispatch;
- TCM allocation and staging;
- K3 AI-core affinity;
- load-time Q4_K, Q5_K, Q6_K and Q8_0 weight repacking;
- routed-MoE row handling;
- bounded compact-IQ IME2 tile packing and caching;
- matmul, recurrent, copy and cache profiling.

Build a native release:

```bash
cmake -B build \
  -DCMAKE_BUILD_TYPE=Release \
  -DGGML_CPU_RISCV64_SPACEMIT=ON \
  -DGGML_NATIVE=ON
cmake --build build -j"$(nproc)"
```

Build and backend notes:

- [`docs/build-riscv64-spacemit.md`](docs/build-riscv64-spacemit.md)
- [`docs/spacemit-default-fastpaths-deployment.md`](docs/spacemit-default-fastpaths-deployment.md)
- [`scripts/README-k3-matmul.md`](scripts/README-k3-matmul.md)

### Selected paths

The default SpaceMIT paths include:

- automatic TCM/matmul scheduling;
- Q4_K 32x256 IME2 routing;
- BF16 `per_layer_model_proj.weight` to Q8 conversion;
- Gemma F32 projection to Q8 conversion;
- shape- and name-restricted Gemma attention-cache `matvec8`;
- load-time quantised-weight repacking.

The Qwen service may also enable direct GDN recurrent-state writes with `GGML_CPU_GDN_DIRECT_STATE=1`. This removes the second recurrent-state copy and improved mean generation from 6.887 to 7.235 tok/s across five prompts, a 5.05% gain with matching outputs and draft acceptance.

Gemma's promoted default fast paths measured 6.84 tg128 and 50.90 pp16, about 12% faster in decode and 68% faster in short prompt processing than the original baseline.

### Opt-in and diagnostic controls

| Variable | Purpose | Default |
|---|---|---|
| `GGML_RISCV64_SPACEMIT_MATMUL_TRACE=1` | Trace exact matmul operations and shapes | Off |
| `GGML_RISCV64_SPACEMIT_MATMUL_SCHEDULE=auto\|tcm-a\|tcm-b\|direct` | Select diagnostic scheduling | `auto` |
| `GGML_RISCV64_SPACEMIT_MOE_M4=1` | Enable Q4_K/Q5_K four-row MoE edge path | Off |
| `GGML_RISCV64_SPACEMIT_I8I8_M2=1` | Enable the dense two-row i8 x i8 kernel | Off |
| `GGML_RISCV64_SPACEMIT_IQ_IME2_TILE=1` | Enable compact-IQ IME2 tile packing/cache | Off |
| `GGML_RISCV64_SPACEMIT_IQ_IME2_CACHE_MB=<MiB>` | Bound the shared tile cache | 64 MiB when enabled |
| `GGML_RISCV64_SPACEMIT_IQ_IME2_CACHE_PROFILE=1` | Emit cache and packing telemetry | Off |
| `GGML_CPU_GDN_DIRECT_STATE=1` | Write GDN rollback snapshots directly | Off in the library |
| `GGML_CPU_RECURRENT_PROFILE=1` | Profile recurrent operations | Off |

The compact-IQ path remains opt-in. Its best retained 16K result used a 14 GiB shared cache and reached 3.585 warm generation tok/s, but the memory cost is unsuitable for the default 31 GiB service profile.

### Rejected K3 experiments

The K3 campaign retained only complete-model wins:

- direct matmul scheduling reduced generation from 10.168 to 9.334 tok/s, so automatic scheduling remains selected;
- a dense MTP two-row kernel improved focused cases by 3.1-4.0% but only 0.09% end-to-end;
- fused gated-delta update/dot improved its fixture by 15-17% but regressed end-to-end by 0.6-1.1%;
- SSM Conv4 RVV improved its fixture by 21-29% but regressed service generation by 0.98%;
- persistent compact-IQ repacking expanded weights by 1.89x-3.68x and was rejected as a default;
- protected-expert cache policies caused excessive eviction and regressed the shared global LRU.

Evidence:

- [`benchmarks/k3-matmul-final-report-20260720.md`](benchmarks/k3-matmul-final-report-20260720.md)
- [`benchmarks/qwen-a3b-tunney/final-report-20260720.md`](benchmarks/qwen-a3b-tunney/final-report-20260720.md)
- [`benchmarks/qwen-recurrent-20260721/final-report.md`](benchmarks/qwen-recurrent-20260721/final-report.md)
- [`benchmarks/qwen-parameter-sweep-20260722/final-report.md`](benchmarks/qwen-parameter-sweep-20260722/final-report.md)
- [`benchmarks/qwen-compact-ime2-20260722/report.md`](benchmarks/qwen-compact-ime2-20260722/report.md)
- [`benchmarks/qwen-compact-ime2-soft-cache-20260723/report.md`](benchmarks/qwen-compact-ime2-soft-cache-20260723/report.md)

## Promotion policy

Fork changes are promoted only after the applicable end-to-end gate passes:

- at least 2% for K3 live-kernel and Sigma profile changes;
- deterministic output, tool-call and draft-acceptance checks for MTP changes;
- numerical semantic replay for model-shaped backend graphs;
- a 10% residual token-wall penalty before implementing a separate raw expert cache;
- memory, page-fault, swap, temperature and restart checks before service use.

A faster microbenchmark is recorded but left disabled or reverted when the complete workload regresses.

## Repository map

| Path | Contents |
|---|---|
| [`docs/README.md`](docs/README.md) | Fork documentation index |
| [`benchmarks/intel-1340p/`](benchmarks/intel-1340p/) | Sigma CPU, long-context, MTP, SYCL and Vulkan evidence |
| [`benchmarks/qwen-*`](benchmarks/) | K3 model and kernel campaigns |
| [`tools/config/`](tools/config/) | Tracked service profiles |
| [`tools/systemd/user/`](tools/systemd/user/) | User service units |
| [`scripts/README-k3-matmul.md`](scripts/README-k3-matmul.md) | K3 benchmark harness and interpretation |

General llama.cpp references remain available in this tree:

- [`docs/build.md`](docs/build.md)
- [`tools/server/README.md`](tools/server/README.md)
- [`docs/models.md`](docs/models.md)
- [`docs/function-calling.md`](docs/function-calling.md)

## Upstream and licence

This is a downstream hardware-optimisation fork of [`ggml-org/llama.cpp`](https://github.com/ggml-org/llama.cpp). Fork changes retain the project's [MIT licence](LICENSE).
