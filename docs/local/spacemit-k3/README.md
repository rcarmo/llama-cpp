# SpaceMIT K3

The K3 work now has one entry point for build notes, backend experiments and the matmul/compact-IQ campaign chain. The reports themselves are still the source of truth for what was measured on which day.

## Local docs

* [SpaceMIT K3 backend build](build-riscv64-spacemit.md)
* [Accepted default fast paths](spacemit-default-fastpaths-deployment.md)
* [Dense fallback experiments](spacemit-dense-fallback-experiments.md)

## Benchmark reports and evidence

* [K3 benchmark index](../../../benchmarks/k3/README.md)
* [SpaceMIT model sweep](../../benchmarks/spacemit-model-sweep-2026-06-10.md)
* [Current compact-IQ IME2 report](../../../benchmarks/qwen-compact-ime2-20260722/report.md)
* [Qwen recurrent-path report](../../../benchmarks/qwen-recurrent-20260721/final-report.md)
* [Qwen parameter sweep](../../../benchmarks/qwen-parameter-sweep-20260722/final-report.md)

## Caveats that matter

* The 20 July K3 matmul reports are explicitly historical. They say so, and the later 22 July compact-IQ work supersedes the full-row per-call packer.
* The K3 report chain records a 31 GiB no-swap host and rejects persistent IQ->Q8 repacking as a safe default under that memory limit.
* Thermal and service notes are report-specific; there is no single K3-wide thermal summary page here because the evidence was not collected that way.
