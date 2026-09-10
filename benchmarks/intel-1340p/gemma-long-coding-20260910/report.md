# FP32 attention selection in a 38.7K coding loop

The exact-IrisXe FP32 selector reduced median cold prefill by **2.09%** and summed request-route time by **1.99%** in one ABBA block at 38666 initial tokens. All four coding tasks passed. Warm CPU request time changed by **-0.56%**, with the same four rounds and 213 generated tokens in every run.

The original CPU service was restored unchanged as PID620161. Health, two131072-token slots, argv, config, nine loaded-file hashes, explicit tool results and cached append passed. Production-process swap was zero. No hybrid route or candidate library was deployed.

## Why this test

The earlier aligned median coding task had3216 tokens. It never reached the selector's32768-axis threshold. This test increased only its synthetic review-record padding from150 to1800 lines and compared normal versus FP32 selection using the same hybrid route. Tokenisation produced38666 tokens in each run; exact cold fixture hashes match.

The preceding selector campaign already established an8.10%64K-tail prefill reduction, six of six native numerical passes versus four of six baseline, and one finite64663-token hybrid request in691.385 seconds versus746.817 seconds. Those tests were not repeated here. See the sibling [GPU attention evidence](../gemma-gpu-attention-20260910/report.md), fork checkpoint`0bdd7cd8b`.

## Fixed configuration

- Normal/FP32/FP32/normal order, independent trial processes, two runs per mode.
- Same previously built exactPCI8086:a7a0 long-F16/F32 selector runtime; no new build, shader, split-K or microbatch changes.
- GPU F16 KV, FA off, batch1024/microbatch256, two72K streams; one populated conversation.
- Retained CPU`b10579-abdbeadfb`, decode8/prefill16, MTP3, F16 KV, FA off, compactSWA, two128K streams.
- Padded compact export and validatedv3-to-v2 handoff; GPU stopped before first CPU decode; all later rounds CPU-owned.
- Same median task: read source, fix even-length result, throw on empty input, preserve input array, run independent unchanged tests and give a nonempty final answer.

The mode environment variable is supplied to both trial processes by the inherited harness. Live map inspection confirms the CPU has no Vulkan backend, so it cannot execute the selector. `runtime-provenance.json` captures the first FP32 coding run; every mapped-file hash matched the preceding full64K runtime. Baseline history was not rewritten to fabricate an earlier live capture.

## Measurements

| ABBA run | Mode | GPU prefill | Summed request-route time | Warm request-route time |
|---|---|---:|---:|---:|
|0 |normal |337.635 s |383.293 s |31.625 s |
|1 |FP32 |331.844 s |376.367 s |31.425 s |
|2 |FP32 |331.514 s |376.030 s |31.711 s |
|3 |normal |339.892 s |384.380 s |31.865 s |

| Median, two runs per mode | Normal | FP32 | Time reduction |
|---|---:|---:|---:|
|GPU prefill |338.764 s |331.679 s |2.09% |
|Cold request route |352.092 s |344.630 s |2.12% |
|Warm request routes |31.745 s |31.568 s |0.56% |
|All request routes |383.837 s |376.198 s |1.99% |

Request-route time includes rendering/tokenisation, inference and routing. Cold route includes GPU startup, prefill, save, conversion, CPU restore, GPU shutdown and the first CPU answer. Initial CPU startup and external tool execution are excluded. It is a sum of request latencies, not complete task elapsed time. Output and tool counts were identical, reducing one common timing confound.

The normal runs took253.68/255.03 seconds to report32768 processed tokens; FP32 runs took254.89/254.64 seconds. Subtracting those rounded progress times from final prefill gives remaining durations83.955/84.862 seconds versus76.954/76.874 seconds: an estimated8.88% reduction after32K. This phase estimate uses host progress logs, not a separate GPU profiler, but agrees with the selector gate and retained64K-tail result. Most of a38.7K prefill occurs before that gate, explaining the smaller whole-prefill gain.

Two observations per mode do not establish broad task-quality equivalence or a tight timing confidence interval. The small warm difference is not evidence of a CPU decoding optimisation.

## Task and cache checks

All four runs read before edit, changed only the synthetic source, ran the agent-requested tests, passed an independent final test run, left test files unchanged and produced a nonempty final answer. Each generated213 tokens across four rounds. The successful repair was identical across completed runs; exact code equality was diagnostic, not an acceptance rule.

First CPU responses reused38665 tokens and evaluated one. Warm cached counts were38685,38873 and38895; evaluated counts56,14 and108. The strengthened offline audit compares each warm cache to the preceding rendered prompt plus generated output, allowing two boundary tokens. It also requires cached plus evaluated tokens to equal the current prompt length. No warm GPU reroute occurred.

A delegated harness review identified the timing boundary, weak initial warm-cache audit and partial-audit status ambiguity. The offline audit now checks growing-prefix reuse; `complete` and `all_tasks_pass` must both be true for a completed block. The native harness was not changed during the runs. Six offline tests/13 assertions cover timing aggregation, retained task failure, fixture mismatch, warm reroute, growing-prefix loss and swap rejection.

## Safety and restoration

Rui resumed the optimisation goal at20:18:32UTC. Speech clearance at20:23:05UTC covered this single block, with continuous job/native/socket guards. The supervised unit ran from20:31:39UTC and completed successfully inside its35-minute absolute cap. Minimum available memory was16.47GiB, peak summed trial RSS16.29GiB, and trial-process swap remained zero. All runs reached100C; temperatures were annotations under the approved policy and hardware protection stayed enabled.

`gemma-long-coding-20260910.service` is inactive with result`success` and exit status0. Restoration revalidated original service/config/library identity and two idle slots. Four requests exercised an explicit tool call/result under`none` and`auto`, followed by append; responses were`23` and`RESTORED`, with145 cached/22 evaluated tokens on append. The historical implicit-answer empty response remains preserved separately.

Speech services, private media and production configuration were untouched. No native trial is left running.

## Retained decision and next work

Keep the FP32 selector as an opt-in experimental long-context improvement. It now has numerical controls, repeated64K-tail timing, one full64K finite handoff and a real38.7K coding/tool block. Gains vary with how much work crosses the32K gate. This evidence does not require replacing the retained CPU8/MTP3/GPU256/FA-off choices or discarding earlier conditional branches.

The next performance question is whether a phase-specific combination with the retainedmicrobatch1024 or split-K candidate adds benefit without the previously measured whole-prefill regression. That requires a separately prespecified guarded comparison; no combination has been measured here. Native worker crash/respawn, full dual128K load, large fallback and broad task quality also need qualification before deployment. A global maximum has not been established.

## Reproduction

`verify-offline.sh` checks the export hashes, reruns six audit tests, reconstructs the four-run rollup from raw records and verifies recorded restoration evidence. It performs no inference or live service calls. The historical native runner needs the retained model/runtime and explicit maintenance approval. Large slots, runtime binaries, service environment files and private data are excluded from exports.
