# Ornith 1.0 35B and Gemma 4 E4B on Intel Core i5-1340P

The campaign validates 128K CPU runtime profiles for both models. Gemma 4 E4B is the throughput finalist. The existing Qwen3.6 35B-A3B Q2_K_XL service remains the deployed rollback baseline.

Measurements use source commit `603f26c869b6700eaa5c6d52068ed583419eeacf`, the `build-intel-clang` Clang 22.1.8 build, model workers on logical CPUs 0–7 and a 2% repeated end-to-end promotion gate. Raw results and machine-readable decisions are under [`benchmarks/intel-1340p/ornith-gemma-optimization/`](../benchmarks/intel-1340p/ornith-gemma-optimization/).

## Selected profiles

| Model | MTP | KV | Flash Attention | Repeated generation gain | Prompt gain | Wall speedup | Peak PSS change |
|---|---:|---|---|---:|---:|---:|---:|
| Ornith 1.0 35B APEX | 2 | F16 | off | 11.32% | 6.73% | 6.92% | about +148 MiB |
| Gemma 4 E4B | 3 | F16 | off | 7.24% | 13.16% | 12.97% | about +122 MiB |

The controls used Q8_0 KV with Flash Attention enabled. Each balanced gate ran control, candidate, candidate, control. Every repetition produced the same required `search_repository` call and exact draft-acceptance counts:

- Ornith: 42 drafted, 37 accepted;
- Gemma: 39 drafted, 31 accepted.

Evidence:

- [`ornith-kv-flash-gate/summary.json`](../benchmarks/intel-1340p/ornith-gemma-optimization/ornith-kv-flash-gate/summary.json)
- [`gemma-kv-flash-gate/summary.json`](../benchmarks/intel-1340p/ornith-gemma-optimization/gemma-kv-flash-gate/summary.json)
- [`final-decisions.json`](../benchmarks/intel-1340p/ornith-gemma-optimization/final-decisions.json)

F16 KV with Flash Attention still enabled was rejected. It improved prompt throughput and wall time but reduced repeated Gemma generation throughput by 3.38%. F16 KV and Flash Attention off form one profile decision because quantised V-cache cannot run with Flash Attention disabled.

## Model and MTP comparison

The original Q8_0/Flash-on depth sweep selected Ornith depth 2 and Gemma depth 3:

| Model | No-MTP generation | Selected MTP generation | Generation change | Selected acceptance |
|---|---:|---:|---:|---:|
| Ornith | 12.80 tok/s | 15.41 tok/s | +20.34% | 37/42 |
| Gemma 4 | 12.69 tok/s | 22.01 tok/s | +73.40% | 31/39 |

Ornith depth 2 improved generation but increased total wall time by 2.44% on the short 3K agentic request because prompt processing dominated. Gemma depth 3 improved both generation and wall time. Gemma depth 4 was 2.31% slower in generation than depth 3 and was rejected.

The selected F16/Flash-off profiles were also tested at 32K context under an 8 GiB post-load pressure holder:

| Model | Prompt tokens | Prompt | Generation | Wall | Acceptance | Peak temperature |
|---|---:|---:|---:|---:|---:|---:|
| Ornith | 11,288 | 33.50 tok/s | 14.77 tok/s | 341.07 s | 39/40 | 86 °C |
| Gemma 4 | 12,481 | 54.53 tok/s | 17.92 tok/s | 231.46 s | 32/42 | 86 °C |

Both runs returned the expected required tool call. Ornith incurred 7,105 process major faults and about 31 MiB of reads; Gemma incurred 377 process major faults and about 203 MiB of reads. Neither run had material swap-in. All 960 sampled Ornith expert ranges were resident. The raw-slot/LRU prototype was therefore not justified.

Evidence:

- [`promoted-validation/ornith-d2-f16-faoff-ctx32k-p8/`](../benchmarks/intel-1340p/ornith-gemma-optimization/promoted-validation/ornith-d2-f16-faoff-ctx32k-p8/)
- [`promoted-validation/gemma4-d3-f16-faoff-ctx32k-p8/`](../benchmarks/intel-1340p/ornith-gemma-optimization/promoted-validation/gemma4-d3-f16-faoff-ctx32k-p8/)
- [`workloads/agentic-tool-planning-12k.json`](../benchmarks/intel-1340p/ornith-gemma-optimization/workloads/agentic-tool-planning-12k.json)

## Correctness and graph coverage

The CPU backend passed the focused model shapes and native graph support checks:

- 10 Ornith routed Q3_K `MUL_MAT_ID` projection fixtures;
- 40 Gemma target and assistant Q4_0/Q8_0 projection fixtures;
- 150 unique Ornith target plus embedded-NextN prompt/decode operations;
- 141 unique Gemma target plus paired four-block-assistant operations;
- 30 batch-allocation tests and 198 assertions, including odd-row and keep-tail cases;
- recurrent rollback checkpoint restore with replay-logit identity.

