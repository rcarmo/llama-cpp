# FP32 attention and microbatch interaction

> Historical deployment snapshot (10-11 September 2026). The [15 September in-process zero-copy service](../gemma-zero-copy-service-20260915/README.md) supersedes the service identity, ports, active flags and rollback targets below. Commands in this snapshot are not current operating procedures.

Microbatch1024 improved the saved64K FP32-attention tail by **7.11%**, but a fresh64663-token hybrid request took **715.246 seconds**, versus **691.385 seconds** with microbatch256: **3.45% slower** in a single temporal comparison. Keep256 for whole prefill and retain1024 as a measured tail-only option.

All eight tail requests passed recall/cache checks. Both the final tail state and the fresh64K state were finite, with a768-cell maximum sliding-window export. Native handoff into the unchanged CPU256 decoder reused64662 tokens and evaluated one; recall and append passed. Production was restored unchanged as PID626449, with configuration, argv, nine loaded-file hashes, tools, slots and cached append verified. No experimental deployment occurred.

## Question and fixed controls

Prior independent results established FP32 accumulation and larger-microbatch tail gains, but did not establish their combined effect. This campaign held the FP32 selector enabled in both profiles and changed only GPU microbatch256/1024, with batch1024, F16 KV, FA off and split-K unchanged.

The runtime is the same exact-IrisXePCI8086:a7a0 selector from checkpoint`0bdd7cd8b`, without a new build. The mapped Vulkan file hashes to`3d679dce59a861095089582b5a870b19d97e44d65ad7e24e2a77b02a697475b8`. Each timed tail records its actual mapped-file path/hash, argv and allowlisted environment. No profiler or dispatch trace was enabled.

Source inspection confirmed the selector's other-axis limit of1024 does not exclude1022 query columns. Pipeline choice still follows the existing shape/availability/alignment rules; no assumption of an identical tile across microbatches is required. The prior bounded compact-SWA export and native256/1024 layout controls are retained. A delegated source review timed out, so it supplied no review approval.

## Counterbalanced saved64K tails

Order was256,1024,1024,256,1024,256,256,1024. Each trial started a separate GPU worker, restored the same retained finite state and used the same fixture hash. Every request reused64658 tokens, evaluated1022 and generated21 tokens within a32-token budget. Beginning, middle and end keys were correct.

| Order | Microbatch | Prefill | Request wall |
|---|---:|---:|---:|
|0 |256 |27.650 s |34.174 s |
|1 |1024 |25.423 s |31.906 s |
|2 |1024 |25.222 s |31.609 s |
|3 |256 |27.142 s |33.692 s |
|4 |1024 |26.301 s |32.751 s |
|5 |256 |27.278 s |33.942 s |
|6 |256 |27.243 s |33.843 s |
|7 |1024 |24.212 s |30.743 s |

| Median, four runs/profile | FP32+256 | FP32+1024 | Time reduction |
|---|---:|---:|---:|
|Tail prefill |27.260 s |25.323 s |7.11% |
|Request including GPU answer |33.893 s |31.757 s |6.30% |

The candidate varies from24.21 to26.30 seconds, so individual observations remain important. These are contemporaneous comparisons within FP32 mode; the result does not quantify an additive gain against an earlier FP16 baseline.

After the last timed request, the candidate saved1108947140 bytes. The scanner consumed exact EOF, found no NaN/Inf, and verified two Gemma caches and at most768 sliding-window cells. Save/scan time is excluded from tail timings. This stage alone did not test CPU handoff.

## Fresh64K native handoff

A separately cleared single request used the same64663-token fixture as the preceding FP32+256 run. GPU1024 and CPU256 arguments were independently verified. CPU settings stayed at the retained`b10579-abdbeadfb`, decode8/prefill16, MTP3, F16 KV and FA off. Allocated capacity was two CPU128K and two GPU72K streams, with one populated conversation. GPU remained resident during handoff to match the retained comparison.

