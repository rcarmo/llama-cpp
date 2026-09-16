## Qwen3.8-27B GSQ-RCO evaluation -- measured results and unresolved parity

RTX 3060 12 GB; merged source 72035c65a; verified CUDA build in build-gsq-cuda. Eight source regression tests pass. Previous service is stopped as requested. GPU results exclude the accidental CPU-only run.

## Current network defaults

The launcher defaults to `0.0.0.0:11434` (Ollama's customary port), exposing
its OpenAI-compatible API at `http://<host>:11434/v1`. No authentication is
configured: use only on a trusted LAN and restrict access with a firewall.
Set `HOST=127.0.0.1` for local-only access; `PORT` also remains overridable.
This network change does not alter the model or inference settings below.
Historical benchmark records retain their original port 19450.

## Latest upstream rebuild: 2026-09-14

Measured source: `a380f11b5`, merging origin `661643e43`. Published in
`3de2e2f6f` after merging parallel benchmark reports; that merge did not change
runtime source. The fresh `build-gsq-cuda` server used the RTX 3060. All three
three-turn `qwen-agentic.ts` tasks and 8/8 targeted regressions passed.

| Metric | Median | Range |
|---|---:|---:|
| Tool-result prefill | 446.0 tok/s | 422.2-453.6 |
| Final-response decoding | 32.9 tok/s | 31.1-33.5 |
| Three-turn task time | 21.96 s | 21.64-22.26 s |

Prefill covers 5,326 newly processed tokens with 361 cached tokens. The final
response generates 245 tokens after processing 77 new tokens with 5,712 cached.
Runs two and three also reused 332 tokens from the initial prompt. Task times
are therefore not three cold-start measurements. These are task-specific
server timings, not a matched speedup comparison against the earlier fixed-work
benchmark. No thermal telemetry was collected for these three runs.

The launcher `tools/pi/bin/run-qwen38-gsq-cuda.sh` now defaults to the verified
`build-gsq-cuda/bin/llama-server`, with `LLAMA_SERVER` still available as an
override. Tested defaults remain IQ2_S adaptive quant, full GPU offload, 65,536
context, one slot, q4_0 K/V, batch 2048, ubatch 256, four CPU/batch threads,
flash attention on, MTP4, and async CPU scheduling off. No hardware controls
were changed. Exact plain/MTP parity and the earlier comprehension smoke-test
failure remain unresolved; these task passes do not establish general quality.

Run summaries and regression output are in
`tools/pi/benchmarks/results/gsq-opt/origin-agentic/`. Reproduce with the launcher
running, then execute from the repository root:

```sh
BENCH_URL=http://127.0.0.1:11434 bun tools/pi/benchmarks/qwen-agentic.ts /tmp/gsq-agentic-run
```

The sections below retain the earlier evaluation history.

## Artifacts

| Variant | Bytes | SHA256 |
|---|---:|---|
| IQ3_XXS MTP | 10442827840 | 63f29a2189a6b4cc31f81e093d3856ad293a5583114439f41ae1ed7af4093262 |
| IQ2_S MTP | 9607981120 | e6406238a5cc0043775cd1963b6f9e5b8707400276e38d9fde742304906b1330 |

Both match ISTA-DASLab's published hashes. These are mixed per-tensor quantizations, not uniform IQ types.

## Speed

IQ3_XXS, 8K, full GPU offload, q4_0 K/V, batch512/ubatch256, four threads:

| Mode | First three-run median decode tok/s | Repeat median | Tool task first/repeat seconds |
|---|---:|---:|---:|
| Plain | 19.81 | 16.68 | 31.15 / 32.60 |
| MTP1 sync | 28.51 | 26.40 | 25.60 / 26.28 |
| MTP1 async | 25.46 | 25.50 | 25.86 / 26.20 |

MTP improves this workload. Generalised async scheduling provides no repeatable task gain over synchronous MTP on this fully GPU-resident model. Expert-cache relocation and MoE expert staging do not apply to this dense architecture. No new kernel speedup has been established.

IQ2_S full GPU at64K, q4 KV, ubatch256: median decode29.21 tok/s, tool task27.21s. IQ3_XXS at64K with61 GPU layers: decode15.34--15.75 tok/s. Smaller weights avoid the partial-offload penalty.

IQ2_S at32K with ubatch512: q8 KV median25.07 tok/s and27.07s tool task; q4 KV median24.70 tok/s and26.95s task. These runs change context and microbatch together and cannot isolate either effect. Prefill remains around367--370 tok/s. No demonstrated benefit from this tuning; the same-context microbatch comparison is recorded below.

## Context and resilience

IQ3_XXS full GPU fits32K at approximately11236 MiB observed usage. Its31,689-token tool conversation passes, as do cancellation and subsequent recovery. At64K full GPU, q8 fails target KV allocation; q4 fails MTP KV allocation. Reducing to61 GPU layers fits but slows short-task decode.

IQ2_S full GPU, q4 KV fits64K. An actual60,388-token beginning-of-context retrieval returns ORCHID-7391 correctly in204.48s. A doubled prompt returns HTTP400; the following request succeeds. This is one synthetic retrieval fixture, not proof of general long-context reasoning quality.

## Correctness and unresolved findings

Arithmetic, sorting, extraction and constrained JSON pass. The Python trace `sum(v*v for v in [2,4,6] if v>2)` should return52: IQ3_XXS returns28 in plain, sync MTP and async MTP; IQ2_S returns32. This rules out an MTP-only cause for that fixture, but does not distinguish base-model limitations from quantization effects.

Three-turn repository tool tasks pass. Long-form256-token deterministic output is reproducible within each mode, and sync/async MTP outputs match for all three decode trials. Plain and MTP outputs differ. Their common introductory text diverges at the first section heading. Exact MTP/plain parity therefore FAILS; batch-shape numerical differences are a hypothesis, not an established root cause. The target-logit diagnosis below bounds this failure without claiming a fix.

## Evaluation scope

The additional checks below complete the local capacity, speed and correctness evaluation. This is not a comprehensive model-quality benchmark. Exact plain/MTP parity failed and remains an unsupported property of the tested configuration; investigating the specific kernel or state-update cause is follow-up engineering, not a claimed fix.

## Additional completed checks

Expanded ten-case exact-answer suite: both quants pass9/10. Logic, Unicode copying, missing-data abstention, unit conversion and a simple Python loop also pass. The comprehension fails consistently (IQ3:28; IQ2:32). This small suite cannot establish broad quality equivalence between quants.

Controlled IQ2_S32K/q4 comparison: ubatch256 median decode25.75 tok/s, task27.84s, prefill362.88 tok/s; ubatch512 median24.70 tok/s, task26.95s, prefill366.83 tok/s. Measurements favour different settings for decode versus tool latency; there is no clear overall winner from one task per setting.

Parity diagnosis: q8 KV also diverges, ruling out a q4-specific failure. With MTP context present but draft verification excluded (`--spec-draft-n-max 1 --spec-draft-n-min 2`), all three256-token trials exactly match plain output. Replaying the common prefix as a prompt produces identical first-token probabilities in plain/MTP. Divergence therefore requires active speculative execution; batching/state differences remain candidate causes. No root-cause fix has been verified. A ubatch1 probe aborts at `llama-batch.cpp`'s `n_ubatch > n_keep_tail` assertion and is an invalid configuration.

## Practical choice and limits

For capacity and measured speed, IQ2_S MTP1 with64K, full GPU offload, q4_0 K/V, batch2048/ubatch256 and four threads is the best tested candidate. It completed60,388-token retrieval. Exact plain/MTP output parity is not guaranteed by these results; use plain decoding if that is required and accept lower throughput. Do not enable async or expert relocation expecting extra speed: async did not demonstrate a task gain, and expert relocation does not apply to this dense model.

No service is selected for deployment. The previous service remains stopped by request. No claim is made about128K, vision, broad multilingual reasoning, calibrated perplexity, or upstream-versus-fork kernel speed. These were not tested. The long-context fixture is retrieval rather than general reasoning, and performance samples are small with visible run-to-run variation.

## Reproduction

Build with `tools/pi/bin/build-cuda-verified.sh`. Start the server with the exact model, context, KV and placement settings above, listening on127.0.0.1:19450. Run:

```bash
bun tools/pi/benchmarks/gsq-evaluate.ts results/quality
BENCH_URL=http://127.0.0.1:19450 bun tools/pi/benchmarks/qwen-agentic.ts results/tools
bun tools/pi/benchmarks/gsq-context.ts results/context.json
```

The context runner requires64K. Evaluation records failed assertions in its summary rather than suppressing them. Raw request/response files, launch scripts, logs and the diagnostic probes accompany this report in the downloadable archive. The evaluation is complete with an explicit limitation: plain/MTP parity is unsupported. No root-cause fix or unconditional correctness guarantee is claimed.

## Target-logit diagnosis

Temporary raw-logit instrumentation at sampling confirms a target-ranking change at the first divergent token in the q8 probe. Plain evaluation: token561 (` The`) logit22.2424011 versus token357 (` A`)22.2401543, margin0.00224686. Speculative target verification: token357 logit22.3276176 versus token56122.2993927, margin0.02822495. MTP emits its target's top token. This observed divergence is therefore not a draft acceptance mismatch: target evaluation itself differs under speculative execution. It does not establish whether the underlying difference is purely floating-point accumulation or an erroneous state update. That lower-level distinction remains unresolved. Instrumentation was removed and the standard binary rebuilt.

The divergence also persists with f16 KV and Flash Attention disabled. Neither q4 KV nor Flash Attention alone explains it. Exact parity must not be promised for this tested model/configuration.

## Persistent serving: 2026-09-16

The unsupervised process stopped on September 15. Its log ended with graceful
cleanup, but did not identify the trigger; this was not established as a CUDA
crash. A transient user service restored serving. On September 16 it was
replaced with the persistent `llama-qwen38-gsq.service`, enabled under
`default.target`, with `Restart=always` and a five-second restart delay.
User `agent` already has lingering enabled, allowing startup without login.
No reboot was performed to test boot recovery.

The tracked unit is `tools/pi/systemd/user/llama-qwen38-gsq.service`. It invokes
the repository launcher directly at `/workspace/projects/llama.cpp/llama.cpp`;
adjust both unit paths when installing elsewhere. Install only this unit:

```sh
install -m 644 tools/pi/systemd/user/llama-qwen38-gsq.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now llama-qwen38-gsq.service
systemctl --user status llama-qwen38-gsq.service
journalctl --user -u llama-qwen38-gsq.service -n 100
loginctl show-user "$USER" -p Linger
```

If lingering is disabled, an administrator must enable it with
`loginctl enable-linger <user>`. Stop any competing model server before startup;
the 64K configuration needs most of the RTX 3060's VRAM. Explicit systemctl stop
still stops the service despite the restart policy. The older model services
remain stopped; they were not re-enabled.

Validation: systemd unit verification passed; the installed fragment is under
`~/.config/systemd/user/`, reports enabled and active, and `/health` returns OK.
An OpenAI-compatible chat request generated tokens successfully (its 16-token
cap exhausted during reasoning, so this is an API smoke test, not an answer
quality test). This deployment check is not a new throughput benchmark. The API
reports fingerprint `b1712-639fa9a10`; do not use that build metadata alone as
proof of source equivalence to the historical benchmark commit.
