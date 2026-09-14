# Cross-platform notes

Some local work was never about one machine. These reports track scheduler behaviour, staging, SIMD and Vulkan across several backends, so they stay together instead of being forced under a single host.

## Scheduling and memory placement

* [Generalised async CPU scheduler](general-async-cpu.md)
* [Shared-budget expert-cache relocation](shared-vram-relocation.md)
* [GPU prefill offload and bounded expert staging](gpu-prefill-staging.md)
* [Branch audit](branch-audit-2026-07-29.md)

## SIMD and Vulkan

* [SIMD AVX2 notes](simd-avx2-notes.md)
* [SIMD baseline](simd-baseline.md)
* [Bounded SIMD performance report](simd-performance-report.md)
* [Low-power Intel target validation](simd-target-validation.md)
* [Vulkan cross-vendor evaluation](vulkan-cross-vendor-evaluation.md)
* [Vulkan deployment and rollback](vulkan-deployment.md)
* [Vulkan baseline contract](vulkan-baseline.md)
* [Vulkan target validation](vulkan-target-validation.md)
* [Vulkan results matrix](vulkan-results-matrix.md)
* [Vulkan performance report](vulkan-performance-report.md)

Use the report dates and benchmark tree when comparing numbers. A few of these pages are design or operating notes; others record measured campaigns. They are linked together here, not flattened into one long README.