| Measure | FP32+256 control | FP32+1024 |
|---|---:|---:|
|GPU prefill |679.833 s |700.866 s |
|Prefill throughput |95.11 tok/s |92.26 tok/s |
|Prefill through first CPU answer |691.385 s |715.246 s |

Prefill was3.09% slower and measured total was3.45% slower. This is one temporal pair, with the earlier control retained rather than rerun. Startup, subsequent append and offline scan are excluded from both totals. The current save took6.94 seconds versus4.21 seconds in the control; this I/O difference contributes to the total but does not explain the prefill regression.

The GPU log reached32768 tokens at262.20 seconds versus254.28 seconds for256. Later progress also failed to reproduce the saved-tail ranking. A saved near64K state followed by one1022-token request and sustained fresh processing have different cache, thermal and allocation histories. These observations do not isolate which mechanism reverses the ranking. A switch to1024 for all context after32K is therefore not justified by the tail result.

Correctness gates passed:

- CPU restore reused64662 tokens and evaluated one.
- Beginning/middle/end recall and middle-key append succeeded.
- Append reused64684 tokens and evaluated15.
- KV values finite, exact parser EOF, bounded sliding-window export.
- CPU microbatch remained256, independently of the shared configuration subsequently updated for the GPU.
- Live full-run mapped-file hashes matched the earlier FP32+256 runtime; no new candidate binaries were built.

Cross-backend output equality was not an acceptance gate. This one recall task does not establish broad quality equivalence, populated dual128K capacity or native crash/fallback readiness.

## Preserved preflight failure

The first worker stopped before inference because the new identity check required the `.so.0.23.0` filename. The loader mapped the identical `.so.0` copy. Both hashes matched the expected runtime. `runs/batch-0-256/result.json` retains the failure and its empty request list.

The corrected check locates the actual mapped library under the strict retained-runtime prefix, then checks that file's hash. Hash validation was not relaxed. Measured requests use unique`measure-*` directories. Automatic production restoration ran after the failed preflight; no completed timing measurement was repeated.

## Resources and restoration

Speech clearance at21:03:08UTC covered the tail block; refreshed clearance at21:16:01UTC covered the single fresh64K request. Continuous guards checked nonterminal speech jobs, native CPU activity, CLI presence, incoming socket queues,6GiB available memory and16MiB maximum swap per trial process. Only trial-owned workloads were stopped; speech settings and private media were untouched.

The fresh run retained at least14694436KiB available memory (14.01GiB), compared with16.52GiB in the retained256 run. Peak summed trial RSS was16.28GiB and PSS11.55GiB; shared GPU allocations are not fully represented in those sums. Trial-process swap remained zero. Peak temperature was100C, annotated under the approved policy with hardware protection unchanged.

Both successful units completed normally and restored production through their stop hooks. Tail-stage restoration was verified as PID623463; final restoration as PID626449. Final health, original argv/config, nine mapped-file hashes, two131072-token slots and zero swap passed. Four explicit tool requests returned`23` under`none` and`auto`, then`RESTORED` with cached append. Historical implicit-answer tool failure remains preserved separately.

## Retained decision

- Retain FP32+256 as the best measured whole-prefill choice among these two profiles.
- Keep FP32+1024 for the measured saved long-tail workload. No global batch change or automatic phase switch was implemented.
- Split-K was not changed. Its interaction with FP32, sustained-tail scheduling and GPU/CPU residency effects remain unmeasured opportunities.
- Native worker crash/respawn, full fallback capacity and broad task quality still need qualification before deployment.

Seven offline audit tests/10 assertions cover medians, cache/fixture identity, actual microbatch, mapped-library hash, finite KV, CPU/GPU isolation and signed full-run regressions. The raw failed preflight, successful results, runtime identities, final scans and restoration records are exported with checksums. Runtime binaries, model files, large slot states and baseline environment files remain local.
