# Intel Core i5-1340P benchmark index

This directory is the raw evidence spine for the `sigma` work. It covers the July Qwen CPU/Vulkan campaign, the August Maple and Ornith/Gemma studies, the September Gemma optimisation series and the later Intel Xe handoff work.

## Start here

* [July Qwen campaign](final-report-20260731.md)
* [Maple Preview evidence](maple-preview/README.md)
* [Maple, Gemma and Qwen campaign](maple-qwen-campaign/README.md)
* [Qwen 3.8 27B Sigma campaign](qwen38-campaign/README.md)
* [Qwen3.8 vs Qwen3.6 Dynamic comparison](qwen38-qwen36-dynamic-20260903/README.md)
* [Ornith/Gemma optimisation audit](ornith-gemma-optimization/completion-audit.md)

## 2026-07-31 and earlier CPU/Vulkan work

* [final/](final/)
* [cpu-vulkan-interleaving-report-20260731.md](cpu-vulkan-interleaving-report-20260731.md)
* [cpu-vulkan-handoff/](cpu-vulkan-handoff/)
* [hybrid-sweeps/](hybrid-sweeps/), [microbatch/](microbatch/), [mtp-models/](mtp-models/), [mtp-q4/](mtp-q4/), [profiles/](profiles/), [request-overlap/](request-overlap/), [smoke/](smoke/), [sweeps/](sweeps/), [ubatch-isolation/](ubatch-isolation/), [vnni-kquant-ab/](vnni-kquant-ab/)

## 2026-08 Maple and Ornith/Gemma

* [Gemma and Ornith agentic comparison, 22 August 2026](gemma-ornith-agentic-20260822/) -- matched direct API and real Pi tasks with latency, memory, swap, thermal and blind-review evidence.
* [ornith-gemma-optimization/](ornith-gemma-optimization/)
* [maple-preview/](maple-preview/)
* [maple-qwen-campaign/](maple-qwen-campaign/)
* [qwen-longctx-fieldfare/](qwen-longctx-fieldfare/)
* [qwen35moe-vulkan-mtp/](qwen35moe-vulkan-mtp/)
* [qwen35moe-overlap/](qwen35moe-overlap/)

## 2026-09-10 and 2026-09-11 Gemma series

These directories freeze the file-mediated CPU/GPU service and decoder deployments as observed on 10-11 September. Their present-tense deployment statements are historical snapshots. The [15 September zero-copy service record](gemma-zero-copy-service-20260915/README.md) supersedes their operating state and rollback targets. The current [generation inheritance contract](../../docs/local/intel-i5-1340p/gemma-local-provider-runbook.md#generation-inheritance-contract) consolidates the accepted settings, exclusions and matched retest order from the complete indexed campaign set; use it before replacing or tuning the zero-copy service.

* [gemma-hybrid-perf-20260910/](gemma-hybrid-perf-20260910/)
* [gemma-context-coding-20260910/](gemma-context-coding-20260910/)
* [gemma-cpu-fa-20260910/](gemma-cpu-fa-20260910/)
* [gemma-decode-coding-20260910/](gemma-decode-coding-20260910/)
* [gemma-decode-draftthreads-20260910/](gemma-decode-draftthreads-20260910/)
* [gemma-decode-f16pair-20260910/](gemma-decode-f16pair-20260910/)
* [gemma-decode-profile-20260910/](gemma-decode-profile-20260910/)
* [gemma-decode-shapes-20260910/](gemma-decode-shapes-20260910/)
* [gemma-decode-smallbatch-20260910/](gemma-decode-smallbatch-20260910/)
* [gemma-f32-batch-20260910/](gemma-f32-batch-20260910/)
* [gemma-gpu-attention-20260910/](gemma-gpu-attention-20260910/)
* [gemma-long-coding-20260910/](gemma-long-coding-20260910/)
* [gemma-production-acceleration-20260910/](gemma-production-acceleration-20260910/)
* [gemma-b1-release-20260911/](gemma-b1-release-20260911/)
* [gemma-decode-attn4-20260911/](gemma-decode-attn4-20260911/)
* [gemma-decode-score3-20260911/](gemma-decode-score3-20260911/)
* [gemma-decode-value3-20260911/](gemma-decode-value3-20260911/)
* [gemma-decode-value3-nounroll-20260911/](gemma-decode-value3-nounroll-20260911/)
* [gemma-gpu-scorelarge-20260911/](gemma-gpu-scorelarge-20260911/)
* [gemma-integration-b0-20260911/](gemma-integration-b0-20260911/)
* [gemma-optimization-plan-20260911/](gemma-optimization-plan-20260911/)
* [gemma-optimization-t01-d01-20260911/](gemma-optimization-t01-d01-20260911/)
* [gemma-optimization-t02-20260911/](gemma-optimization-t02-20260911/)
* [gemma-prefill-crossover-20260911/](gemma-prefill-crossover-20260911/)
* [gemma-query-reuse-20260911/](gemma-query-reuse-20260911/)
* [gemma-score-inline-20260911/](gemma-score-inline-20260911/)
* [gemma-score-registers-20260911/](gemma-score-registers-20260911/)
* [gemma-score-static-20260911/](gemma-score-static-20260911/)
* [gemma-score3-rollout-20260911/](gemma-score3-rollout-20260911/)
* [gemma-simd-followup-20260911/](gemma-simd-followup-20260911/)

## 2026-09-13 and 2026-09-14 Intel Xe series

* [xe-hotspots-agentic-20260913/](xe-hotspots-agentic-20260913/)
* [xe-in-memory-20260913/](xe-in-memory-20260913/)
* [xe-long-agentic-20260914/](xe-long-agentic-20260914/)
* [xe-long-agentic-v2-20260914/](xe-long-agentic-v2-20260914/)
* [xe-master-agentic-20260914/](xe-master-agentic-20260914/)
* [xe-zero-copy-throughput-20260914/](xe-zero-copy-throughput-20260914/)

## 2026-09-15 Gemma service and Qwen3.8 memory

* [gemma-zero-copy-service-20260915/](gemma-zero-copy-service-20260915/) -- current in-process Gemma service record: resident Vulkan model, fresh cold-prefill contexts, CPU MTP continuation, live UI streaming/progress, exact 4K/32K qualification and zero copied bytes.
* [qwen38-vulkan-mtp-memory-20260915/](qwen38-vulkan-mtp-memory-20260915/) -- 18-run CPU/Vulkan prefill matrix, production server A/B, exact constructor check and 1K handoff resource summary.

These directories mix curated `README.md` or `report.md` pages with raw JSON, stdout captures and scripts. Read the per-directory README first when one exists.
