# Bonsai 2.5 on Sigma: native Iris Xe replay

The [FP32 follow-up](fp32/README.md) reduced trained 512+64 Iris Xe replay to 61.55 s at a 128-token microbatch. The results below are the original CPU and Vulkan comparison. Microbatch 512 still produces sparse logits. Bonsai is not deployed.

Iris Xe raised Bonsai decode from 2.247 to 4.351 tokens/s and cut 512+64 replay wall time from 193.610 to 81.394 seconds. The GPU result is still 2.80x slower than the retained Inkling CPU replay. Prefill accounts for about 82% of Bonsai's GPU time.

| Profile | Prefill tok/s | Decode tok/s | 512+64 wall time |
|---|---:|---:|---:|
| Bonsai, AVX-VNNI CPU | 3.101 | 2.247 | 193.610 s |
| Bonsai, Iris Xe PTQ1 integer dot, ubatch 128 | 7.685 | 4.351 | 81.394 s |
| Inkling 2 Mini, retained production CPU replay | 24.666 | 7.718 | 29.084 s |

Bonsai used the same pinned PTQ1 model, token stream, replay executable, CPU library, 8192-token context, 512/128 batch/microbatch, F16 KV and Flash Attention off. The CPU profile used 12/16 threads and explicit masks `0xff55/0xffff`; the GPU profile offloaded all 66 reported layers with `GGML_VK_INTEL_PTQ1_MMVQ=1`. All timings exclude a full workload warmup. There was one CPU observation and two fresh GPU observations. The GPU wall times were 81.432 and 81.356 seconds. A separate 32+2 diagnostic observed the trained model requesting the new shader; profiling was disabled for the timed arms. There was no trained Vulkan flag-off control, so the end-to-end gain is for the GPU profile versus CPU, not the isolated contribution of the shader.

The retained Inkling run used the same replay fixture family and token counts but a different tokenizer, context and serving profile. It is a historical fixed-work reference, not a simultaneous or task-quality comparison. The teacher-forced continuation measures decode work; it does not measure natural generation, tool use or long-context quality.

## Correctness and rejected geometry

- Both ubatch-128 GPU processes produced the same full-logit hash across 64 positions, bit-identical saved logits at the first eight positions and identical argmax sequences. CPU and GPU argmax agreed at 63/64 positions; cross-backend logits are not bit-identical.
- Ubatch 512 (one time-separated observation) brought prefill to 7.887 tok/s, decode to 4.346 tok/s and wall time to 79.716 s, a 2.06% improvement. Reject it: none of its 64 argmaxes agreed with ubatch 128. Each of its eight saved 248,320-entry frames held just four nonzero values, all at indices 0-3. Finite output alone was insufficient. The fault is not yet isolated to graph execution, output selection or readback.
- Physical operator replay did not reproduce the fault: five bulk PTQ1 matrix fixtures passed; three grouped GDN fixtures with 16 Q/K heads and 48 value heads passed at 128/256/512 tokens. Five additional GDN fixtures passed. A standalone full-width vocabulary test hit the 4 GiB synthetic cap and yielded no result; a reduced-inner-dimension fixture retained 248,320 output rows and passed both opt-in and default paths (2/2 each). These are isolated operators and do not clear the trained graph.

## Lifecycle and next gate

Both maintenance windows exited successfully and restored the exact Inkling container/configuration/mounts, runtime hashes, embedded UI and kernel limits. Peak conservative accounting was 13.41 GB for the timed ubatch-128 GPU pair, 13.79 GB for the dispatch probe and 13.92 GB for the rejected ubatch-512 screen. These totals count full backing, accounted DRM residency, non-model RSS and supervision. Native swap/OOM events were zero. Production is healthy, and all trial workers stopped. The primary dirty patch and untracked list are unchanged. No deployment or push.

The four-logit fault reproduced with no warmup. Disabling Vulkan async transfers, disabling the new PTQ1 shader, disabling graph reordering and disabling Vulkan fusion did not restore the missing logits. Every control had four nonzero entries in each of eight saved frames. The no-warmup runs were diagnostic; their timing is excluded. The initial graph-control launcher exited before loading the model due to shell syntax; the corrected frozen sibling completed all three arms. Both controllers restored Inkling exactly.

