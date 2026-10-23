# Flint throughput on Sigma, 23 October 2026

The best measured CPU configuration achieved **50.43 prompt tok/s and 13.09 decode tok/s** on a 512-token prompt plus 64-token continuation. Against the matched 4-thread control, prompt throughput improved 28.61%, decode throughput improved 4.19%, and measured inference wall time fell 17.12% (18.17 to 15.06 seconds). Larger GPU expert caches improved hit rates but lost throughput.

These are controlled token-replay measurements, not a general quality score or serving qualification. No service was deployed. The measurements predate the combined source integration; [later build and regression verification](../../../benchmarks/intel-1340p/flint-zero-copy-20261023/integration-verification.md) is recorded separately.

The initial [capped coding series](../../../benchmarks/intel-1340p/flint-zero-copy-20261023/coding/README.md) exhausted 1,024 output tokens on all six tasks. The model emitted thoughts despite `enable_thinking=false`. The user rejected that budget; a separate [completion-driven evaluation](../../../benchmarks/intel-1340p/flint-zero-copy-20261023/coding-unlimited/README.md) now runs without output-token or generation-time caps. Its final results are not established.

## Best measured configuration

| Setting | Value |
|---|---|
| Model | Unsloth Flint UD-Q3_K_XL, unchanged quantisation |
| Execution | CPU; routed experts remain CPU mmap-backed |
| CPU allowance | 16 logical CPUs |
| Prompt workers | 16 threads, explicit affinity mask 0-15 |
| Decode workers | 4 threads, strictly pinned to physical P-core lanes 0,2,4,6 |
| Batch / microbatch | 512 / 512 |
| Context | 2048, one sequence |
| KV / attention | F16 K/V, Flash Attention off |
| Loading | Explicit MMAP, no_host=true, CPU SIMD repacking retained |
| GPU expert cache | Off for the throughput winner |
| Attached pools | Separate batch/decode pools, poll=50 |
| Memory / swap | 20 GiB cgroup cap, zero container swap allowance |

Sigma has 12 physical cores (4 P plus 8 E), 16 logical CPUs, an Intel i5-1340P and Iris Xe device 8086:a7a0. Increasing to 16 logical CPUs is not a claim of 16 physical cores.

## Counterbalanced confirmation

Independent process order was A-B-B-A. A used 4 prompt/decode threads, microbatch128 and no attached pool. B used the configuration above. Both received the same 16-CPU allowance, fixed prompt/tail tokens, model, build, precision and context. Each process performed a short warm-up before measurement. Model loading is excluded from these timings.

| Run | Prompt tok/s | Decode tok/s | Inference wall seconds |
|---|---:|---:|---:|
| A1 | 39.329 | 12.590 | 18.117 |
| B1 | 50.377 | 13.000 | 15.101 |
| B2 | 50.483 | 13.171 | 15.016 |
| A2 | 39.092 | 12.530 | 18.220 |
| A median | 39.211 | 12.560 | 18.168 |
| B median | 50.430 | 13.085 | 15.059 |

A separate 1024-prompt/64-continuation check measured A at 37.282/11.797 tok/s and B at 47.707/12.197 tok/s, with inference wall times 32.906/26.726 seconds. This longer check has one observation per configuration.

## Core scaling

Each screen used two repetitions, matching thread count and actual cgroup CPU quota, microbatch128, FA off, no affinity mask or attached pool. All CPU quotas were verified from cpu.max; cpu.stat showed no quota throttling.

| Threads / CPU allowance | Prompt tok/s median | Decode tok/s median |
|---|---:|---:|
| 4, fresh control | 38.985 | 11.861 |
| 6 | 31.375 | 10.029 |
| 8 | 34.192 | 10.044 |
| 12 | 36.894 | 10.253 |
| 16 | 41.669 | 10.035 |

An earlier 4-thread screen measured 39.047/12.436 tok/s. Decode benefited more from keeping four workers on the P-cores than from increasing thread count. Four E-core workers measured 15.383/5.705 tok/s. Four P-core workers measured 38.067/13.031 tok/s. The two-pool finalist combines broad prompt parallelism with P-core decode affinity.

