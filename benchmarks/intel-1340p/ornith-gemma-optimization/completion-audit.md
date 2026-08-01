# Completion audit

The campaign is complete against the session checklist. Source commit: `603f26c869b6700eaa5c6d52068ed583419eeacf`.

| Requirement | Status | Evidence |
|---|---|---|
| Frozen revisions and reproducible text/vision baselines | Passed | `campaign.json`, `baseline/summary.json`, model SHA-256 fields, `projects/models/smoke-20260731/{ornith-vision,gemma4-vision}` |
| Shared architecture-neutral profiling | Passed | `common/speculative.cpp`, `tools/server/server-context.cpp`, `profile-alias/`, `validation/final/profile-alias.txt` |
| Ornith backend, graph, recurrent, attention and NextN fixtures | Passed | `validation/final/ornith-routed.csv` 10/10; `ornith-target-mtp-support.csv` 150/150 |
| Ornith profiling and measured prototypes | Passed | `graph-profile/`, `kernel-perf/`, `thread-scaling/`, `parameter-sweep/`, `expert-advice/`, `controlled-pressure/`, `chunk-size-diagnostic/` |
| Gemma target/assistant, QAT, MTP-4 and rollback fixtures | Passed | target 20/20, assistant 20/20, paired graph 141/141, `baseline/gemma4-d4/`, rollback/logit and batch-tail logs |
| Gemma target/assistant profiling | Passed | `graph-profile/gemma4-d3/`, `gemma-kv-flash-gate/`, projector smoke evidence |
| mmap/advice/cache policy gate | Passed | advice off selected; `controlled-pressure/`; all sampled Ornith expert ranges resident; no raw-slot/LRU prototype justified |
| Parameter sweeps | Passed | MTP depths, KV, batch/ubatch, threads, context, prompt cache, load mode, Flash Attention, text and vision all exercised |
| Correctness, context, device, pressure and thermal validation | Passed | `validation/final/`, `context-32k/`, `promoted-validation/`, `sycl/correctness/`; 32K runs reached 86 °C and completed |
| Independent promotion/revert decisions | Passed | `final-decisions.json`; repeated balanced gates; rejected patch and SYCL logs preserved |
| Service profiles and rollback | Passed | `docs/intel-1340p-ornith-gemma-campaign.md`, generic candidate launcher, two configs, inactive unit; Qwen 128K profile retained |
| Local review changes | Passed | `review/` contains four clean-index-validating patches, SHA-256 manifests, evidence inventories and exclusions |
| Intel SYCL toolchain and backend evaluation | Passed | isolated build scripts, device/correctness output, model sweeps, compressed debug logs and original-hash manifest |

Final profile decisions:

- Ornith: MTP depth 2, F16 KV, Flash Attention off; repeated generation +11.32%, prompt +6.73%, wall +6.92%.
- Gemma: MTP depth 3, F16 KV, Flash Attention off; repeated generation +7.24%, prompt +13.16%, wall +12.97%.
- Gemma is the 32K throughput finalist.
- Qwen3.6 Q2_K_XL remains the 128K operational default.

No service was installed, enabled or started. Source, tooling, profile and evidence changes were subsequently committed and pushed at the user's request after this audit.
