# Gemma zero-copy service qualification, 15 September 2026

## Result

The persistent single-slot service passed the trained qualification and is eligible for the LAN endpoint. A cold request now evaluates the chat prompt in a Vulkan context, transfers its Gemma ISWA K/V cache into the CPU context in process, destroys the Vulkan model/context, creates the CPU Gemma MTP borrower and continues generation without a state file.

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

The service is intentionally serial. A new conversation resets the resident slot; only an append-only request with the same `X-Conversation-Id` reuses K/V. It supports non-streaming OpenAI Chat Completions and a finite SSE response compatible with the embedded UI. It does not implement server-side stream replay after a dropped connection.

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

Use `GGML_VK_VISIBLE_DEVICES=0` and `GGML_VK_EXPERIMENTAL_ATTN_MODE=f32` on this Intel Iris Xe host. See `identity.txt` for exact binary, library and model hashes. `SHA256SUMS` covers the retained evidence files.
