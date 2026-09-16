# LattePanda Sigma / Intel Core i5-1340P

This subtree collects the local work on `sigma`: Intel Core i5-1340P, 31 GiB RAM, and a lot of CPU-first experiments that spilled across Qwen, Ornith, Gemma, Maple and later Intel Xe handoff work. The old flat `docs/` list made it too easy to lose chronology, so the benchmark-heavy material is now linked from one page.

## Start with the current roles

* [Gemma 4 E4B zero-copy service](gemma-local-provider-runbook.md) -- sole enabled local model service: one 32K slot, resident Vulkan model with a fresh cold-prefill context, in-process CPU handoff, CPU MTP decode and live UI progress on LAN port 8094.
* [Qwen3.6 128K service runbook](intel-1340p-qwen-longctx-runbook.md) -- retained rollback and long-context service profile.
* [Maple Preview local provider](maple-local-provider-runbook.md) -- explicit alternative provider, not the default.
* [Ornith 1.0 runbook](intel-1340p-ornith-runbook.md) and [Ornith 1.5 provider](ornith-1.5-local-provider-runbook.md) -- retained disabled profiles and rollback references.

## Campaigns and design notes

* [Ornith and Gemma optimisation campaign](intel-1340p-ornith-gemma-campaign.md)
* [Gemma and Ornith agentic comparison, 22 August 2026](../../../benchmarks/intel-1340p/gemma-ornith-agentic-20260822/README.md)
* [Historical Gemma 128K runbook](intel-1340p-gemma4-runbook.md)
* [Maple Preview design](maple-preview-design.md)
* [Expert-I/O baseline](expert-io-adoption-baseline.md)
* [thecodacus/perf Qwen assessment](thecodacus-perf-qwen-adoption.md)
* [TurboFieldfare adoption report](turbo-fieldfare-adoption-report.md) and [audit](turbo-fieldfare-audit.md)
* [Gemma concurrency benchmark](gemma-local-provider-benchmark-2026-08-02.md)
* [In-memory Vulkan-to-CPU KV handoff](in-memory-kv-handoff.md)
* [Fedora Intel build container](intel-build-container.md) -- reproducible rootless Podman toolchain for native CPU and Vulkan builds, including image identity, ccache and host-runtime boundaries.
* [Gemma zero-copy service qualification](../../../benchmarks/intel-1340p/gemma-zero-copy-service-20260915/README.md) -- 15 September 2026 Vulkan-prefill to CPU-MTP service, exact 4K/32K, tool/multi-turn, persistent-model and live-stream evidence.
* [Gemma generation parity](../../../benchmarks/intel-1340p/gemma-generation-parity-20260916/README.md) -- ZC1 baseline: model-derived defaults and `n_min=1`, rejected pool/small-batch paths, sustained and historical fixtures, full serving qualification and immutable rollback.
* [Gemma ZC1 Q4 scheduling](../../../benchmarks/intel-1340p/gemma-zc-speed-20260916/README.md) -- current deployment: equivalent four-row Q4 arithmetic with shorter temporary lifetimes, confirmed sustained and historical speedups, full zero-copy/UI qualification and immutable rollback.
* [Qwen3.8 embedded-MTP microbatch cap](qwen38-vulkan-mtp-memory.md) -- 15 September 2026 Intel Iris Xe memory and prefill qualification; committed but not deployed.
* [Paired Q6 note](cpu-q6-pair.md)

## Raw evidence and benchmark clusters

The main benchmark index is [../../../benchmarks/intel-1340p/README.md](../../../benchmarks/intel-1340p/README.md). Start there for the large evidence trees:

* [`benchmarks/intel-1340p/ornith-gemma-optimization/`](../../../benchmarks/intel-1340p/ornith-gemma-optimization/)
* [`benchmarks/intel-1340p/maple-preview/`](../../../benchmarks/intel-1340p/maple-preview/)
* [`benchmarks/intel-1340p/maple-qwen-campaign/`](../../../benchmarks/intel-1340p/maple-qwen-campaign/)
* [`benchmarks/intel-1340p/qwen38-campaign/`](../../../benchmarks/intel-1340p/qwen38-campaign/)
* [`benchmarks/intel-1340p/qwen38-qwen36-dynamic-20260903/`](../../../benchmarks/intel-1340p/qwen38-qwen36-dynamic-20260903/)
* [`benchmarks/intel-1340p/gemma-*20260910/`](../../../benchmarks/intel-1340p/README.md#2026-09-10-and-2026-09-11-gemma-series) and [`benchmarks/intel-1340p/gemma-*20260911/`](../../../benchmarks/intel-1340p/README.md#2026-09-10-and-2026-09-11-gemma-series)
* [`benchmarks/intel-1340p/xe-*20260913/`](../../../benchmarks/intel-1340p/README.md#2026-09-13-and-2026-09-14-intel-xe-series) and [`benchmarks/intel-1340p/xe-*20260914/`](../../../benchmarks/intel-1340p/README.md#2026-09-13-and-2026-09-14-intel-xe-series)
* [Qwen3.8 Vulkan embedded-MTP memory qualification, 15 September 2026](../../../benchmarks/intel-1340p/qwen38-vulkan-mtp-memory-20260915/README.md)

## Caveats that recur across the Sigma reports

* CPU masks in these documents are host-specific. Several reports note that requested binding and observed OpenMP worker placement were not identical.
* Thermal annotations exist where they were measured, but not every campaign has full thermal telemetry. Keep that distinction.
* The 16 September Gemma Q4 scheduling campaign is the current deployment record. Generation parity defines its ZC1 baseline, and the 15 September service report defines the original zero-copy architecture. Earlier Intel Xe studies remain narrow measured slices and do not change other model/backend defaults.
