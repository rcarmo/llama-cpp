# Post-change live verification, commit cd6c8380c

Verified on `sigma` after commit `cd6c8380cfe26a6ff08d6b96808b96681a16489e` was built, deployed and pushed on 15 September 2026.

## Result

The service now retains the Vulkan target model owner across cold conversations. It still creates a fresh Vulkan context for each cold prompt, consumes that context during the in-process handoff and continues with the CPU target plus MTP assistant. Missing `max_tokens` and the UI value `-1` resolve to the configured 2,048-token service maximum; explicit limits from 1 through 2,048 remain valid.

Three focused tests passed after the final rebuild:

- `test-gemma-hybrid-session-policy`;
- `test-context-handoff`;
- `test-context-handoff-gemma`.

## Live checks

| Check | Result |
|---|---|
| Two separate cold conversations | Each shared 584,056,832 logical K/V bytes and copied zero bytes |
| Warm append | `cpu_mtp_reuse`, 164 cached tokens |
| Final 37-token prompt / 128-token output | 4.219 s first token, 13.03 tok/s decode, 13.967 s request wall |
| Short second-cold smoke | 1.396 s first token |
| Cancellation | HTTP 499 generation response; HTTP 200 reset; 0.020 s reset round trip |
| Post-cancel recovery | `RECOVERED`, zero-copy handoff, resident Vulkan model |
| Service memory | 13,951,418,368 B peak cgroup memory |
| Service swap | `MemorySwapCurrent=0`, `MemorySwapPeak=0` |
| Restarts | zero |

The final health response reported `vulkan_model_resident=true`, `zero_copy_ready=true`, positive cumulative shared bytes and zero cumulative copied bytes.

## Rejected decoder transplant

The retained September small-batch, ATTN4 and SCORE3 CPU patches were ported temporarily and tested with the same 37-token prompt, 128-token output, seed, target/draft work and zero-copy route.

| Current-branch mode | Decode | Request wall |
|---|---:|---:|
| Experimental paths off | 12.79 tok/s | 14.19 s |
| Experimental paths on | 9.02 tok/s | 18.31 s |

The combined transplant reduced decode throughput by 29.5% and increased request wall time by 29.0%. It was removed before the final build. The production source and service environment do not contain or enable `LLAMA_EXPERIMENTAL_SMALL_TARGET_BATCH`, `GGML_CPU_EXPERIMENTAL_ATTN4` or `GGML_CPU_EXPERIMENTAL_SCORE4_3ROW`.

## Final runtime identity

```text
3299e9c5ab683a9048cc8fc7890daad99c000350cd26afa2ab2850ff8a5d11ad  llama-gemma-zero-copy-server
d231e9d4f835a3e8151c483a9031124541d236e3cb6a321755a851300afe537e  libllama.so.0.4.0
22ec2763eae7f57ee5b700d137501d1d5d970df48d1401b6c17ec590af0e11cf  libggml-cpu.so.0.23.0
```

This is a bounded post-change verification, not a repeat of the exact 4K/32K qualification or a claim that the hybrid service matches the historical CPU-only 25.77 tok/s generation result.

## Live frontend streaming follow-up

The original focused server buffered inference and converted the completed response into two SSE chunks. The embedded UI therefore showed neither prompt progress nor generated text while work was running. The follow-up implementation uses the HTTP layer's chunked response mechanism and retains serial ownership until stream completion or cancellation.

Measured loopback verification for a 21-token prompt and 128-token output recorded:

- first SSE event at 2.5 ms;
- first `prompt_progress` event at 7.1 ms;
- first content delta at 4.160 s;
- 128 separate content events before the final event at 14.166 s;
- 584,056,832 shared bytes and zero copied bytes.

The same verifier through trusted-LAN port 8094 recorded 132 events, two progress events and 128 content events. The first LAN event arrived in 2.8 ms, first progress in 1.374 s, first content in 2.528 s and final event in 11.829 s. A streamed `get_temperature` request assembled one tool call with arguments `{"city":"Lisbon"}` and finish reason `tool_calls`. Cancelling after three streamed content events closed the stream in 0.018 s; the next request returned `RECOVERED` through a fresh zero-copy handoff.

The serial non-streaming suite then passed all seven requests, including exact append reuse and tool-result continuation. A headless Chromium check against the actual LAN UI observed `Processing 0%`, `Processing 100%`, a partial numbered response and the completed four-line response over one `text/event-stream` request. Final inspection recorded zero service restarts, `MemorySwapCurrent=0`, `MemorySwapPeak=0` and a 14,016,946,176-byte cgroup memory peak. These are bounded integration checks, not a long-context rerun.