The native graph exporter now accepts the existing `--spec-type draft-mtp` and `--model-draft` options. It initialises MTP contexts through `common_speculative_init_from_params()`, the same target/assistant pairing used by the server.

Whole-file numerical replay now generates source-slot-aware, stride-aware semantic inputs for operations such as `GET_ROWS`. Two CPU-reference repetitions passed all 150 Ornith target/MTP operations and all 141 Gemma target/assistant operations. The metadata-only export format remains backward-compatible.

Evidence:

- [`native-graph-fixtures/ornith-target-mtp-support.csv`](../benchmarks/intel-1340p/ornith-gemma-optimization/native-graph-fixtures/ornith-target-mtp-support.csv)
- [`native-graph-fixtures/gemma-target-assistant-mtp-support.csv`](../benchmarks/intel-1340p/ornith-gemma-optimization/native-graph-fixtures/gemma-target-assistant-mtp-support.csv)
- [`validation/semantic-replay/`](../benchmarks/intel-1340p/ornith-gemma-optimization/validation/semantic-replay/)
- [`validation/test-batch-alloc.txt`](../benchmarks/intel-1340p/ornith-gemma-optimization/validation/test-batch-alloc.txt)
- [`validation/test-recurrent-state-rollback.txt`](../benchmarks/intel-1340p/ornith-gemma-optimization/validation/test-recurrent-state-rollback.txt)

Vision smoke tests also completed for both projectors. Their acquisition-time evidence is under `projects/models/smoke-20260731/{ornith-vision,gemma4-vision}`.

## Rejected changes

| Candidate | Decision |
|---|---|
| Routed `MUL_MAT_ID` chunk 32 | Rejected: 1.19% exact-shape geomean, below the 2% gate. The diagnostic patch is archived. |
| Exact-row Vulkan Q2/Q4 | Rejected: no end-to-end win; prototypes were reverted and preserved. |
| SYCL full and partial offload | Rejected: large decode regressions, broader Q1_0/Q2_0 failures, NGL 16 scheduler failure and graph-mode crash. |
| Batch/ubatch and lower quantised KV variants | Rejected: no repeated end-to-end gain above 2%. |
| Bounded/adaptive expert advice | Rejected: Ornith generation changed by −2.19%/−0.86%; advice off is selected. |
| Raw-slot/LRU expert cache | Not implemented: pressure evidence showed resident expert ranges and bounded paging. |
| Quant or scheduling source changes | No candidate cleared the end-to-end gate. |

No inference-kernel or scheduler source change is promoted.

## Candidate launchers

The launcher and profiles are review artefacts. They are not installed or enabled.

- `tools/run-intel-candidate.sh`
- `tools/config/llama-ornith-candidate.env.example`
- `tools/config/llama-gemma4-candidate.env.example`
- `tools/systemd/user/llama-candidate.service`

Dry-run a profile:

```bash
set -a
source tools/config/llama-gemma4-candidate.env.example
set +a
LLAMA_DRY_RUN=1 tools/run-intel-candidate.sh
```

For an explicit user-service trial, copy one profile to `~/.config/llama-candidate/service.env`, copy or link the unit to `~/.config/systemd/user/`, reload the user daemon and start `llama-candidate.service`. Do not run it alongside the Qwen service on this host.

## Rollback and service role

The candidate unit is separate from `llama-qwen-longctx.service`. Stopping and disabling `llama-candidate.service` removes the trial without changing Qwen files or state.

<!-- INTEL_128K_STATUS_BEGIN -->
Near-capacity 128K validation passed for Ornith and Gemma with the selected 1024/256 geometry. Qwen remains the deployed rollback baseline; candidate activation remains an explicit operator decision.

## Verified 128K profile

Near-capacity validation completed with one 131,072-token slot, batch 1024, ubatch 256, F16 KV, Flash Attention off and the model-specific MTP depth.

| Model | Prompt tokens | Prompt | Generation | Elapsed | Draft acceptance | Peak PSS | Peak temperature |
|---|---:|---:|---:|---:|---:|---:|---:|
| Ornith | 124,341 | 13.14 tok/s | 2.63 tok/s | 9490 s | 37/44 | 23857 MiB | 91 °C |
| Gemma 4 | 124,112 | 22.49 tok/s | 4.49 tok/s | 5537 s | 29/42 | 11141 MiB | 90 °C |

Both frozen requests retained output headroom, ended with exactly one schema-valid `search_repository` tool call, used speculative decoding and completed without a thermal-abort marker.
<!-- INTEL_128K_STATUS_END -->

Operational procedures:

- [`intel-1340p-ornith-runbook.md`](intel-1340p-ornith-runbook.md)
- [`intel-1340p-gemma4-runbook.md`](intel-1340p-gemma4-runbook.md)
- [`intel-1340p-qwen-longctx-runbook.md`](intel-1340p-qwen-longctx-runbook.md)

Gemma is the throughput finalist across the repeated short-workload and near-capacity 128K measurements. No candidate service was installed, enabled or started by this campaign.
