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
| LattePanda Sigma | Ornith 1.5 35B-A3B Q4_K_M, 128K | Sole enabled local provider | 18.07 prompt tok/s and 6.80 generation tok/s at 32K with Q8 KV |
| LattePanda Sigma | Qwen3.6 35B-A3B Q2_K_XL, 128K | Validated; service disabled | 99,104-token request; only matched repository-retrieval pass |
| LattePanda Sigma | Qwen 3.8 27B Q4_K_M, 8K | Manual compatibility and vision only; service disabled | 3.47 generation tok/s with MTP; 4/6 API and 2/4 Pi |
| LattePanda Sigma | Ornith 1.0 35B, 128K | Historical validation | 124,341-token prompt completed |
| LattePanda Sigma | Gemma 4 E4B, 128K | Validated; service disabled | Best overall matched quality; 25.77 generation tok/s |
| LattePanda Sigma | Maple Preview exact TQ2/F32, 128K | Validated; service disabled | 76.03 / 71.79 / 56.91 prompt tok/s at 512 / 4K / 32K |
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

### RTX 3060 agentic service

The separate RTX 3060 host runs Qwen3.6 35B-A3B native MTP with the
[agentic profile](docs/qwen36-agentic-tuning.md). Deployment files live in
[tools/pi](tools/pi/README.md). The [generalised async scheduler](docs/general-async-cpu.md)
is opt-in; matched Qwen tests did not justify enabling it. The
[CUDA graph allocation fix](docs/cuda-graph-allocation-recovery.md) recovers
pre-launch executable allocation failures without replaying launched kernels.
These results do not change the Sigma or SpaceMIT selections above.

## Build the selected CPU backend

```bash
BUILD_JOBS=2 tools/build-intel-1340p.sh
```

The build helper uses an isolated Fedora container and produces a Clang 22 native x86 build with AVX-VNNI, OpenMP, the CPU backend and the embedded Web UI. Vulkan is disabled in this build.

Key entrypoints:

- `tools/build-intel-1340p.sh` - selected CPU build;
- `tools/run-intel-qwen-longctx.sh` - Qwen 128K service;
- `tools/run-intel-qwen38.sh` - manual Qwen 3.8 target, MTP and vision profile;
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

### Ornith 1.5 local Pi provider

The deployed Sigma profile exposes `local-ornith/ornith-1.5-35b-a3b-q4-k-m` on loopback at `127.0.0.1:8095`.

| Setting | Value |
|---|---|
| Context per request | 131,072 tokens |
| Slots | 1 |
| Threads | 12 on CPU range `0-15` |
| Batch / ubatch | 1,024 / 256 |
| MTP | Disabled after measured regressions |
| KV | Q8_0 with Flash Attention enabled |
| Prompt cache | Enabled; no idle-slot RAM cache |
| Reuse/checkpoints | No cross-request reuse; 32 checkpoints, 8,192-token minimum spacing |

The exact 32K profile processed prompts at 18.07 tok/s and generated at 6.80 tok/s. It peaked at 91 C under the 95 C tuning gate. Built-in Q8 MTP depth 1 reduced the matched 32K rates to 12.62 and 3.95 tok/s and used 7.54 GiB of process swap, so the service runs target-only.

```bash
systemctl --user status llama-ornith-local-provider.service
curl -fsS http://127.0.0.1:8095/health
pi --provider local-ornith --model ornith-1.5-35b-a3b-q4-k-m
```

The Gemma, Maple, Qwen3.6 and Qwen 3.8 services are disabled. Their weight files remain available for rollback.

Installation, Pi registration, diagnostics, measurements and rollback:

- [`docs/ornith-1.5-local-provider-runbook.md`](docs/ornith-1.5-local-provider-runbook.md)
- [`docs/gemma-local-provider-runbook.md`](docs/gemma-local-provider-runbook.md)
- [`docs/gemma-local-provider-benchmark-2026-08-02.md`](docs/gemma-local-provider-benchmark-2026-08-02.md)

### Maple, Gemma and Qwen role comparison

The 5-6 August 2026 campaign used exact per-tokenizer 512, 4,096 and 32,768-token prompts, a 512-token prompt with 64 generated tokens, identical bounded API cases and identical real Pi tasks. The 18 August Qwen 3.8 follow-up retained those prompt sizes and test corpora. Each model ran alone on eight P-core threads with its accepted profile.

| Model | Prompt 512 | Prompt 4K | Prompt 32K | Generation | Bounded API | Real Pi | Role |
|---|---:|---:|---:|---:|---:|---:|---|
| Maple exact TQ2/F32 | **76.03** | **71.79** | **56.91** | 18.77 | 4/6 | 3/4 | Fast prompt ingestion |
| Gemma 4 E4B | 65.24 | 60.96 | 44.32 | **25.77** | 4/6 | 3/4 | Primary local model |
| Qwen3.6 35B-A3B Q2 | 31.89 | 26.87 | 10.95 | 11.40 | 3/6 | **4/4** | Repository-grounded fallback |
| Qwen 3.8 target | 6.88 | 6.34 | 3.21 | 2.33 | not run | not run | Target-only measurement |
| Qwen 3.8 MTP-3 | 6.76 | 6.18 | not run | 3.47 | 4/6 | 2/4 | Manual compatibility and vision only |

