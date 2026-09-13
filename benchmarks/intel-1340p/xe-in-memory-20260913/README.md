# Optimised in-memory Gemma handoff performance

Implementation: [`d2028882bd6bfb6d967f0538761639ca8c75599c`](https://github.com/rcarmo/llama-cpp/commit/d2028882bd6bfb6d967f0538761639ca8c75599c). API/caller: [in-memory KV handoff](../../../docs/in-memory-kv-handoff.md). Verification and artifact inventory: [publication guide](PUBLICATION.md). Publication contains the measured working-tree evidence and its historical runtime hashes; no deployment is included.

The shared-KV path measured **22.48 tok/s** after the first token versus **20.49 tok/s** for the forced-copy control on this short MTP3 workload. Handoff itself took **61.47 ms versus 82.02 ms**. The first-token latency remained about **6.9 seconds**, dominated by model loading and GPU prefill.

Eight valid fresh-process runs used counterbalanced order A B B A B A A B, where A is shared and B is copied. Both arms produced byte-identical output with identical evaluated and speculative work. One additional attempt was stopped on contention and excluded before completion; the retry was explicitly admitted.

## Main measurements

Medians over four runs per arm; ranges contain every valid observation.

| Metric | Shared | Copied | Shared vs copied |
| --- | ---: | ---: | ---: |
| Handoff latency | 61.47 ms | 82.02 ms | 20.55 ms / 25.1% lower |
| Handoff range | 60.34-62.65 ms | 79.72-85.10 ms | No overlap in these runs |
| Post-first-token decode | 22.48 tok/s | 20.49 tok/s | 9.7% higher median |
| Decode range | 20.73-23.09 tok/s | 18.65-22.26 tok/s | Overlapping ranges |
| Process-to-first-token | 6.916 s | 6.905 s | 10.8 ms higher; effectively unchanged |
| End-of-prefill to first token | 3.148 s | 3.163 s | 14.6 ms lower |
| Whole process | 12.790 s | 13.383 s | 0.593 s / 4.4% lower |

Handoff reduction was consistent. Decode variation was larger: adjacent matched-pair throughput differences were +22.9%, +2.0%, -6.9% and +19.7%. Four samples per arm cannot establish a precise general throughput gain. The 9.7% is the observed ratio of medians for this workload, not a guarantee or a causal attribution to one memory/cache mechanism.

### All valid runs

| Run | Arm | Handoff ms | Decode tok/s | First token s | Whole process s |
| --- | --- | ---: | ---: | ---: | ---: |
| r0 | shared | 61.92 | 23.09 | 7.023 | 12.754 |
| r1 | copied | 79.79 | 18.79 | 6.922 | 13.910 |
| r2 | copied | 85.10 | 22.18 | 6.889 | 12.855 |
| r3 | shared | 62.65 | 22.63 | 6.870 | 12.716 |
| r4 | copied | 79.72 | 22.26 | 6.861 | 12.796 |
| r5 | shared | 60.34 | 20.73 | 6.928 | 13.284 |
| r6 | shared | 61.02 | 22.32 | 6.904 | 12.826 |
| r7 | copied | 84.25 | 18.65 | 6.966 | 14.010 |

Machine-readable individual results: `results.csv`, `summary.json`, and `runs/r*/{metrics,summary,result,manifest}.json`.

## Stage breakdown

| Stage | Shared median | Copied median |
| --- | ---: | ---: |
| Source model load | 2.077 s | 2.078 s |
| Source context setup | 0.037 s | 0.037 s |
| GPU prefill, 309 tokens | 1.611 s | 1.593 s |
| GPU prefill rate | 191.8 tok/s | 194.0 tok/s |
| CPU model load | 2.345 s | 2.340 s |
| CPU context setup | 0.015 s | 0.015 s |
| KV handoff | 0.061 s | 0.082 s |
| Source context/model release | 0.087 s | 0.088 s |
| Assistant model load | 0.518 s | 0.516 s |
| Assistant context setup | 0.00085 s | 0.00088 s |
| Last-token CPU reevaluation call | 0.112 s | 0.114 s |
| First-to-last emitted token interval | 5.650 s | 6.242 s |

Medians of component stages need not sum to the median request total. Tokenisation, sampler setup, speculative processing, output and cleanup add other work. The CPU reevaluation/decode call durations do not add extra synchronisation and are diagnostic call durations, not GPU-style compute timestamps. GPU prefill was explicitly synchronised at each caller chunk boundary before timing ended.

The handoff metric includes compatibility checks, CPU-view acquisition or bounded copy, metadata preparation, graph invalidation, commit and source-cache metadata release. Both paths still do this common work. Eliminating payload copies does not reduce the entire handoff to a pointer assignment.

## Matched workload and controls

- Hardware: Sigma i5-1340P / Intel Iris Xe (RPL-P), UMA, existing Mesa driver.
- Target: Gemma E4B QAT Q4_0, SHA-256 `676c35070db6dbe52f93e9c864ee0fba4eddea94b9c875d9cb10daff453fbaee`.
- CPU assistant: Gemma E4B MTP Q8_0, SHA-256 `49d8367f8e1a507ef6196a7eeed790b2797bc649568f431c10bce03f574f6ffc`.
- 309 prompt tokens, 128 output tokens, MTP depth3, target greedy sampling.
- 96 draft tokens, 94 accepted in every run (97.9% acceptance). This predictable sequence is favourable to MTP and does not represent general coding throughput.
- Target CPU evaluated 130 tokens after transfer in every run, including priming and verification/rejection work.
- F16 K/V, FA disabled, compact SWA, one sequence, batch/microbatch256, threads8 / prefill16, same destination geometry.
- KV payload: 39,845,888 bytes (38 MiB). A: all shared, zero copied. B: zero shared, all copied.
- Both arms use the same GPU placement and explicit cached/coherent source allocation. Only CPU-view procedure discovery during the synchronous transfer differs. The B path invokes the existing bounded RAM-copy fallback. This is not a comparison with the old cross-process file handoff or with different allocation policy.
- Models were read-hashed once before testing, warming filesystem cache. Fresh processes do not mean cold disk/page-cache loads.

The fixed prompt asks for a JSON sequence of integers. The model emitted numeric values with `.0`, beginning `[1.0, 2.0, ...]`; the entire response prefix was identical across arms. It was intentionally stopped at128tokens and is not a complete200-element JSON array. This is a workload-equivalence check, not broad task-quality qualification.

## Build and timing harness

Fresh Release CMake CPU/base/llama/common/caller build: Clang22.1.8, O3/DNDEBUG, native CPU flags. Three handoff CTests passed. Vulkan translation unit compiled O3/DNDEBUG and linked as an isolated plugin using retained shader objects from the prior build. There is no LTO; an inherited link-only `-O1` argument does not change the translation unit's O3 optimisation. This is an optimised candidate, not a clean all-shaders release-distribution build.

Measurements used base `61edd155e` plus the then-uncommitted in-memory implementation, now committed as `d2028882b`. No inference source was changed for this experiment. `perf-main.cpp` includes the existing caller and wraps model/context loads, decode, handoff and releases. For B only, it temporarily filters `ggml_backend_vk_buffer_cpu_view` registry lookup, restoring it immediately afterward. Allocation hooks are not changed. There is no concurrent inference in a trial process.

The exact caller writes one `fwrite` per emitted token. A linker wrapper records output-ready timestamps, with `-fno-builtin-fwrite`; its count is checked against MTP's independent output counter. The final newline is not counted. Source model frees have explicit IDs. The reported warm decode rate is `(128-1)/(last_emit-first_emit)`, so it includes CPU target, assistant, sampling, rejection handling and output between those timestamps. It excludes first-token work. Timing is captured before the write; tokens accepted from one MTP batch arrive in bursts.

- Native timing-hook/selective-registry selftest passed.
- Metric parser/resource tests: 4 tests / 23 assertions passed.
- Runner and summariser syntax bundles passed.
- All model/prompt/binary identities, input/output counts, speculative counts and output SHA agree across valid runs.

A delegated harness review prompted removal of extra CPU synchronisation and explicit model-free IDs. Its general concern about fwrite/token identity is bounded by this exact caller's emit function and independent runtime token counter. Short runs are retained but stop the sustained screen below96outputs; no completed short run occurred.

## Resources, contention and cleanup

Every valid run used a systemd-owned unit: RuntimeMaxSec180, MemoryMax16GiB, MemorySwapMax16MiB, TasksMax256; native deadline170s. The runner sampled MemAvailable, worker swap, competing processes, temperatures and package throttle count every200ms. Host reserve6GiB and worker swap16MiB were hard guards; temperatures were recorded without changing hardware protections.

- All valid units peaked at11.5GiB and reported zero swap.
- All valid worker samples reported zero swap and no competing processes.
- Minimum available memory across valid runs was above15.6GiB.
- Peak recorded temperature91C; no package throttle-counter increase.
- One initial r4 attempt was aborted when PID848552 appeared. @whisper confirmed it was an accidentally started Go test during the hold. The guard killed the owned native worker; incomplete output and rc137 are retained at `runs/r4-aborted-contention/`, excluded from timing summaries. Fresh explicit exclusivity admitted one retry and the remaining runs. No second failed retry or additional benchmark was launched.
- The successful r4 retry and r5-r7 retained matching output/work. The fixed plan was not extended to search for a better result.
- Final native processes and owned containers are gone; last unit inactive/MainPID0. Gemma and speech units remained inactive/MainPID0 as before. Explicit window release was sent to @whisper.

## Interpretation and next boundary

For this optimised short-context sequence workload, use **about22.5 tok/s shared MTP3 decode**, **61 ms handoff**, and **6.9 s process-to-first-token**. The copied control achieved about20.5 tok/s with an82ms handoff. Most first-token latency lies outside KV transfer, so reducing a20ms copy cost cannot materially change a7-second startup path.

Longer populated KV might make transfer savings more significant, but the current38MiB payload does not establish that scaling. Model weight residency still dominates peak memory. No inference-server integration, deployment, release policy change, long-context capacity run or production before/after result was performed.
