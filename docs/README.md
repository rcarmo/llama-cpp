# Documentation index

This index highlights fork-specific implementation, validation, and performance
reports. General llama.cpp build/model/server documentation remains linked from
the repository root README.

## RTX 3060 agentic service

- [Qwen3.6 agentic tuning and near-32K validation](qwen36-agentic-tuning.md)
- [Qwen3.6 restoration and matched async comparison](qwen36-async-retune.md)
- [CUDA graph allocation recovery: engine fix and fault injection](cuda-graph-allocation-recovery.md)

## CPU/GPU scheduling

- [Shared-budget expert-cache relocation: controls, validation and measured limits](shared-vram-relocation.md)

- [GPU prefill offload and bounded expert staging: controls, tests and measured no-go](gpu-prefill-staging.md)

- [Generalised async CPU scheduler: design, safety, usage, tests and profiling](general-async-cpu.md)
- [Qwen3.8 27B Unsloth Dynamic RTX 3060 campaign](qwen38-27b-ud-q4-rtx3060-report.md)

## Start here

- [Build guide](build.md)
- [Backend operation support](ops.md)
- [Branch consolidation audit](branch-audit-2026-07-29.md)

## LattePanda Sigma / Intel Core i5-1340P

- [Qwen3.6 128K service runbook](intel-1340p-qwen-longctx-runbook.md)
- [Ornith 1.0 35B service runbook](intel-1340p-ornith-runbook.md)
- [Gemma 4 E4B service runbook](intel-1340p-gemma4-runbook.md)
- [Ornith and Gemma optimisation campaign](intel-1340p-ornith-gemma-campaign.md)
- [Gemma local-provider operations](gemma-local-provider-runbook.md)
- [Gemma local-provider concurrency benchmark](gemma-local-provider-benchmark-2026-08-02.md)
- [Maple Preview design](maple-preview-design.md)
- [Maple local-provider operations](maple-local-provider-runbook.md)
- [Maple implementation and validation evidence](../benchmarks/intel-1340p/maple-preview/README.md)
- [Maple agentic comparison](../benchmarks/intel-1340p/maple-preview/agentic/report.md)
- [Matched Maple, Gemma and Qwen campaign](../benchmarks/intel-1340p/maple-qwen-campaign/report.md)
- [Campaign evidence and reproduction index](../benchmarks/intel-1340p/maple-qwen-campaign/README.md)
- [Qwen 3.8 27B Sigma campaign](../benchmarks/intel-1340p/qwen38-campaign/report.md)
- [Qwen 3.8 evidence and reproduction index](../benchmarks/intel-1340p/qwen38-campaign/README.md)
- [Expert-I/O baseline and controls](expert-io-adoption-baseline.md)
- [thecodacus/perf Qwen placement assessment](thecodacus-perf-qwen-adoption.md)
- [TurboFieldfare adoption report](turbo-fieldfare-adoption-report.md)
- [Intel CPU/Vulkan campaign report](../benchmarks/intel-1340p/final-report-20260731.md)
- [Qwen 128K Fieldfare report](../benchmarks/intel-1340p/qwen-longctx-fieldfare/report.md)
- [Ornith/Gemma completion audit](../benchmarks/intel-1340p/ornith-gemma-optimization/completion-audit.md)

## SpaceMIT K3

- [SpaceMIT K3 backend build](build-riscv64-spacemit.md)
- [Accepted default fast paths](spacemit-default-fastpaths-deployment.md)
- [Dense fallback experiments](spacemit-dense-fallback-experiments.md)
- [K3 matmul harness](../scripts/README-k3-matmul.md)
- [K3 RVV/IME2 matmul report](../benchmarks/k3-matmul-final-report-20260720.md)
- [Qwen recurrent-state optimisation](../benchmarks/qwen-recurrent-20260721/final-report.md)
- [Qwen parameter sweep](../benchmarks/qwen-parameter-sweep-20260722/final-report.md)
- [Compact-IQ IME2 cache](../benchmarks/qwen-compact-ime2-20260722/report.md)

## General SIMD and Vulkan evidence

- [AVX2 SIMD notes](simd-avx2-notes.md)
- [SIMD baseline](simd-baseline.md)
- [Bounded SIMD performance report](simd-performance-report.md)
- [Low-power Intel target validation](simd-target-validation.md)

## Vulkan

Recommended reading order:

1. [Cross-vendor evaluation and capability tiers](vulkan-cross-vendor-evaluation.md)
2. [Deployment, device selection, debugging, and rollback](vulkan-deployment.md)
3. [RTX 3060 baseline and bounded measurements](vulkan-baseline.md)
4. [Target validation for Intel Xe and ARM GPUs](vulkan-target-validation.md)
5. [Cross-vendor results matrix](vulkan-results-matrix.md)
6. [Bounded Vulkan performance report](vulkan-performance-report.md)

## Additional benchmark reports

- [Qwen A3B Tunney-style campaign](../benchmarks/qwen-a3b-tunney/final-report-20260720.md)
- [Soft bounded compact-IQ cache](../benchmarks/qwen-compact-ime2-soft-cache-20260723/report.md)
- [Intel CPU/Vulkan interleaving](../benchmarks/intel-1340p/cpu-vulkan-interleaving-report-20260731.md)
- [Qwen35MoE Vulkan MTP evaluation](../benchmarks/intel-1340p/qwen35moe-vulkan-mtp/report.md)

## Scope and maintenance

Fork-specific benchmark numbers are bounded snapshots, not universal claims.
Refresh hardware/driver baselines after material compiler, driver, backend, or
model changes. Record source commit, exact command, load, memory, and raw logs.
