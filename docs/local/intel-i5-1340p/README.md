# LattePanda Sigma / Intel Core i5-1340P

This subtree collects the local work on `sigma`: Intel Core i5-1340P, 31 GiB RAM, and a lot of CPU-first experiments that spilled across Qwen, Ornith, Gemma, Maple and later Intel Xe handoff work. The old flat `docs/` list made it too easy to lose chronology, so the benchmark-heavy material is now linked from one page.

**Current state,24 October2026:** [operating status](model-serving-status-20261023.md). User-authorised ThinkingCap64k/8P-SMT is live; the other roles below are historical. [Five-model comparison](thinkingcap-gemma4-20261024.md): separate20/23.25GiB groups,coding6/6 for ThinkingCap and historicalFlint.

## Retained roles and runbooks

* [Local model profiles](gemma-local-provider-runbook.md) -- primary Gemma 4 E4B QAT + MTP zero-copy deployment plus static Huihui security-audit and verified Bonsai 2 27B PQ2 CPU-baseline profiles, with health-checked switching and one LAN UI/API on port 11434.
* [Qwen3.6 128K service runbook](intel-1340p-qwen-longctx-runbook.md) -- retained rollback and long-context service profile.
* [Maple Preview local provider](maple-local-provider-runbook.md) -- explicit alternative provider, not the default.
* [Ornith 1.0 runbook](intel-1340p-ornith-runbook.md) and [Ornith 1.5 provider](ornith-1.5-local-provider-runbook.md) -- retained disabled profiles and rollback references.

## Campaigns and design notes

* [Flint throughput, 23 October 2026](flint-throughput-20261023.md) -- CPU 50.43 prompt / 13.09 decode tok/s; cache and strict zero-copy evidence. [Coding](../../../benchmarks/intel-1340p/flint-zero-copy-20261023/coding-unlimited/README.md): uncapped coding complete6/6,1053assertions; initial capped calibration retained; historical serving state; see current operating status.

* [Nemotron Lightning strict zero-copy, 7 October 2026](nemotron-lightning-zero-copy-20261007.md) -- native H/MoE rollback/lifetime gates and exact Q4 state transfer; fixed-token timing screen only, not deployed.


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
* [Gemma 4 E4B QAT + MTP Q4 scheduling](../../../benchmarks/intel-1340p/gemma-zc-speed-20260916/README.md) -- primary deployment, historically labelled ZC2: equivalent four-row Q4 arithmetic with shorter temporary lifetimes, confirmed sustained and historical speedups, full zero-copy/UI qualification and verified ZC1 rollback.
* [Gemma prompt-lookup benchmark correction](../../../benchmarks/intel-1340p/prompt-lookup-20260928/README.md) -- synthetic high-fanout cache loops improved, but isolated CPU-only `llama-lookup` spent less than 0.4 ms per request in cache work and showed no validated request-level gain. The live Gemma MTP service was not changed.
* [Huihui Gemma 4 12B security-audit profile](../../../benchmarks/intel-1340p/huihui-gemma4-12b-trial-20260917/README.md) -- explicit boot-disabled alternative with matched MTP, zero-copy handoff, parser correction, full embedded UI and repeatable local switching.
* [Bonsai 2 27B PQ2_0 baseline](../../../benchmarks/intel-1340p/bonsai2-27b-integration-20260918/README.md) -- PQ2/Hadamard correctness, CPU/Vulkan comparison, API/UI qualification and a static CPU-only profile.
* [Bonsai 2 27B PTQ1 zero-copy handoff diagnostic](../../../benchmarks/intel-1340p/bonsai2-27b-zero-copy-20260918/README.md) -- correct target-only state transfer and serving lifecycle evidence, but rejected for performance after comparison with published PTQ1 prefill and PQ2 CPU generation endpoints; no service was deployed.
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
* The 16 September Gemma Q4 scheduling campaign defines the primary Gemma 4 E4B QAT + MTP deployment. Generation parity defines its ZC1 baseline, and the 15 September service report defines the original zero-copy architecture. The 17 September Huihui profile and 18 September Bonsai PQ2 CPU baseline are explicit local alternatives. Bonsai PTQ1 source/handoff correctness is retained, but its measured topology is rejected for performance and not deployed. Earlier Intel Xe studies remain narrow measured slices and do not change other model/backend defaults.
