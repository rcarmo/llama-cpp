# LattePanda Sigma / Intel Core i5-1340P

This subtree collects the local work on `sigma`: Intel Core i5-1340P, 31 GiB RAM, and a lot of CPU-first experiments that spilled across Qwen, Ornith, Gemma, Maple and later Intel Xe handoff work. The old flat `docs/` list made it too easy to lose chronology, so the benchmark-heavy material is now linked from one page.

## Start with the current roles

* [Gemma 4 E4B zero-copy service](gemma-local-provider-runbook.md) -- sole enabled local model service: one 32K slot, Vulkan cold prefill, in-process CPU handoff and CPU MTP decode on LAN port 8094.
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
* [Gemma zero-copy service qualification](../../../benchmarks/intel-1340p/gemma-zero-copy-service-20260915/README.md) -- 15 September 2026 persistent Vulkan prefill to CPU MTP service, exact 4K/32K and tool/multi-turn evidence.
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
* The 15 September Gemma zero-copy service report is the current deployment record. Earlier Intel Xe studies remain narrow measured slices and do not change other model/backend defaults.
