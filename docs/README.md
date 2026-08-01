# Documentation index

This index highlights fork-specific implementation, validation, and performance
reports. General llama.cpp build/model/server documentation remains linked from
the repository root README.

## Start here

- [Build guide](build.md)
- [Backend operation support](ops.md)
- [Branch consolidation audit](branch-audit-2026-07-29.md)

## SpaceMIT K3 and SIMD

- [SpaceMIT K3 backend build](build-riscv64-spacemit.md)
- [K3 matmul harness](../scripts/README-k3-matmul.md)
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

## TurboFieldfare / expert I/O

- [TurboFieldfare technique audit](turbo-fieldfare-audit.md)
- [Expert-I/O baseline, controls, and evidence](expert-io-adoption-baseline.md)
- [Final TurboFieldfare adoption report](turbo-fieldfare-adoption-report.md)
- [Intel i5-1340P Qwen3.6 128K service runbook](intel-1340p-qwen-longctx-runbook.md)
- [Intel i5-1340P Ornith 1.0 35B and Gemma 4 E4B campaign](intel-1340p-ornith-gemma-campaign.md)

## Benchmark reports

- [Qwen A3B Tunney-style campaign](../benchmarks/qwen-a3b-tunney/final-report-20260720.md)
- [Qwen recurrent path](../benchmarks/qwen-recurrent-20260721/final-report.md)
- [Qwen parameter sweep](../benchmarks/qwen-parameter-sweep-20260722/final-report.md)
- [Compact-IQ IME2 cache](../benchmarks/qwen-compact-ime2-20260722/report.md)
- [K3 RVV/IME2 matmul](../benchmarks/k3-matmul-final-report-20260720.md)

## Scope and maintenance

Fork-specific benchmark numbers are bounded snapshots, not universal claims.
Refresh hardware/driver baselines after material compiler, driver, backend, or
model changes. Record source commit, exact command, load, memory, and raw logs.
