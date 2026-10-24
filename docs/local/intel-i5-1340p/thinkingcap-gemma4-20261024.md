# ThinkingCap Gemma 4 and five-model CPU comparison - 24 October 2026

Nemotron Lightning was fastest in the measured CPU replay. ThinkingCap passed all six uncapped coding tasks and 1,053 assertions. Its selected eight-thread setting improved sustained replay decode by about 4.5% over four threads.

## Hardware and software

Sigma: Intel Core i5-1340P, about 31 GiB RAM, Linux x86_64. The campaign checkout was `fc3fee3088d5a4802b8cdc49e34ba177765adbc1`. Native runtime libraries and the active server were preserved throughout the experiment: version 0.7.0-dev, build 12482, commit `8999b4061`, GNU 16.1.1. The experimental replay executable was rebuilt against those libraries with separate output paths. This experiment changes no production architecture or handoff admission guard. Per-trial thermal measurements were not collected.

## Resource groups

- Original ThinkingCap/Flint runs: 20 GiB execution ceiling and 6 GiB host-available guard.
- New base Gemma 4/Qwen 3.6/Nemotron runs: 23.25 GiB ceiling, frozen from available RAM after unloading ThinkingCap, minus 2 GiB headroom. Zero process and cgroup swap was required.
- The groups are retained separately. Qwen Q4_K_XL alone exceeds 20 GiB. These measurements do not rank all five deployments under the old ceiling.
- Memory estimates include the entire GGUF backing plus non-model RSS. Cgroup memory and swap receipts are also retained; incremental cache charges alone understate a mapped model.

## Matched replay configuration

All five models used four decode workers and 16 prefill workers, strict requested masks `0x55`/`0xffff`, physical context 4096, batch 512/microbatch 128, F16 K/V, flash attention off, mmap/no_host/no repack, and no draft/speculation. Each process warmed its exact workload before two measured repetitions. Source text was fixed and tokenised separately per model. Equal token counts cover different text lengths. Decode is teacher-forced; model loading, logit hashing, sampling and HTTP are outside the timed kernel phases.

### 512-token prompt and 64 replayed tokens

| Model | Quantisation | Budget GiB | Observations | Prompt tokens/s | Decode tokens/s | Peak estimate GiB |
|---|---|---:|---:|---:|---:|---:|
| ThinkingCap Gemma 4 | MXFP4_MOE | 20.00 | 4 | 40.99 | 10.13 | 15.96 |
| Flint | UD-Q3_K_XL | 20.00 | 4 | 38.66 | 12.91 | 17.51 |
| Base Gemma 4-26B-A4B | MXFP4_MOE | 23.25 | 4 | 40.16 | 10.37 | 15.95 |
| Qwen 3.6-35B-A3B | UD-Q4_K_XL | 23.25 | 4 | 41.72 | 12.02 | 21.11 |
| Nemotron 3.5-Lightning-30B-A3B | Q4_0 | 23.25 | 4 | 48.02 | 13.80 | 17.80 |

### 2048-token prompt and 64 replayed tokens

| Model | Quantisation | Budget GiB | Observations | Prompt tokens/s | Decode tokens/s | Peak estimate GiB |
|---|---|---:|---:|---:|---:|---:|
| ThinkingCap Gemma 4 | MXFP4_MOE | 20.00 | 4 | 38.67 | 9.55 | 15.97 |
| Flint | UD-Q3_K_XL | 20.00 | 4 | 35.74 | 12.21 | 17.54 |
| Base Gemma 4-26B-A4B | MXFP4_MOE | 23.25 | 2 | 38.80 | 9.80 | 15.97 |
| Qwen 3.6-35B-A3B | UD-Q4_K_XL | 23.25 | 2 | 40.39 | 11.66 | 21.12 |
| Nemotron 3.5-Lightning-30B-A3B | Q4_0 | 23.25 | 2 | 47.44 | 13.28 | 17.82 |

Rates pool tokens and elapsed kernel times. All 34 cross-model observations passed full-vocabulary finite-logit checks. Original model order was A/B/B/A. New short-prompt order was G/Q/N/N/Q/G, yielding four observations/model. New 2048-token runs were two-observation screens, without a reverse-order confirmation. Few-percent differences need caution given sparse samples and missing thermal traces.

## ThinkingCap optimisation and service

The 64k screen tested decode 4/6/8/12/16, physical/mixed/SMT placement, unbound affinity, flash attention and microbatch 128/256/512. Eight P-core SMT workers, mask `0xff`, microbatch 128 won. Eight independent ABBA/BAAB confirmations used 512 prompt and 256 replayed tokens: original 4P 9.95 versus 8P-SMT 10.40 decode tokens/s, about 4.5% faster, with about 17.72 GiB footprint. All eight full-logit hashes matched for this identical workload. Microbatch 256 did not beat the winner.

