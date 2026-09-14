# RTX 3060 benchmark index

The RTX 3060 evidence is split between prose reports under `docs/local/rtx3060/` and raw tool-run artefacts under `tools/pi/benchmarks/results/gsq-opt/`. This page ties those pieces together without moving the raw evidence.

## Curated reports

* [Qwen3.6 restoration baseline](../../docs/local/rtx3060/qwen36-async-retune.md)
* [Qwen3.6 agentic tuning](../../docs/local/rtx3060/qwen36-agentic-tuning.md)
* [CUDA graph allocation recovery](../../docs/local/rtx3060/cuda-graph-allocation-recovery.md)
* [Qwen3.8 UD-Q4_K_XL campaign](../../docs/local/rtx3060/qwen38-27b-ud-q4-rtx3060-report.md)
* [Qwen3.8 GSQ-RCO report](../../docs/local/rtx3060/qwen38-gsq-rco-report.md)

## Raw evidence paths

* `../../tools/pi/benchmarks/results/gsq-opt/` -- main GSQ optimisation archive
* `../../tools/pi/benchmarks/results/gsq-opt/origin-agentic/` -- latest 2026-09-14 three-turn task summaries and regression output
* `../../tools/pi/benchmarks/results/gsq-opt/power-sweep/` -- retained power-sweep CSV/JSON pairs

## Reading note

The latest GSQ report mixes fixed-work probes, long-context checks and three-turn task runs. Use the report first for context, then inspect the raw JSON or text artefacts for the exact workload shape and cache reuse.
