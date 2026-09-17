# Huihui Gemma 4 12B local security-audit profile (17 September 2026)

This directory records the temporary Huihui Gemma 4 12B profile on `sigma`. **Gemma 4 E4B QAT + MTP zero-copy remains the primary local deployment and was restored after the trial.** Historical records call the primary optimisation generation `ZC2`.

## Selected audit profile

| Item | Value |
|---|---|
| Target | Huihui Gemma 4 12B It QAT Q4_0-unquantized Abliterated, Q4_K |
| Assistant | Matching Gemma 4 12B QAT BF16 MTP |
| Service | `huihui-gemma4-security-audit.service` |
| LAN UI/API | `http://192.168.1.70:11434/` |
| Context / output limit | 8,192 / 2,048 tokens |
| CPU threads / batch threads | 8 / 16 |
| MTP depth / minimum | 1 / 1 |
| Batch / microbatch | 256 / 256 |
| K/V path | Vulkan cold prefill, shared-memory CPU handoff, CPU MTP generation |
| Service memory / swap limit | 28 GiB / 0 |
| Executable SHA-256 | `2a8ac52d18234a9c4a71022e46bcab857acdb2b41fc1afc2436f1de94ae4252e` |
| Target SHA-256 | `8cfe39c96b966b2bc99d908315404914e9128fb35e134ca36f1a199507d6da6b` |
| Assistant SHA-256 | `c24069c9ea03da35c65cdf1d03d9f1dc3c69f962362bee02d79b51a0f4de2261` |

The immutable runtime is `runtime/deployments/huihui-gemma4-security-audit-a4629719f-2a8ac52d`. The audit unit is static and cannot start at boot through `systemctl enable`. The final recorded host state is the restored primary profile; the audit profile is installed and inactive.

## Local switching

Use:

```bash
gemma-profile status
gemma-profile audit
gemma-profile primary
```

Both profiles use the same LAN URL. The audit process binds only `192.168.1.70`; it does not listen on all host interfaces. The switch command stops socket activation before stopping the primary and checks the expected model identity, reachable LAN endpoint and zero process swap. If a requested profile fails its gate, the command attempts to restore the previous working profile and exits non-zero. It reports a failed rollback as fatal. `gemma-profile primary` is the normal end state after an audit session.

The [Sigma Gemma runbook](../../../docs/local/intel-i5-1340p/gemma-local-provider-runbook.md#switch-profiles) contains installation and recovery details.

## Parser correction

The Huihui model can repeat the no-thinking template prefix as `<|channel>thought\n<channel|>` before visible content. The focused zero-copy service previously built the Gemma 4 parser in content-only mode, which exposed that marker to clients. `tools/gemma-hybrid/service.cpp` now builds its parser with reasoning-channel classification while keeping `enable_thinking=false`. The final response contains the visible answer without the empty channel marker.

The service also returns llama-server's standard `403 feature_disabled` response at `/tools`. The embedded UI treats that response as an intentional absence of server-executed tools instead of a broken endpoint. Client-supplied OpenAI tool definitions and model tool calls remain supported.

## Speed screen

Seven profiles ran twice on one deterministic 256-token security-review request. All 14 runs generated 256 tokens and reported zero copied K/V bytes.

| Profile | CPU threads | MTP depth | Mean decode |
|---|---:|---:|---:|
| `t8-d1` | 8 | 1 | 8.0692 tok/s |
| `t8-d2` | 8 | 2 | 7.8338 tok/s |
| `t12-d3` | 12 | 3 | 7.2157 tok/s |
| `t10-d3` | 10 | 3 | 6.9757 tok/s |
| `t8-d3` | 8 | 3 | 6.7707 tok/s |
| `t6-d3` | 6 | 3 | 6.5394 tok/s |
| `t8-d4` | 8 | 4 | 6.3660 tok/s |

`t8-d1` was selected. Its two runs measured 8.0493 and 8.0891 tok/s. The result applies to this fixture and model pair; it is not a general model comparison.

## Qualification

The selected profile passed:

- exact visible responses with no exposed reasoning marker;
- seven non-stream turns covering exact append reuse, tool call/result continuation, factual, arithmetic and coding requests;
- live SSE with two prompt-progress events and 128 incremental content events;
- streamed `get_temperature` tool-call assembly;
- cancellation after three content events, owner-checked reset, exact recovery and serial admission;
- browser rendering over the LAN URL with title `llama-ui`, 12 interactive controls, no page exceptions and no unexpected failed requests;
- `shared_bytes=754974720`, `copied_bytes=0`, resident Vulkan ownership, zero restarts and zero service swap.

The retained audit deployment snapshot recorded a 21,475,110,912-byte memory peak. Global zram still contained pages from earlier workloads; the audit cgroup recorded `MemorySwapCurrent=0` and `MemorySwapPeak=0`.

Raw evidence is under `qualification/`, `tuning/`, `zero-copy-cutover/` and `deployment/`. Files inside those directories are dated observations; `deployment/final-primary-*` records the post-trial primary state. Its health snapshot precedes the first post-restart request, so `zero_copy_ready=false` and zero handoffs are expected there; the retained primary qualification records the completed handoff gates. `run-zero-copy-cutover.sh` and `run-speed-screen.sh` are campaign scripts. `install-audit-profile.sh` verifies the existing immutable closure and installs the tracked unit, environment and switch command. Routine operation uses `tools/gemma-profile`.

## Scope

The profile is text-only and intended for local security audits. The focused server provides chat completions, model metadata, health, embedded UI, SSE progress, owner-checked cancellation, client-defined tools and one resident conversation. It does not provide multimodal input, embeddings, `/slots`, `/metrics`, `/tokenize`, `/detokenize`, server-side shell tools or MCP execution.