The blind substantive review of Maple, Gemma and Qwen3.6 ranked Gemma first, Qwen3.6 second and Maple third. Qwen3.6 alone found the requested source path and function. Gemma alone obeyed the requested tool-result limit. Maple and Gemma each failed one repository-retrieval task, while all three passed constrained edits, independent tests, exact replies and cancellation recovery.

Qwen 3.8 MTP accepted 42 of 63 draft tokens and improved generation by 48.7% over its target-only profile. The matched 4K MTP probe peaked at 28.97 GiB PSS and 2.73 GiB process swap. Its target-only exact 32K prompt took 2 hours 50 minutes 12 seconds. The disabled service on `127.0.0.1:8094` is suitable only for manual compatibility or vision checks.

These role assignments record the 5-6 August comparison. The 20 August Ornith 1.5 deployment superseded them: Ornith is the sole enabled local provider, while the Maple, Gemma and Qwen services are disabled with their weights preserved.

Full reports, raw responses, telemetry, identities and validators:

- [`benchmarks/intel-1340p/maple-qwen-campaign/report.md`](benchmarks/intel-1340p/maple-qwen-campaign/report.md)
- [`benchmarks/intel-1340p/maple-qwen-campaign/README.md`](benchmarks/intel-1340p/maple-qwen-campaign/README.md)
- [`benchmarks/intel-1340p/qwen38-campaign/report.md`](benchmarks/intel-1340p/qwen38-campaign/report.md)
- [`benchmarks/intel-1340p/qwen38-campaign/README.md`](benchmarks/intel-1340p/qwen38-campaign/README.md)

### 18-19 August 2026 upstream adoption gates

The latest adoption campaign tested selected upstream changes in isolated worktrees before commit `abdbeadf`. Correctness took precedence over local throughput. The retained small patch produced byte-identical fixed-prompt token IDs and first-token logits for Gemma, Qwen3.6, Qwen 3.8 and Maple.

| Gate | Profile | Measured result | Decision |
|---|---|---|---|
| mmap quantisation eviction | Qwen3.6 22.85 GB input to 13.25 GB Q2_K | mmap wall time fell from 496.584 to 390.551 seconds and peak PSS from 24,875,134 to 4,562,491 KiB, an 81.66% PSS reduction; output remained byte-identical | Selected |
| Non-mmap control | Same source and output | Wall time changed by +0.15% and peak PSS by +52 KiB; no swap | No regression |
| CPU F16 V-cache conversion | 4,096-token prompt, 64 generated tokens, eight P-core threads | Mean end-to-end time improved by 0.40%, median by 0.48%, and generation throughput fell by 1.54%; output remained byte-identical | Rejected below the 2% gate |
| Full-integration CPU | Release CPU suite | 64/64 tests passed in 44.70 seconds | Passed, but insufficient to promote the full integration |
| Full-integration Vulkan | Normal runtime and result checker | Normal runtime passed 64/64 in 1,167.46 seconds; the checker failed 7/9 focused tests | Rejected for correctness |
| Maple TQ2_0 Vulkan | Exact-head model, F32 K/V, Flash Attention off | Routed `MUL_MAT_ID` lost the device at `n=16` and `n=32`; sequential aggregate NRMSE was `5.334015e-6` and maximum KL was `1.152624e-10` | Rejected for correctness |
| Full-integration long-context deployment | Integration-branch Gemma 128K and shorter Qwen3.6 MTP fixtures | The 95 C gate stopped Gemma at 24,681 processed prompt tokens and the Qwen3.6 MTP fixture at 1,353 | Incomplete; full integration not promoted and deployed roles unchanged |

Maple's sequential Vulkan run retained top-1 agreement for 15/15 tokens and mean top-32 overlap of 32/32, but only 3/15 tokens met the NRMSE limit. Ranking agreement did not override the `< 1e-6` NRMSE and `< 2e-11` KL requirements.

SYCL Q1_0 `MUL_MAT` errors reached `0.417105617` and `1.365789949` against a `0.000500000` limit. Graph mode repeated the corruption, and the graph-mode Q2_0 run did not complete. SpaceMIT Q5_0 dispatch was not adopted because no Q5_0 K3 fixture was available.

After the later small-patch merge, the selected CPU build reported `b10579-abdbeadfb`, rebuilt all 330 targets and passed 59/59 main-branch tests. Model roles and ports did not change during that campaign. The separate 20 August Ornith 1.5 deployment replaced the enabled local provider.

### Iris Xe: measured and rejected

Iris Xe remains a validation target, not the deployed inference backend.

The July Vulkan campaign passed 1,544/1,544 focused `MUL_MAT_ID`, `RMS_NORM`, `ROPE` and `SOFT_MAX` cases. Full Q2 offload generated 9.90 tok/s versus 14.90 tok/s on CPU; a Q4 10-layer split generated 7.62 tok/s versus 13.17 tok/s on CPU. The August result-checker failures and Maple device loss above prevent promotion of the newer upstream Vulkan paths.

The earlier SYCL campaign discovered the Level Zero device and passed its focused model-shaped operations, but broad quant support, decode throughput and graph stability were insufficient. Full and partial offload regressed generation, and the tested Gemma graph split failed. The August Q1_0 failures above keep SYCL blocked.

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
