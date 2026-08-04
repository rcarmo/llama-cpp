# Completion audit

The Ornith/Gemma campaign and follow-up hardening are complete against the session checklist. Base source commit: `603f26c869b6700eaa5c6d52068ed583419eeacf`; final validation build reports fork commit `4196ec808` plus the current review changes.

| Requirement | Status | Evidence |
|---|---|---|
| Frozen revisions and reproducible text/vision baselines | Passed | `campaign.json`, `baseline/summary.json`, model SHA-256 fields |
| Shared architecture-neutral profiling | Passed | `common/speculative.cpp`, `tools/server/server-context.cpp`, `profile-alias/` |
| Ornith backend, recurrent, attention and NextN fixtures | Passed | routed 10/10; support 150/150; `validation/semantic-replay/` numerical replay 150/150 twice |
| Gemma target/assistant, QAT and MTP fixtures | Passed | target 20/20, assistant 20/20; paired graph support and numerical replay 141/141 twice |
| Semantic-safe native graph replay | Passed | source-slot-aware, stride-aware deterministic generic initializer; model-free CTest and two full repetitions per model |
| MTP checkpoint restore state machine | Passed | forced restores: Ornith 2, Gemma 5; normal restores 0; normalized output identity; `=0` falsey regression |
| No-install candidate validation | Passed | loopback health, 128K slot, deterministic completion, exact MTP acceptance (Ornith 2/2, Gemma 3/3), telemetry and clean shutdown |
| mmap/advice/cache policy gate | Passed | advice off selected for candidates; pressure evidence did not justify raw-slot/LRU |
| Parameter and 128K geometry sweep | Passed | MTP, KV, batch/ubatch, threads, context, cache, load mode, Flash Attention and backend variants exercised; 1024/256 selected for 128K |
| Near-capacity Ornith 128K | Passed | 124,341 prompt tokens, 60 generated, 13.14/2.63 tok/s, 37/44 accepted, 23,857 MiB peak PSS, 91 C peak |
| Near-capacity Gemma 128K | Passed | 124,112 prompt tokens, 44 generated, 22.49/4.49 tok/s, 29/42 accepted, 11,141 MiB peak PSS, 90 C peak |
| Strict output/headroom/config acceptance | Passed | exact context/geometry/profile, frozen request hashes, reserved headroom, exactly one schema-valid `search_repository` call, MTP activity, no thermal marker |
| Independent promotion/revert decisions | Passed | `final-decisions.json`; rejected source/SYCL/Vulkan/advice/chunk candidates remain archived or disabled |
| Service profiles and rollback | Passed | both tracked candidate configs now use 128K/1024/256; Qwen remains deployed rollback baseline; no candidate service installed by campaign |
| Intel SYCL/Vulkan evaluation | Passed | isolated toolchain, device/correctness/model evidence, rejected deployment decision |
| Final regression suite | Passed | `validation/final-hardening/result.txt`, semantic CTest, full native replays twice, batch/tail, recurrent rollback, forced checkpoint, live candidate checks, scripts/units/docs |

Final profile decisions:

- Ornith: MTP depth 2, F16 KV, Flash Attention off, context 131072, batch 1024, ubatch 256, eight threads.
- Gemma: MTP depth 3, separate assistant GGUF, F16 KV, Flash Attention off, context 131072, batch 1024, ubatch 256, eight threads.
- Gemma is the throughput finalist on both repeated short-workload and near-capacity 128K measurements.
- Qwen3.6 Q2_K_XL remains the deployed rollback baseline until an operator explicitly activates a candidate.

No candidate service was installed or enabled by the campaign. Rejected optimization prototypes were not reopened.
