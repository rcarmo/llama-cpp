# RTX 3060 12 GB

The local CUDA work on this host now lives in one place instead of being scattered across root-level documents. The hardware identity is the one recorded by the reports themselves: an NVIDIA GeForce RTX 3060 with 12 GB VRAM.

## Current headline

The latest GSQ rebuild is the 2026-09-14 report at [qwen38-gsq-rco-report.md](qwen38-gsq-rco-report.md). It records source `a380f11b5`, 446.0 tok/s median tool-result prefill, 32.9 tok/s median final-response decode and 21.96 s median three-turn task time. Those task timings are not three cold-start runs: the task reused cached tokens, and the report explicitly says no thermal telemetry was collected for the three latest runs.

Raw evidence for that series lives under [`tools/pi/benchmarks/results/gsq-opt/`](../../../tools/pi/benchmarks/results/gsq-opt/), with the latest three-turn summaries in [`tools/pi/benchmarks/results/gsq-opt/origin-agentic/`](../../../tools/pi/benchmarks/results/gsq-opt/origin-agentic/). The benchmark tree index is [../../../benchmarks/rtx3060/README.md](../../../benchmarks/rtx3060/README.md).

## Reports in order

* [Qwen3.6 restoration and async retune](qwen36-async-retune.md) -- historical baseline after switching back from the dense Qwen3.8 service.
* [Qwen3.6 agentic prefill tuning](qwen36-agentic-tuning.md) -- selected 16 cache slots and microbatch 1024 for the three-turn tool fixture, plus near-32K validation.
* [CUDA graph executable allocation recovery](cuda-graph-allocation-recovery.md) -- engine change and fault-injection coverage. This is a recovery path for executable allocation failures, not a blanket CUDA OOM cure.
* [Qwen3.8 27B UD-Q4_K_XL on RTX 3060](qwen38-27b-ud-q4-rtx3060-report.md) -- historical dense-model campaign and rollback context.
* [Qwen3.8 GSQ-RCO evaluation](qwen38-gsq-rco-report.md) -- latest local status, including unresolved plain/MTP parity limits.

## Caveats that matter

* Several reports compare operational profiles rather than isolated apples-to-apples microbenchmarks. Read the workload notes before carrying numbers elsewhere.
* Prefix caching, prompt reuse and MTP acceptance all change what a token-rate line really means. The latest GSQ task numbers are useful, but they are not a substitute for matched fixed-work comparisons.
* The dense Qwen3.8 and MoE Qwen3.6 series are not interchangeable. The reports keep both because one is rollback history and the other is the active service line.