At 16 prompt/4 decode threads without attached pools, microbatches64/128/256/512 measured prompt medians37.233/41.646/47.556/50.603 tok/s and decode12.462/12.296/12.361/12.395 tok/s. FA on and a generic attached pool did not improve the original 4-thread decode screen.

## GPU selected-expert cache

All GPU screens used 4 prompt/decode threads, microbatch128, F16 KV, FA off, 512 prompt tokens, 64 replay continuation tokens and two repetitions. Dense tensors and KV use Vulkan. Original routed-expert tensors remain on CPU; selected expert banks are cached on GPU. No GPU layer-count sweep was performed.

| Expert-cache budget | Prompt tok/s median | Decode tok/s median | Final small-batch hit rate | Uploaded MiB, cumulative |
|---|---:|---:|---:|---:|
| Off | 15.521 | 5.286 | n/a | n/a |
| 128 MiB | 15.413 | 1.608 | 0.00% | 45183.52 |
| 256 MiB | 15.387 | 1.612 | 0.00% | 46750.24 |
| 512 MiB | 15.265 | 1.738 | 11.14% | 42629.72 |
| 1 GiB | 14.998 | 2.126 | 25.72% | 35638.23 |
| 2 GiB | 14.349 | 2.369 | 42.04% | 27782.18 |
| 4 GiB | 13.842 | 3.013 | 60.20% | 19075.03 |

Counters cover warm-up and both repetitions; they are traffic, not resident memory. Large prompt batches bypass dynamic cache updates and can copy cached experts back through the scheduler. At4GiB the cache also reported49347 such expert copies,21488.49MiB. More hits reduced uploads but did not offset transfer/scheduling costs on this integrated GPU.

Compatible layout groups share banks across layers. For groups containing1/9/21/15 layers, reported slots were16/152/357/255 at1GiB,33/306/716/511 at2GiB and67/613/1433/1023 at4GiB. One incompatible expert layout is not cached by this implementation. Native allocation includes spare slots; the configured budget is not an exact resident-memory measurement.

The best GPU arm was cache off, still much slower than CPU for this short-context workload. Tests above4GiB, larger GPU thread counts, async scheduler overlap, profiled static expert packs, quantised KV, longer contexts and other prompts were not measured. No global-optimum claim is established.

## Correctness, resources and failures

- Final targeted build and6/6 CTests passed: general/Gemma/Qwen/MTP context handoff, synthetic Flint and Vulkan shared-buffer views.
- Final Vulkan16MiB-cache synthetic test passed600 exact all-vocabulary CPU continuation comparisons against a copied-state reference after source-owner destruction. It shared1572864 bytes and copied0.
- Final trained4GiB-cache handoff shared205520896 bytes and copied0. The source model/context were destroyed before3 exact finite all-vocabulary CPU continuation comparisons. Exit0, OOMfalse. Earlier uncached and256MiB trained handoffs passed too.
- All54 included trained timing observations have finite logits, successful exit receipts and no cgroup OOM/swap. Repeated observations have stable within-configuration hashes. Microbatch/attention/backend changes can change logits and argmax hashes. No bit-equivalence claim across configurations or quality non-inferiority claim is made.
- Completed throughput observations maintained at least19.126GiB monitored host available memory, above the6GiB reserve. Largest incremental cgroup peak was6.523GiB in the4GiB GPU-cache screen. File-backed model pages already charged elsewhere are excluded from these incremental peaks: the17.225GiB GGUF backing remains real. RSS can count both mappings; neither RSS nor the0.45GiB CPU charge is unique whole-model residency.
- The final trained4GiB handoff peaked at7241117696 charged bytes with zero memory events and swap. The20GiB cap was unchanged. Existing unrelated host swap usage was not cleared or attributed to trials. Manual package-temperature samples ranged roughly53-81C; temperatures were not continuously recorded, so no thermal maximum is qualified.
- A bounded native chat run generated384 tokens in28.864 seconds (~13.30tok/s), but reached its output limit during reasoning and ended with an incomplete function. It has no completed executable code answer or semantic pass. Throughput and handoff success do not qualify model quality.

