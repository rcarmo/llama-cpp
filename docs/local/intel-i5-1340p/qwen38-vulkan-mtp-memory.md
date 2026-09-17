# Qwen3.8 embedded-MTP microbatch cap on Intel Iris Xe

Commit `5f209cac0` caps the embedded MTP draft context at `n_ubatch=64` while the target context remains at batch/uBatch 256. On `sigma`, this reduced draft compute workspace from about 253 MiB to 63.2837 MiB and reduced peak memory in a matched production-server request by 54.59 MiB. The change was committed and pushed on 15 September 2026. The Qwen Vulkan/MTP service trial was rejected and removed after live interactive testing.

## Implementation scope

The common runtime path now uses `COMMON_SPECULATIVE_MTP_UBATCH_MAX=64` in two places:

- `common/common.cpp` applies the cap when fitting the embedded MTP context to available memory.
- `common/speculative.cpp` applies the same cap when constructing that context.

`tests/test-export-graph-ops.cpp` checks that the initialized draft context uses `min(target_n_ubatch, 64)`. Direct low-level context construction remains caller-controlled. The change does not alter target batching, model selection, prompts, routing, backend defaults, Flash Attention defaults or Vulkan kernels.

## Test system and workload

- Host: LattePanda Sigma, Intel Core i5-1340P, 16 logical CPUs, 31.1 GiB RAM.
- GPU: Intel Iris Xe Graphics (Raptor Lake-P), Mesa Vulkan driver, unified memory.
- Clean comparison source: `bb04014499b7b434114ba1ae6be5c20e280f4aa2`.
- Production implementation: `5f209cac0db58f6b405bc2fc10239953d7a15109`.
- Model: `Qwen3.8-27B-GSQ-RCO-IQ2_S-mtp.gguf`, 9,607,981,120 bytes, SHA256 `e6406238a5cc0043775cd1963b6f9e5b8707400276e38d9fde742304906b1330`.
- Build: Clang Release; separate CPU-only and Vulkan builds.
- Runtime: one sequence, target batch/uBatch 256, MTP batch 256, MTP uBatch 64, Flash Attention enabled in the fixed-work qualifier, one output row, eight CPU threads and 256-token chunks.
- Workloads: 256, 1,024 and 2,048 synthetic prefill tokens, followed by one continuation token.
- Samples: three CPU and three Vulkan runs per prompt size, 18 runs total. Execution order changed between repetitions. Runs used fresh bounded containers and no swap.

Model files remained in the host page cache between runs; the scripts did not call `drop_caches`. Model loading is excluded from the reported prefill rates. Thermal telemetry was not recorded.

## CPU and Vulkan results

Resident memory is process proportional set size (PSS) plus DRM resident system memory at the `prefill_done` checkpoint. Values are medians of three runs.

| Prompt tokens | True CPU target | Vulkan target | Vulkan change | CPU resident | Vulkan resident | Resident change |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 256 | 10.278 tok/s | 11.476 tok/s | +11.66% | 10,748,192,768 B | 10,691,837,952 B | -53.74 MiB (-0.52%) |
| 1,024 | 10.219 tok/s | 12.436 tok/s | +21.69% | 10,803,563,520 B | 10,781,917,184 B | -20.64 MiB (-0.20%) |
| 2,048 | 10.106 tok/s | 12.597 tok/s | +24.65% | 10,875,772,928 B | 10,902,012,928 B | +25.02 MiB (+0.24%) |

Full target-plus-MTP throughput improved by 14.10%, 24.21% and 27.16%. The capped Vulkan profile was faster than CPU at every tested size. Its measured steady-state residency stayed within 0.53% of CPU and was lower at 256 and 1,024 tokens.

All 18 runs produced finite logits at the expected target and MTP positions. They copied no handoff payload because these arms did not perform a handoff. CPU logits were repeatable within each size. Vulkan logits hashes varied between repetitions, and the 256-token and 2,048-token top token also varied. These results qualify finite execution and position accounting, not numerical parity or output quality.

## Production constructor and server checks

Seven focused handoff/context tests passed. The exact common-constructor graph export produced 226 unique operations and measured a 63.2837 MiB embedded-MTP compute buffer.

A clean server built from `bb0401449` and the candidate server used identical arguments and request JSON. Both returned `" Lisbon, a city with a rich history"` with 5 evaluated, 8 predicted, 6 drafted and 4 accepted tokens.

| Server | Cgroup peak | Swap peak | OOM / OOM kill | Prompt time | Prediction time |
| --- | ---: | ---: | ---: | ---: | ---: |
| Clean | 10,965,843,968 B | 0 | 0 / 0 | 4,389.912 ms | 8,523.083 ms |
| Capped MTP | 10,908,606,464 B | 0 | 0 / 0 | 4,351.543 ms | 8,516.819 ms |

The candidate reduced peak cgroup memory by 57,237,504 bytes (54.59 MiB, 0.52%). This one short request checks the production constructor and request path. The 18-run fixed-work matrix supplies the throughput measurements.

## Full handoff overlap

A separate 1K Vulkan-to-CPU handoff reached a cgroup peak of exactly 24,696,061,952 bytes (23.00 GiB). It completed with finite logits, target/MTP positions 1024/1024, `shared_bytes=774414336`, `copied_bytes=0`, zero swap and zero OOM kills.

That peak includes simultaneous source and destination model/context residency before source release. The MTP microbatch cap reduces draft compute workspace; it does not remove full-handoff overlap.

## Evidence and operational status

The [benchmark campaign](../../../benchmarks/intel-1340p/qwen38-vulkan-mtp-memory-20260915/README.md) contains the 18 structured results, aggregate CSV, resource checks, exact handoff result, server responses, cgroup records, focused test log, constructor log and reproduction source.

`transcribe-web.service` stayed inactive during exclusive GPU tests. Qualification ended with no containers, server processes, listening test ports or GPU users.

## Rejected interactive service trial

A 32K test service was built from `5f209cac0` with 70 embedded llama.cpp UI assets and exposed on LAN port 8094. It used full Iris Xe offload, one slot, q4_0 KV, target batch/uBatch 256 and active embedded MTP depth 3.

The deployment passed health, UI, allocation and trivial-completion checks, but failed the interactive acceptance test. Live decode measured 0.81 tok/s, and the tablet session produced incoherent output. The earlier fixed-work matrix measured prefill only; finite logits and expected positions did not qualify chat quality. The prior Sigma Qwen3.8 campaign had already rejected this model family for primary service use at 2.33-3.47 generation tok/s and 2/4 Pi tasks.

CPU-only target-only diagnosis improved decode to 2.30 tok/s and produced a coherent factual answer. Two short requests exhausted their output budgets in hidden reasoning before final content. This profile was still too slow to replace the accepted Sigma provider.

The Qwen test unit was stopped and disabled. Its installed profile, versioned UI runtime, container and unit file were removed; port 8094 closed and the render device had no owner. The MTP microbatch cap remains a valid allocation optimisation, but this Qwen model/backend combination is not an interactive Sigma service.

The selected Gemma 4 E4B zero-copy service now supplies the LAN UI and API on port 11434. See the [Gemma provider runbook](gemma-local-provider-runbook.md).
