# Decode-only profiling and target batch-thread screen

At64K, the retained CPU/MTP workload spent **16.46 seconds in target verification** versus **1.72 seconds drafting**. An isolated, uninstrumented target batch-thread comparison then improved median generation from **7.15 to8.64 tok/s (+20.80%)** by using8 rather than16 target batch threads. Draft thread settings stayed unchanged.

This identified a dispatch opportunity. It is distinct from the subsequent small-batch code change, whose confirmed gain is16.52%; see the sibling `gemma-decode-smallbatch-20260910` evidence.

## Profile boundaries

Each of two fresh processes restored the same retained64K KV file, evaluated25 new prompt tokens and generated128 tokens. One used MTP3; the other was target-only. Both used CPU8/prefill16, F16 KV, FA off, compact SWA and two128K slots. No cold prefill or GPU ran.

Existing `GGML_CPU_WHOLE_TOKEN_PROFILE` and `GGML_SPECULATIVE_PROFILE` instrumentation was enabled. The former adds barriers. Its timings identify work but are not uninfluenced throughput measurements. Counters aggregate the25-token append plus generation; they do not isolate every projection shape. Logical byte estimates are not physical DRAM bandwidth.

| Profile | Matrix share of node wall | Attention-labelled share | Generated tokens |
|---|---:|---:|---:|
|MTP3 |85.96% |5.99% |128 |
|Target-only |84.85% |9.47% |128 |

The matrix family includes attention matrix products, so this does not establish that86% is weight projection work. MTP recorded37 target verification calls totalling147 rows,16.455 seconds;37 draft calls totalling111 generated proposal tokens,1.720 seconds. Output timings report110 offered drafts and90 accepted. These counters have different boundaries and are retained separately.

Both profiles recalled the three keys and reused64658 tokens. Instrumented outputs happened to match exactly; parity was diagnostic rather than an acceptance requirement.

## New factor, not a repeated thread screen

The previous broad thread screen changed decode/draft threads but left target batch threads at16. In the retained `abdbeadfb` source, `ubatch.n_tokens > 1` selects `n_threads_batch` and `threadpool_batch`. MTP3 verification commonly has four rows, so it uses the16-thread target batch pool even though ordinary one-token decoding uses8.

This new screen changed only `--threads-batch` on the target. Target decode8, draft decode8, draft batch16, MTP3 and every other parameter stayed fixed. No profiler was enabled. Order:16,8,8,16,8,16,16,8, with independent processes and identical KV restore,64658 cached/25 evaluated/128 output tokens.

| Median of four observations | Target batch16 | Target batch8 |
|---|---:|---:|
|Decode |7.1501 tok/s |8.6372 tok/s |
|Request wall, excluding startup/restore |19.632 s |16.334 s |

Gain:20.80% decode throughput;16.80% lower request time. All eight requests passed recall/cache checks and accepted90/110 drafts. This counting/recall fixture is not broad coding quality or proof of a global optimum.

## Decision and safety

Do not globally switch production prefill to8 threads: large CPU prefill previously benefited from16. The next candidate selects the decode pool only for small CPU Gemma target batches while preserving large-prefill and assistant settings.

Speech clearance at22:31:05UTC covered profiling;22:35:13UTC covered the uninstrumented screen. Both ran under bounded supervised maintenance with6GiB reserve,16MiB trial swap ceiling and continuous speech/native/socket guards. Trial swap was zero. The same newly deployed hybrid service was restored without reverting to the historical CPU-only unit. Its live CPU hashes were checked after the profile stage; later candidate rollout supersedes those historical PIDs.

The audit reconstructs profile phases and all eight raw screen results. One offline audit test/four assertions checks the rollup. Model weights, runtime binaries, private hybrid configuration and large KV states are excluded from exports. Historical maintenance scripts refer to the then-current hybrid release and must not be run against a newer deployment without updating their saved baseline.