Retained failures and exclusions:

1. AUTO loading on Vulkan disabled mmap; pinned Vulkan-host allocations duplicated expert storage and caused OOM. no_host alone still allowed AUTO to disable mmap, and a later retry hit the host-reserve guard. Explicit MMAP plus no_host fixed the tested allocation path. Limits were never raised.
2. Dynamic MoE caching exposed a null static-pack pointer: the graph guard checked moe_cache before dereferencing expert_cache. The isolated correction checks expert_cache. Synthetic cache and trained cache tests exercise the repaired path; static pack performance was not requalified.
3. The first Podman P-core cpuset attempt failed before inference because the controller was unavailable. taskset and native threadpool masks replaced it.
4. An early two-pool attempt let batch workers inherit narrowed decode affinity and slowed its second prompt run. It is excluded from selection. Explicit batch mask0-15 restores repeat performance; native decode workers were observed on CPUs0/2/4/6.
5. An edit to a live shell supervisor caused a post-exit parse error for GPU128. The native process had completed successfully; its exit0/OOMfalse receipt was recovered and the exited container removed. Later supervisors use separate script copies. No duplicate GPU128 inference was used to replace this evidence.
6. Synthetic smoke measurements are excluded from trained throughput. Initial missing-header and target-name build failures are retained separately.

## Identity and reproduction

Base commit:be952865461273480faafcc98e2b6f526724bee3, isolated branch implement/flint-zero-copy. Model revision:Unsloth20468edfc38ab43d6914cc88b08cbecb05d0fc62. File18494977472 bytes, SHA25691b8d85ab6ff7fb095d9a972f9afa6f3fa2b9acb642867a079f3e013ea3c350c. Fedora44 container, GNU C++16.1.1, Release-O3/native CPU plus Vulkan; CUDA off. Running binaries were rehashed after each harness change. At measurement time the test harness was untracked, so the retained source patch alone omits it; the evidence archive includes that harness separately. The runtime and updated harness are now committed. Use the retained per-run binary hashes for the original measurements, not the later integrated build.

The working run is `tmp/llama-cpp/runs/flint-trial-20261023-be9528654612`; build is `tmp/llama-cpp/build/source-1309921403/flint-vulkan`. All agent-controlled scratch/build/cache state stays under workspace/tmp/llama-cpp. Build containers use networknone,2CPUs/4GiB and Make targets.

Reproduce the selected replay benchmark from the workspace, choosing a new label:

```sh
run="$PWD/tmp/llama-cpp/runs/flint-trial-20261023-be9528654612"
FLINT_CPUS=16 FLINT_THREADS=4 FLINT_BATCH_THREADS=16 \
FLINT_UBATCH=512 FLINT_POOL=2 FLINT_PROMPT=512 FLINT_DECODE=64 FLINT_REPS=2 \
bash "$run/run-tuned-trial.sh" new-confirmation cpu 0 bench \
  "$PWD/projects/models/flint/flint-UD-Q3_K_XL.gguf"
```

This invokes the experimental harness, not a deployed server profile. Cache tests use gpu mode and cache budget inMiB. No production installation was created.

Evidence archive contains per-run logs, monitors, cgroup/exit receipts, source patch, harness, scripts and binary/model hashes. CSV/JSON retain individual observations and exclusion reasons. Final drain found no Flint containers/processes, model listeners or DRM clients; unrelated infrastructure was untouched. All14 removed model-service/socket units remain not-found/inactive. The [prior-feature reuse checklist](../../../benchmarks/intel-1340p/flint-zero-copy-20261023/plan.md), [individual observations](../../../benchmarks/intel-1340p/flint-zero-copy-20261023/throughput-results.csv) and [original evidence archive](../../../benchmarks/intel-1340p/flint-zero-copy-20261023/flint-throughput-evidence.tar.gz) are checked in. The archive retains the original report and its dated source status.