Do not repeat completed arms unchanged. Before a longer run, trace the trained `result_output` tensor and the host logits buffer across the 512-token prefill-to-decode transition. Distinguish a wrong producer or buffer binding from an incomplete copy; the existing flags did not identify a cause. Profile prefill on the viable ubatch-128 profile before selecting a throughput patch. The 2048+64 and practical cold/warm text/tool comparisons were not run: neither geometry closes the fixed-work gap, and ubatch 512 failed correctness.

## Earlier CPU API checks

The model is `Ternary-Bonsai-2.5-27B-PTQ1_0-mtp.gguf` from [the pinned Prism release](https://huggingface.co/prism-ml/Ternary-Bonsai-2.5-27B-GGUF/tree/28a7093cc25bc151cc2b284c5570f12ce343fdcf), Apache-2.0, 6,232,818,944 bytes, SHA-256 `e0fc5f3d47b9c926d52677d303b19df356a2376614b3e1cb9973865fc04ca431`.

- [Original CPU controls](cpu-baseline.json): literal completion at 1.366 tok/s and automatic synthetic tool selection at 1.368 tok/s. The server ignored the object-shaped named `tool_choice`. This was not a forced-tool test.
- [Bundled MTP controls](cpu-mtp.json): six bounded cases passed (literal, automatic tool call, synthetic result, cancellation, malformed request and recovery). Across completed requests, 164 of 243 drafts were accepted. Maximum depth 3 was slower for both retained controls: 1.065 vs 1.366 tok/s for the literal and 1.326 vs 1.368 tok/s for the tool request. It was rejected for that CPU profile and not retested with the faster kernel.
- [Register-decoding ABBA](cpu-abba.csv): the four identical 21+64 literal requests went from 1.373 to 2.194 generation tok/s and 57.51 to 35.91 seconds. The candidate kept scalar floating-point order and passed 2,555,904 exact raw mapping checks, 384 random dot comparisons and the existing x86 suite. The vendor-style vector floating-point accumulation failed the existing tolerance and was rejected.

## Evidence and reproduction

- Exact measured source base: `d7edd02b738863fac727ded639530d453064d82a`. The owner-fork publication carries the same tested PTQ1 source files in `c68d246f7` and `67dc76be2`. Native timings remain associated with the measured base.
- [Hardware operator results](iris-xe-operators.md), [native JSON](native-replay.json), [geometry](geometry.json), [graph controls](graph-controls.json) and [sampled logit differences](logit-metrics.json).
- A test-only build needs `GGML_NATIVE=ON`, `GGML_VULKAN=ON`, `LLAMA_BUILD_TESTS=ON`, `LLAMA_BUILD_SERVER=OFF`, and the repository's `make agent-configure` and `make agent-build` wrappers. Verify the physical Intel device and the host's limits. An approved, exclusive model window with verified restoration is separate from compilation and operator tests.
- Before timing, run `test-x86-quant-dot` through CTest and check `test-backend-ops test -b Vulkan0 -o '^MUL_MAT$' -p '^type_a=ptq1_0,type_b=f32,.*n=(1|2|4|8),' -j 1`. Test with the opt-in unset, with `GGML_VK_INTEL_PTQ1_MMVQ=1`, and with `GGML_VK_DISABLE_MMVQ=1` overriding the opt-in. Use `GGML_VK_PIPELINE_STATS=mul_mat_vec_ptq1_0_q8_1_f32` for dispatch diagnostics only. The physical regression expects 34 supported passes in each arm. The [bulk PTQ1](ptq1-prefill-shapes.txt), [grouped GDN](grouped-gdn-shapes.txt) and [wide output](vocab-small-k-shapes.txt) fixtures use `--test-file` instead of `-o`/`-p`.
- For synthetic timing use `test-backend-ops perf -b Vulkan0 --test-file ptq1-shapes.txt` in ABBA order with profiling off. For native replay use [replay.cpp](replay.cpp), built with the selected source's headers and `llama-common`, `llama`, `ggml` and `ggml-base` shared libraries. `BONSAI_USE_GPU=1` selects Vulkan0 and requires the separate PTQ1 opt-in; `BONSAI_USE_GPU=0` selects CPU. Use 512/64 tokens, one full warmup, one measured replay, 12/16 threads, masks `0xff55/0xffff`, context 8192, 512/128 batch/microbatch, F16 KV and Flash Attention off. Replay is teacher-forced and does not provide API qualification.
- Full native logs, binary closures, raw logits, private host controllers and model files remain in the local workspace. The committed evidence excludes executable binaries, model data and service snapshots.
