# Model navigation

The same work can be read by model family instead of by host. That matters whenever one model appears on more than one machine or when a newer report keeps an older one only as rollback context.

## Qwen

* Qwen3.6 35B-A3B
  * RTX 3060: [restoration baseline](../rtx3060/qwen36-async-retune.md), [agentic prefill tuning](../rtx3060/qwen36-agentic-tuning.md)
  * Sigma: [128K runbook](../intel-i5-1340p/intel-1340p-qwen-longctx-runbook.md), [July CPU/Vulkan campaign](../../../benchmarks/intel-1340p/final-report-20260731.md), [Fieldfare report](../../../benchmarks/intel-1340p/qwen-longctx-fieldfare/report.md)
  * K3: [recurrent-path report](../../../benchmarks/qwen-recurrent-20260721/final-report.md), [parameter sweep](../../../benchmarks/qwen-parameter-sweep-20260722/final-report.md), [Q3_K_M service test](../../../benchmarks/qwen-q3km-20260722/report.md), [Q4_K_M 16K test](../../../benchmarks/qwen-q4km-16k-20260723/report.md)
* Qwen3.8 27B
  * RTX 3060: [historical UD-Q4_K_XL campaign](../rtx3060/qwen38-27b-ud-q4-rtx3060-report.md), [GSQ-RCO report](../rtx3060/qwen38-gsq-rco-report.md)
  * Sigma: [Qwen 3.8 campaign](../../../benchmarks/intel-1340p/qwen38-campaign/README.md), [Qwen3.8 vs Qwen3.6 Dynamic comparison](../../../benchmarks/intel-1340p/qwen38-qwen36-dynamic-20260903/README.md), [Vulkan embedded-MTP memory qualification](../intel-i5-1340p/qwen38-vulkan-mtp-memory.md)

## Gemma

* Gemma 4 E4B
  * Sigma operations: [current local provider runbook](../intel-i5-1340p/gemma-local-provider-runbook.md), [historical 128K runbook](../intel-i5-1340p/intel-1340p-gemma4-runbook.md), [concurrency benchmark](../intel-i5-1340p/gemma-local-provider-benchmark-2026-08-02.md)
  * Sigma campaigns: [Ornith/Gemma optimisation](../intel-i5-1340p/intel-1340p-ornith-gemma-campaign.md), [Gemma integration closeout](../../../benchmarks/intel-1340p/gemma-integration-b0-20260911/report.md), [Gemma research above 32K](../../../benchmarks/intel-1340p/gemma-hybrid-perf-20260910/report.md)
  * K3 history: [dense fallback experiments](../spacemit-k3/spacemit-dense-fallback-experiments.md)

## Maple and Ornith

* Maple Preview: [design](../intel-i5-1340p/maple-preview-design.md), [runbook](../intel-i5-1340p/maple-local-provider-runbook.md), [implementation evidence](../../../benchmarks/intel-1340p/maple-preview/README.md), [agentic comparison](../../../benchmarks/intel-1340p/maple-preview/agentic/report.md)
* Ornith 1.0 35B: [campaign](../intel-i5-1340p/intel-1340p-ornith-gemma-campaign.md), [runbook](../intel-i5-1340p/intel-1340p-ornith-runbook.md)
* Ornith 1.5 local provider: [runbook](../intel-i5-1340p/ornith-1.5-local-provider-runbook.md)

## Cross-cutting implementation topics

* [Async CPU scheduling](../cross-platform/general-async-cpu.md)
* [Shared VRAM relocation](../cross-platform/shared-vram-relocation.md)
* [GPU prefill staging](../cross-platform/gpu-prefill-staging.md)
* [SIMD notes and reports](../cross-platform/README.md#simd-and-vulkan)
* [Vulkan reports](../cross-platform/README.md#simd-and-vulkan)