After the original uncapped suite and all comparisons finished, the original 4P service was restored and checked. The 8P-SMT setting was then applied to the same model and runtime. All other server CLI arguments match the original. HTML returned 200 and an uncapped SSE request ended naturally with final `READY` and `[DONE]`. The current endpoint is `http://192.168.1.70:11434/`, alias `ThinkingCap-Gemma4`, physical context 65536, one slot, reasoning on, output/reasoning budgets -1, no context shifting, temp 1/topP.95/topK64/minP0/seed 42. Boot startup is disabled. The current guard freezes available RAM minus 2 GiB and enforces zero swap. No unrelated service was restored.

The original 4P container and guard remain available for rollback. Stop `thinkingcap-gemma4-p8-webui`, wait its guardian to exit, then run the retained original-baseline guardian. Do not start either while an answer or comparison is active. The checked-in launch scripts are captured host-specific evidence, not boot-service installers.

## Coding quality and recorded latency

ThinkingCap and historical Flint each passed the same six frozen tasks and 1,053 assertions. ThinkingCap used HTTP SSE with explicit reasoning and temperature 1; historical Flint used the earlier native greedy path. Their tokenisers, contexts, transport and samplers differ. Latencies below describe those runs and are not a controlled training-quality comparison. Flint wall/generation times include a SIGSTOP/SIGCONT publication pause with model/KV/sampler state preserved; they cannot establish an answer-latency speedup. The 8-thread setting has replay and API smoke evidence; the full coding cohort ran on 4P. Base Gemma 4, Qwen 3.6 and Nemotron have no new coding-quality result in this campaign.

| Task | ThinkingCap tokens | Recorded wall s | Flint tokens | Recorded wall s | Assertions |
|---|---:|---:|---:|---:|---:|
| csv-row | 5968 | 640.5 | 6095 | 1128.2 | 33 |
| merge-patch | 3119 | 329.9 | 2220 | 231.4 | 9 |
| async-map | 4020 | 420.7 | 6013 | 650.3 | 22 |
| subtract-ranges | 2304 | 240.2 | 1621 | 136.8 | 890 |
| round-decimal | 7801 | 846.4 | 10253 | 1367.3 | 23 |
| glob-match | 4644 | 531.3 | 4731 | 474.3 | 76 |

Answers ended naturally. No repair, retry, output/reasoning cap, generation deadline or context shift was used. Only the unsafe-code scorer has a 10-second execution limit. The earlier 1024-token Flint calibration failures remain separate. ThinkingCap HTTP captures do not expose native logit finiteness. Publisher BF16 accuracy and reasoning-reduction claims have not been reproduced locally. Replay throughput does not measure time to a completed answer.

## Rejected and untested paths

- The first standalone harness inherited full SWA instead of the server compact cache, allocating 12800 MiB rather than 250 MiB sliding KV. Seven starts exceeded the 20 GiB guard before timing; no speed result was accepted. Corrected runs explicitly set compact SWA.
- Microbatch 512/FAoff was rejected before allocation at 21785539904 bytes. Full CPU repacking also exceeded the original guard. ThinkingCap retained its recommended MXFP4_MOE quantisation.
- Short GPU handoff qualification stopped on startup telemetry admission before timing. The 64k GPU bound 23071322552 bytes exceeded 20 GiB. No useful GPU expert-cache parent or trained handoff was qualified. These exclusions are not a feasibility result under the later 23.25 GiB budget.
- Partial CPU repacking, releasing redundant mmap regions and compiler changes were researched but not implemented. Further tuning was stopped to prioritise the requested model comparison. Populated 64k capacity and full quality noninferiority were not tested.

## Evidence and reproduction

See the [campaign evidence and reproduction instructions](../../../benchmarks/intel-1340p/thinkingcap-gemma4-20261024/README.md), [per-repetition CSV](../../../benchmarks/intel-1340p/thinkingcap-gemma4-20261024/results.csv), [structured results](../../../benchmarks/intel-1340p/thinkingcap-gemma4-20261024/summary.json) and [prior-feature reuse checklist](../../../benchmarks/intel-1340p/thinkingcap-gemma4-20261024/reuse.md). Exact model revisions, byte sizes and SHA256 values are in the [download manifest](../../../benchmarks/intel-1340p/thinkingcap-gemma4-20261024/models.json). Model files, runtime binaries and build caches are excluded.
