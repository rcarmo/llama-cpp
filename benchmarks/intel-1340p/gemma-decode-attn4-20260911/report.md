# Four-query F16 tile: 2.90% faster decode, deployed

The `20260911-attn4` release is live on port 8091. Eight counterbalanced 64K runs measured **8.5536 to 8.8020 tok/s (+2.90%)** over the deployed small-batch decoder. Median decode-request wall time fell **2.47%**, from 16.629 to 16.219 seconds. This is one counting/recall fixture with 128 generated tokens and four runs per mode.

## What changed

The CPU backend selects the existing `gemm<2,4,8>` tile for four-query F16 matrix products. It reuses each loaded row across four query columns instead of the retained 4-row/2-query tiling. The patch is opt-in with `GGML_CPU_EXPERIMENTAL_ATTN4=1`, restricted to the AVX2/F16C/FMA F16xF16 branch and excluded from reference execution. Eligible shapes have `n=4`, width 512, the other axis at least 32768, `m%16=0` and `k%8=0`.

`BN=1` gives one query-tile group; eight two-row blocks cover each 16-row job exactly once. Accumulation precision and state layout are unchanged. The shape gate can also match other matrix products; only the stated Gemma geometry was qualified.

The target small-batch patch remains enabled. CPU decode/prefill threads stay 8/16, draft threads 8/16, MTP depth 3, batch/microbatch 1024/256, F16 KV and FA off. The GPU FP32/256 profile and adapter code are byte-for-byte unchanged. Only the CPU backend library and its activation flag changed.

## Matched timing results

Each independently started worker restored the same state, reused 64658 tokens, evaluated 25 and generated 128. All outputs recalled the three fixture keys. Output hashes and draft counts matched: 110 proposed, 90 accepted. Tracing was disabled for timings.

| Order | Tile flag | Decode tok/s | Request seconds |
|---:|---|---:|---:|
| 0 | Off | 8.5217 | 16.699 |
| 1 | On | 8.8829 | 15.946 |
| 2 | On | 8.8716 | 16.067 |
| 3 | Off | 8.4182 | 16.812 |
| 4 | On | 8.7324 | 16.372 |
| 5 | Off | 8.5855 | 16.560 |
| 6 | Off | 8.6525 | 16.533 |
| 7 | On | 8.6090 | 16.536 |

The ranges overlap: the last candidate was slower than the fastest control. The earlier chat assertion that every candidate beat every control was incorrect. The failed audit assertion is retained in `failed-range-assertion.txt`; the median calculation is unchanged. The small sample does not establish broad non-regression or a global maximum.

Timing runs had zero worker swap, at least 22.40 GiB available RAM and a maximum recorded temperature of 78 C. Runtime maps were captured during qualification; timing workers were not retrospectively claimed to have per-run map captures.

## Correctness and qualification

- Eight native reference cases per mode passed: score/value matrices at 32K and 64K, query counts 1 and 4. Traces show all four intended n4 score/value shape families entering the 2x4 tile. The n1 controls do not use it.
- A 4K prefill pair measured 66.653 seconds off and 66.890 seconds on, a 0.36% difference. The large-prefill path is outside the tile gate; one pair gives limited timing assurance.
- Saved 64K state remained finite: zero NaN/Inf. Recall reused 64662 tokens and evaluated one. An independent tool slot returned quantity 23; the original long slot then reused 64684 tokens and evaluated 15 for the correct cached append.
- Focused offline audit/dispatch tests: 4 pass, 32 assertions. Existing adapter tests: 20 pass, 58 assertions. The delegated tile review found no bounds issue; the literal `BN=1` was checked against the retained scheduling code.

The two earlier build failures occurred before inference: missing local header search path, then missing C++ declarations for namespace-qualified diagnostic functions. Both logs and automatic restorations are retained. The third build passed. A later delegated evidence audit timed out without producing files; the audit was completed locally.

## Deployment and failed attempts

Rui had approved best-result production updates. Speech clearance was checked immediately and continuously; no STT configuration, media or transcripts were accessed.

1. An immediate pre-cutover verifier observed queued speech bytes and held before any service switch.
2. At 00:30 UTC, the first actual cutover aborted during GPU startup. Automatic rollback restored the small-batch release. Its exact libraries, tools, cache and zero CPU swap passed verification. The smoke recorded a generic `AbortError` without the guard reason. Systemd recorded a 186 MiB peak cgroup swap value; the affected worker and cause are unknown. The original failure is preserved under `failed-cutover-1/`.
3. Fresh speech clearance allowed one diagnostic attempt with unchanged candidate and limits. The smoke added explicit guard-reason logging and 500 ms CPU/GPU PID, RSS, swap and available-memory samples. At **00:36:53 UTC**, cold SSE, tools and three warm follow-ups passed. All 92 samples had zero CPU/GPU swap; minimum available memory was 16.755 GiB. The previous abort did not recur and remains unexplained.

The diagnostic smoke verifies a cold 5236-token GPU route with 5235 cached tokens and one CPU evaluation, SSE termination, `lookup_stock`, quantity 23 with both `none` and `auto`, and the cached `RESTORED` append. It checks exact CPU argv, both experimental flags, all nine pinned mapped files, two idle 131072-token slots and no GPU worker left running. This short production smoke does not itself exercise the long-attention tile; native 64K qualification supplies that coverage.

The production GPU admission/continuous guards remain unchanged: speech jobs, native activity, receive queues, 12 GiB startup/6 GiB continuous reserve and 16 MiB per-worker swap. The cutover smoke also guards CPU phases. Production CPU-only requests retain the existing adapter policy; no new permanent CPU admission policy was installed.

## Identity and rollback

- Patch checkpoint: `9fa044f6c3195078c77db00db0451240033f7050`, on the owner fork `https://github.com/rcarmo/llama-cpp.git`.
- Retained source: `abdbeadfb`; source path `ggml/src/ggml-cpu/llamafile/sgemm.cpp`.
- CPU backend SHA-256: `98c168824a2ee8e44115a3511de97ced820b1601b5d2e210fae2f589f24a12fa`.
- Live release: `/var/home/agent/.local/share/llama-gemma-hybrid/releases/20260911-attn4`.
- Verified supervisor/CPU: 660476/660496. The service is active with zero restarts and zero cgroup swap; no trial or rollback timer remains active. `deployment-check.json` records the timestamp and actual mappings.
- Previous release: `20260910-smallbatch`. The local `rollback.sh` restores its saved unit. Never use older campaign restoration scripts to overwrite a newer deployment.

Build products, model weights, multi-GB KV files and private baseline config stay local. The versioned export has safe raw results, source patches, tests, hashes and an offline reconstruction verifier. Historical heavy scripts require the retained local inputs, fresh speech clearance and a refreshed maintenance baseline.

## Remaining work

The paired-dot fallback candidate remains a separate negative result: 8.4995 to 8.4285 tok/s, 0.84% slower, with only n1 override coverage. It was not combined with this release.

Long-context coding-contract quality, fully populated dual128K operation and cancellation during every native phase are still unqualified. The earlier GPU-startup abort warrants resource observation before another production change. Further decode work should profile the deployed tile's remaining n1 attention and projection costs, then test a specific candidate with the same saved-state controls. Completed thread, MTP, FA, paired-fallback and four-query comparisons do not need to be repeated without a new question.
