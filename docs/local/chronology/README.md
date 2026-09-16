# Chronology

The dated campaigns below are the quickest way to see what superseded what. Undated runbooks stay at the end because they describe current or retained operating state, not a single benchmark day.

## 2026-06

* 2026-06-10 -- [SpaceMIT model sweep](../../benchmarks/spacemit-model-sweep-2026-06-10.md)
* 2026-06-20 -- [SpaceMIT speedup TSV](../../../benchmarks/spacemit-speedup-bench-2026-06-20.tsv), [26B/A4B context-size TSV](../../../benchmarks/26b-a4b-context-size-bench-2026-06-20.tsv)

## 2026-07

* 2026-07-19 / 2026-07-20 -- [K3 matmul report set](../../../benchmarks/k3/README.md)
* 2026-07-21 -- [Qwen recurrent-path optimisation](../../../benchmarks/qwen-recurrent-20260721/final-report.md)
* 2026-07-22 -- [Qwen parameter sweep](../../../benchmarks/qwen-parameter-sweep-20260722/final-report.md), [compact-IQ IME2 cache](../../../benchmarks/qwen-compact-ime2-20260722/report.md), [quant comparison](../../../benchmarks/qwen-quant-comparison-20260722/report.md), [Q3_K_M service test](../../../benchmarks/qwen-q3km-20260722/report.md)
* 2026-07-23 -- [shared compact-IQ cache](../../../benchmarks/qwen-compact-ime2-soft-cache-20260723/report.md), [Q4_K_M 16K service test](../../../benchmarks/qwen-q4km-16k-20260723/report.md)
* 2026-07-29 -- [branch audit](../cross-platform/branch-audit-2026-07-29.md)
* 2026-07-31 -- [Intel Core i5-1340P Qwen campaign](../../../benchmarks/intel-1340p/final-report-20260731.md), [CPU/Vulkan interleaving](../../../benchmarks/intel-1340p/cpu-vulkan-interleaving-report-20260731.md), [Ornith/Gemma campaign summary](../intel-i5-1340p/intel-1340p-ornith-gemma-campaign.md)

## 2026-08

* 2026-08-01 -- [Ornith/Gemma 128K candidate validation](../../../benchmarks/intel-1340p/ornith-gemma-optimization/validation/candidate-128k/README.md)
* 2026-08-02 -- [Gemma local-provider concurrency benchmark](../intel-i5-1340p/gemma-local-provider-benchmark-2026-08-02.md)
* 2026-08-05 / 2026-08-06 -- [Maple Preview evidence](../../../benchmarks/intel-1340p/maple-preview/README.md), [Maple/Gemma/Qwen campaign](../../../benchmarks/intel-1340p/maple-qwen-campaign/README.md)
* 2026-08-22 -- [Gemma and Ornith agentic comparison on Sigma](../../../benchmarks/intel-1340p/gemma-ornith-agentic-20260822/README.md)

## 2026-09

* 2026-09-03 -- [Qwen3.8 vs Qwen3.6 Dynamic on Sigma](../../../benchmarks/intel-1340p/qwen38-qwen36-dynamic-20260903/README.md)
* 2026-09-04 / 2026-09-05 -- [RTX 3060 Qwen3.8 UD-Q4_K_XL campaign](../rtx3060/qwen38-27b-ud-q4-rtx3060-report.md)
* 2026-09-10 / 2026-09-11 -- [Gemma benchmark cluster on Sigma](../../../benchmarks/intel-1340p/README.md#2026-09-10-and-2026-09-11-gemma-series), [Gemma integration closeout](../../../benchmarks/intel-1340p/gemma-integration-b0-20260911/report.md)
* 2026-09-13 / 2026-09-14 -- [Intel Xe handoff and zero-copy series](../../../benchmarks/intel-1340p/README.md#2026-09-13-and-2026-09-14-intel-xe-series), [in-memory KV handoff note](../intel-i5-1340p/in-memory-kv-handoff.md), [paired Q6 note](../intel-i5-1340p/cpu-q6-pair.md)
* 2026-09-14 -- [RTX 3060 GSQ rebuild](../rtx3060/qwen38-gsq-rco-report.md)
* 2026-09-15 -- [Gemma 32K zero-copy service qualification, persistent-model and live-stream verification](../../../benchmarks/intel-1340p/gemma-zero-copy-service-20260915/README.md), [current operations](../intel-i5-1340p/gemma-local-provider-runbook.md), [Qwen3.8 embedded-MTP microbatch cap on Intel Iris Xe](../intel-i5-1340p/qwen38-vulkan-mtp-memory.md)

## Current runbooks and retained operational docs

* [Qwen 128K on Sigma](../intel-i5-1340p/intel-1340p-qwen-longctx-runbook.md)
* [Gemma zero-copy service on Sigma](../intel-i5-1340p/gemma-local-provider-runbook.md)
* [Maple local provider on Sigma](../intel-i5-1340p/maple-local-provider-runbook.md)
* [Ornith 1.0 and 1.5 retained runbooks](../intel-i5-1340p/intel-1340p-ornith-runbook.md), [Ornith 1.5 disabled profile](../intel-i5-1340p/ornith-1.5-local-provider-runbook.md)
* [SpaceMIT K3 build notes](../spacemit-k3/build-riscv64-spacemit.md)

## September 16 serving update

* 2026-09-16 -- [RTX 3060 persistent GSQ service](../rtx3060/qwen38-gsq-rco-report.md#persistent-serving-2026-09-16): enabled user unit replaces transient serving; health and API smoke checks passed, no new benchmark.
