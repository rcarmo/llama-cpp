# Gemma zero-copy service qualification, 15 September 2026

> Historical architecture record. The [ZC1 generation-parity release](../gemma-generation-parity-20260916/README.md) superseded its generation settings, and the [ZC2 Q4 scheduling release](../gemma-zc-speed-20260916/README.md) is the current deployment.

## Result

The persistent single-slot service passed the trained qualification and was deployed on the LAN endpoint. The process retained its CPU target, CPU assistant and Vulkan target model owners. A cold request created a fresh Vulkan context, evaluated the chat prompt, transferred its Gemma ISWA K/V cache into the CPU context in process, destroyed the consumed Vulkan context, created the CPU Gemma MTP borrower and continued generation without a state file.

The defect was a Qwen strict-handoff guard added after the original general handoff. It rejected every non-strict GPU/offloaded source, including Gemma. Removing that guard restores the original Gemma contract while leaving the strict Qwen checks unchanged.

## Evidence

| Workload | Prompt tokens | Output | Vulkan prefill | Handoff | Shared | Copied |
|---|---:|---|---:|---:|---:|---:|
| Exact short smoke | 16 | `ZERO COPY READY` | 0.417 s | 141.5 ms | 181,403,648 B | 0 B |
| Exact 4K | 4,090 | `LONG OK` | 20.188 s | 88.1 ms | 584,056,832 B | 0 B |
| Exact 32K | 31,994 | `LONG OK` | 249.952 s | 74.8 ms | 584,056,832 B | 0 B |

The short suite also passed:

- append-only multi-turn recall (`7319`) with CPU K/V reuse;
- a parsed `get_temperature` tool call and tool-result continuation;
- factual (`Lisbon`), arithmetic (`323`) and JavaScript function output;
- disconnect cancellation followed by a successful slot reset;
- finite telemetry and zero copied bytes for every request.

The 32K unit reached 14,344,970,240 B peak memory. `MemorySwapCurrent` and `MemorySwapPeak` were both zero under `MemoryMax=16G` and `MemorySwapMax=0`. Thermal data was not captured. The existing accepted CPU service stayed online during qualification.

The LAN service was live-verified after commit `c4a30e5f178f36591e9d9426687acf2ba72d8cf3` was pushed. The response fingerprint was `b11486-c4a30e5f1`, content was `FINAL ZERO COPY LIVE`, and telemetry reported 584,056,832 shared bytes with zero copied bytes. The unit had zero restarts and zero process swap. See `live-deployment-c4a30e5f1.txt`.

After the deployment evidence commit was pushed, the old file-mediated `llama-gemma-local-provider.service` was disabled and stopped. Ports 8091 and 18092 closed. The only running Gemma model process was `llama-gemma-zero-copy-server` on 18094, exposed through the LAN socket on 8094. See `final-service-state-ff327e115.txt`.

The service is intentionally serial, with at most eight outstanding HTTP requests. Only an exact append to the committed history reuses K/V. A new conversation, edited branch or regenerated branch resets the resident slot and runs cold. It supports non-streaming OpenAI Chat Completions and live SSE progress/content/tool-call deltas compatible with the embedded UI. It does not implement server-side stream replay after a dropped connection.

Commit `cd6c8380c` retains the Vulkan model owner between cold conversations and removes the unintended 512-token default. Commit `b7492aba4` replaces the buffered finite SSE response with live prompt-progress and parsed generation deltas. Both changes retained zero-copy and no-swap behaviour. A matched transplant of the historical small-batch/ATTN4/SCORE3 paths regressed and was removed. See [the post-change live verification](post-change-cd6c8380c.md).

## Reproduce

Build with CPU, Vulkan, server and embedded UI enabled, then run:

```bash
cmake --build build-gemma-zero-copy-vulkan --target \
  llama-gemma-zero-copy-server llama-gemma-in-memory \
  test-context-handoff test-gemma-hybrid-session-policy -j6
ctest --test-dir build-gemma-zero-copy-vulkan \
  -R '^test-(gemma-hybrid-session-policy|context-handoff(-gemma)?)$' \
  --output-on-failure

bun tools/gemma-hybrid/qualify-service.ts
bun tools/gemma-hybrid/qualify-long.ts 4096 exact-4k
bun tools/gemma-hybrid/qualify-long.ts 32000 exact-32k
```

Use `GGML_VK_VISIBLE_DEVICES=0` and `GGML_VK_EXPERIMENTAL_ATTN_MODE=f32` on this Intel Iris Xe host. Runtime identities are phase-specific:

- `identity.txt` records the original qualification build and model hashes;
- `live-deployment-c4a30e5f1.txt` records the first LAN deployment build;
- `final-service-state-ff327e115.txt` records service topology after the old provider was removed;
- `current-runtime-b7492aba4.txt` records the deployed live-stream executable, linked libraries, loaded paths, unit state and health counters.

`SHA256SUMS` covers all retained evidence files.
