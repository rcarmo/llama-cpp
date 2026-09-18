# Local model profiles on Sigma

**Gemma 4 E4B QAT + MTP zero-copy** is the primary local deployment on `sigma`. Its service is enabled at boot and its immutable runtime is `runtime/deployments/gemma-q4-n4-schedule-2768e715c-1c5ba700`. Historical benchmark records call this optimisation generation `ZC2`; use the model name for normal operations.

Two static profiles are available for explicit tests: **Huihui Gemma 4 12B QAT Q4_K + MTP zero-copy** for security audits and **Bonsai 2 27B PQ2_0** for CPU-only ternary-model tests. All three profiles use `http://192.168.1.70:11434/` without authentication and are mutually exclusive. Huihui and Bonsai bind the LAN address directly; the primary binds loopback and reaches the LAN through the systemd socket proxy. The older file-mediated `llama-gemma-local-provider.service` is disabled and ports 8091 and 18092 are closed.

## Switch profiles

Use the installed local command from any interactive shell:

```bash
gemma-profile status
gemma-profile audit
gemma-profile bonsai
gemma-profile primary
```

`audit` and `bonsai` stop the primary LAN socket and proxy before stopping the primary model. This ordering prevents socket activation from restarting the primary during a switch. The audit gate requires the expected model identity, resident Vulkan ownership, reachable LAN endpoint and zero process swap. The Bonsai gate checks `/health`, the exact alias in `/v1/models`, the LAN endpoint and zero service swap.

`primary` stops all known test profiles, starts Gemma 4 E4B QAT + MTP on loopback port 18094, then starts the LAN socket proxy on port 11434. Every failed switch attempts to restore the previously active qualified profile and exits non-zero. `status` checks model identity, mutually exclusive unit state, LAN socket state, restart count, memory and swap. It exits non-zero for an inconsistent state. If a rollback reports `FATAL`, inspect `gemma-profile status` and the affected unit journals before retrying.

All profiles use the standard Ollama TCP port:

```text
http://192.168.1.70:11434/
```

The service remains the focused llama.cpp OpenAI-compatible API. Port selection does not add Ollama-native routes such as `/api/generate` or `/api/chat`; clients should use `/v1/chat/completions`.

The primary unit remains enabled. The audit and Bonsai units have no `[Install]` sections and report `UnitFileState=static`; do not enable them. Return to the primary after test work:

```bash
gemma-profile primary
```

Tracked switch files:

- `tools/gemma-profile`;
- `tools/run-huihui-security-audit-service.sh` and `tools/run-bonsai2-cpu-service.sh`;
- `tools/config/huihui-security-audit.env.example` and `tools/config/bonsai2-27b-cpu.env.example`;
- `tools/systemd/user/huihui-gemma4-security-audit.service` and `tools/systemd/user/bonsai2-27b-cpu.service`.

The installed command is `~/.local/bin/gemma-profile`, symlinked to the tracked script. Profile environments are under `~/.config/huihui-gemma4-security-audit/` and `~/.config/bonsai2-27b-cpu/`.

## Primary deployment: Gemma 4 E4B QAT + MTP zero-copy

| Item | Value |
|---|---|
| Model | Gemma 4 E4B QAT Q4_0 |
| MTP assistant | Gemma 4 E4B assistant Q8_0 |
| Service | `llama-gemma-zero-copy.service` |
| Loopback API | `http://127.0.0.1:18094/v1` |
| LAN UI and API | `http://192.168.1.70:11434/` |
| Context | 32,768 tokens, one resident slot |
| Maximum output | 2,048 tokens |
| Admission | Serial, at most eight outstanding HTTP requests |
| Cold prefill | Vulkan on Intel Iris Xe |
| Generation | CPU target with MTP depth 3 |
| Q4 four-row kernel | Equivalent 2x4 schedule with shorter temporary lifetimes |
| K/V and Flash Attention | F16, Flash Attention off |
| Batch / microbatch | 256 / 256 |
| Decode / prefill threads | 8 / 16 |
| Service memory limit | 16 GiB |
| Service swap limit | 0 |
| Streaming | Live SSE prompt progress plus parsed content, reasoning and tool-call deltas |
| Authentication | None; trusted LAN only |

The service is workspace-coupled. The installed unit runs `tools/run-gemma-zero-copy-service.sh`; its environment file names the workspace build and GGUF paths. Moving, replacing or deleting these files changes the live service.

Model identities:

| Artefact | SHA-256 |
|---|---|
| `gemma-4-E4B_q4_0-it.gguf` | `676c35070db6dbe52f93e9c864ee0fba4eddea94b9c875d9cb10daff453fbaee` |
| `gemma-4-E4B-it-qat-assistant-MTP-Q8_0.gguf` | `49d8367f8e1a507ef6196a7eeed790b2797bc649568f431c10bce03f574f6ffc` |

The optional multimodal projector is not loaded. This deployment accepts text only.

## Security-audit profile: Huihui Gemma 4 12B

| Item | Value |
|---|---|
| Purpose | Local security audits and model-behaviour tests |
| Boot status | Static unit; explicit selection only |
| Service | `huihui-gemma4-security-audit.service` |
| LAN UI and API | `http://192.168.1.70:11434/` |
| Model | Huihui Gemma 4 12B It QAT Q4_0-unquantized Abliterated, Q4_K |
| MTP assistant | Matching Gemma 4 12B QAT BF16 assistant |
| Context / maximum output | 8,192 / 2,048 tokens |
| Generation | CPU target, 8 threads, MTP depth 1 |
| Cold prefill | Vulkan on Intel Iris Xe |
| Memory / swap limit | 28 GiB / 0 |
| Executable SHA-256 | `2a8ac52d18234a9c4a71022e46bcab857acdb2b41fc1afc2436f1de94ae4252e` |
| Main model SHA-256 | `8cfe39c96b966b2bc99d908315404914e9128fb35e134ca36f1a199507d6da6b` |
| MTP model SHA-256 | `c24069c9ea03da35c65cdf1d03d9f1dc3c69f962362bee02d79b51a0f4de2261` |

The immutable audit runtime is `runtime/deployments/huihui-gemma4-security-audit-a4629719f-2a8ac52d`. The model files remain outside that closure because each is addressed by an exact path and checksum.

The 17 September tuning screen compared seven thread/depth profiles on the same deterministic 256-token security-review request. Eight CPU threads with MTP depth 1 led the two-run screen at 8.0692 tok/s mean. Depth 2 reached 7.8338 tok/s and the previous depth-3 setting reached 6.7707 tok/s. All 14 timed runs generated 256 tokens and copied zero K/V bytes. This is a narrow local fixture, not a cross-model comparison.

The qualification passed exact append reuse, factual, arithmetic and coding responses, non-streamed tool calls and tool-result continuation, incremental SSE with prompt progress, streamed tool-call assembly, cancellation/reset recovery and serial admission. Cold turns shared 754,974,720 logical K/V bytes and copied zero bytes. The retained audit deployment snapshot recorded a 21,475,110,912-byte memory peak with zero process and cgroup swap.

The embedded llama.cpp UI is present. A headless Chromium check over the LAN URL loaded `llama-ui`, found 12 interactive controls and reported no page errors or unexpected failed requests. `/tools` returns the standard `403 feature_disabled` response because this profile does not execute server-side shell or MCP tools. OpenAI-compatible client-supplied tool definitions, tool-call generation and tool-result continuation are enabled. `/slots`, `/metrics`, `/tokenize`, `/detokenize`, embeddings, multimodal input and server-side tools are not implemented by the focused zero-copy server.

The parser fix classifies a repeated empty Gemma 4 thought channel as reasoning metadata. With thinking disabled, visible content no longer includes `<|channel>thought\n<channel|>`. The service still renders the model's canonical no-thinking generation prefix.

Evidence: [Huihui security-audit trial](../../../benchmarks/intel-1340p/huihui-gemma4-12b-trial-20260917/README.md).

## CPU test profile: Bonsai 2 27B PQ2_0

| Item | Value |
|---|---|
| Purpose | Explicit local ternary-model and API tests |
| Boot status | Static unit; explicit selection only |
| Service | `bonsai2-27b-cpu.service` |
| Model alias | `bonsai-2-27b-pq2-cpu` |
| LAN UI and API | `http://192.168.1.70:11434/` |
| Model | Ternary Bonsai 2 27B, PQ2_0 group 128 |
| Context / slots | 2,048 tokens / one slot |
| Generation | CPU only, eight threads; no MTP |
| Batch threads | 16 |
| Memory / swap limit | 28 GiB / 0 |
| Server SHA-256 | `ccb8e4aa5541d54d97bd3a359d30f31c01dec7d2e3645023bff36d40dfd76fca` |
| Model SHA-256 | `3907dc1658db1f78a9826bf8d5bcb8dc65db0d466388937af57f2294fae62ec1` |

The immutable runtime is `runtime/deployments/bonsai2-27b-pq2-cpu-bb2ea4754-ccb8e4aa`. It was built with `GGML_VULKAN=OFF` and embeds the primary profile's frozen 70-asset UI. CPU smoke generation measured about 1.48 tok/s. Full Vulkan offload produced correct output but measured 0.59 tok/s because Vulkan has no PQ2_0 matrix kernel; it is excluded from the profile.

The profile passed exact non-streaming output, incremental SSE, forced OpenAI-style tool selection, 70/70 UI asset equality, model alias checks, zero swap/OOM and primary rollback. A 315-token forced tool request took 149 seconds, so this profile is for deliberate tests rather than routine interactive use.

Evidence: [Bonsai 2 27B PQ2_0 integration](../../../benchmarks/intel-1340p/bonsai2-27b-integration-20260918/README.md).

## Gemma zero-copy request lifecycle

The primary and audit processes load CPU target, CPU assistant and Vulkan target model owners once at startup. A cold request then:

1. creates a fresh Vulkan context from the resident Vulkan target model;
2. renders and evaluates the chat prompt in that context;
3. requires `shared_bytes > 0` and `copied_bytes == 0` from `llama_kv_handoff_cpu`;
4. destroys the consumed Vulkan context while retaining the Vulkan model owner;
5. binds a CPU MTP assistant to the destination context;
6. re-evaluates the final prompt token and generates on CPU.

The transfer does not write a K/V state file. The response includes a `zero_copy` object with the route, byte counters and timings. The health endpoint reports cumulative handoff counters.

Only an exact append to the committed message/tool history reuses CPU K/V. An edited message, regenerated branch, changed tool list or different conversation resets the slot and performs another cold Vulkan prefill. The request can keep the same `X-Conversation-Id`; divergent history is a cold start, not an error.

A client disconnect aborts active inference and clears the resident slot. `DELETE /v1/stream` requires the owning identity in `X-Conversation-Id` or the UI-compatible `conv_id` query parameter; a missing or mismatched identity is rejected. The service streams prompt progress, content/reasoning and tool-call deltas to the embedded UI as they become available, but it does not keep a server-side replay buffer after a dropped stream connection.

## API surface

The current service provides:

- `GET /health` and `GET /v1/health`;
- `GET /props`;
- `GET /models` and `GET /v1/models`;
- `POST /chat/completions` and `POST /v1/chat/completions`;
- `DELETE /v1/stream` for cancellation/reset;
- the embedded llama.cpp Web UI.

It accepts OpenAI-compatible messages, tools and `tool_choice` values `auto`, `none` and `required`. It parses Gemma tool calls and supports tool-result continuation. With `stream: true`, it returns an initial OpenAI chunk immediately, emits `prompt_progress` after each prompt batch and sends parsed content/reasoning/tool-call deltas during generation. The final chunk carries usage, timings and zero-copy telemetry. Request JSON is limited to 16 MiB. An omitted `max_tokens`, or the UI's `max_tokens: -1`, uses the configured 2,048-token service maximum; an explicit value from 1 through 2,048 is honoured.

This focused server does not provide the full `llama-server` route set. In particular, `/slots`, `/metrics`, `/tokenize`, `/detokenize`, stream lookup/replay, embeddings and multimodal input are unavailable.

## Performance

The trained qualification on 15 September 2026 recorded:

| Workload | Prompt tokens | Prompt throughput | Handoff | First token | Request wall |
|---|---:|---:|---:|---:|---:|
| Exact 4K | 4,090 | 202.60 tok/s | 88.1 ms | 22.95 s | 23.16 s |
| Exact 32K | 31,994 | 128.00 tok/s | 74.8 ms | 252.88 s | 253.19 s |

Both requests returned `LONG OK`, shared 584,056,832 logical K/V bytes and copied zero bytes. The 32K qualification peaked at 14,344,970,240 bytes and used no process swap under the 16 GiB/zero-swap unit limits. Thermal data was not captured.

A warm append recalled the expected nonce, reused 24 prompt tokens and completed in 0.89 s. The original qualification reloaded the Vulkan target for each new conversation, so its 3.5-4.6 s short cold timings are historical. Commit `cd6c8380c` made the Vulkan model owner process-resident. A post-change second cold smoke reached first token in 1.40 s; a different 37-token prompt reached first token in 4.22 s and generated 128 tokens at 13.03 tok/s. These single runs verify the serving path, not a general latency or throughput distribution.

A matched 37-prompt/128-output comparison on the current branch rejected transplantation of the retained `LLAMA_EXPERIMENTAL_SMALL_TARGET_BATCH`, `GGML_CPU_EXPERIMENTAL_ATTN4` and `GGML_CPU_EXPERIMENTAL_SCORE4_3ROW` paths. Enabling all three reduced decode from 12.79 to 9.02 tok/s and increased request wall time from 14.19 to 18.31 s. They are absent from the active core source and service environment; retained patch snapshots remain under benchmark and tool evidence directories.

Historical matched CPU measurements remain the best sustained-generation reference: 25.77 generation tok/s and 60.96/44.32 prompt tok/s at exact 4K/32K. The current synthetic long prompts measured 202.60/128.00 prompt tok/s, but the prompt contents and output lengths differ. Treat the ratios as indicative, not matched speedups.

The current Q4 scheduling release improved the frozen 512-output decode mean from 23.1749 to 25.8539 tok/s (+11.56%) over eight counterbalanced observations. All candidate runs exceeded all controls with identical `385/382/512` MTP work and output hash. The historical 512-prompt/64-output fixture improved from 10.0924 to 10.6557 tok/s (+5.58%) with identical `512/64/55/43` work and output hash.

Retained evidence: [original zero-copy qualification](../../../benchmarks/intel-1340p/gemma-zero-copy-service-20260915/README.md), [generation-parity baseline](../../../benchmarks/intel-1340p/gemma-generation-parity-20260916/README.md), and [Q4 scheduling release](../../../benchmarks/intel-1340p/gemma-zc-speed-20260916/README.md).

## Generation inheritance contract

A replacement Gemma serving path must preserve the accepted generation baseline or record an isolated matched reason for each difference. On 16 September 2026, the current-service audit reread all 48 `README.md` and `report.md` files under the indexed Gemma benchmark campaigns, the August [completion audit](../../../benchmarks/intel-1340p/ornith-gemma-optimization/completion-audit.md), the September [B0 baseline ledger](../../../benchmarks/intel-1340p/gemma-optimization-plan-20260911/baselines.md), the historical [512-prompt/64-output result](../../../benchmarks/intel-1340p/maple-qwen-campaign/performance/gemma/response-generation.json), and the current source, build and live process state. Future work starts from this table instead of reconstructing the decisions from chat history.

Status terms in this table are exact: `live` means enabled in `llama-gemma-zero-copy.service`; `excluded` means measured evidence does not support enabling it; `conditional-not-run` means a required parent failed before the candidate was reached; `research` means the result is too small or narrow for the current default. The [16 September Q4 scheduling campaign](../../../benchmarks/intel-1340p/gemma-zc-speed-20260916/README.md) is the current deployment record; generation parity is its baseline.

| Factor | Retained evidence | Current zero-copy state | Required action |
|---|---|---|---|
| Resident Vulkan model, fresh cold context and in-process K/V handoff | Current service qualification | Live; positive shared bytes, zero copied bytes | Preserve as an invariant |
| Iris Xe FP32 long-attention selection, GPU microbatch 256 | [GPU attention](../../../benchmarks/intel-1340p/gemma-gpu-attention-20260910/report.md); [batch interaction](../../../benchmarks/intel-1340p/gemma-f32-batch-20260910/report.md) | Live | Preserve; 1024 was tail-specific and slower for fresh whole prefill |
| Clang Release, `-O3`, `-march=native`, AVX2/F16C/FMA, libomp | Current `build-gemma-zero-copy-vulkan` compile commands and loaded libraries | Live | Preserve exact build and loaded-library identity |
| CPU target decode 8, large-batch/prefill 16 | [Hybrid performance](../../../benchmarks/intel-1340p/gemma-hybrid-perf-20260910/report.md) | Live | Preserve |
| MTP assistant decode 8, batch 16 | [Draft-thread comparison](../../../benchmarks/intel-1340p/gemma-decode-draftthreads-20260910/report.md) | Live | Preserve; four draft threads were 4.10% slower |
| MTP depth 3 | [August decisions](../../../benchmarks/intel-1340p/ornith-gemma-optimization/final-decisions.json) | Live | Preserve; depth 4 was 2.31% slower, and later depth 1/5 screens also lost |
| F16 K/V, compact SWA, Flash Attention off | August completion audit and [CPU FA report](../../../benchmarks/intel-1340p/gemma-cpu-fa-20260910/report.md) | Live | Preserve; the improved CPU-FA branch still trailed FA-off |
| mmap model loading and advice off | August completion audit | Live through default model parameters; no expert-advice flag | Preserve and record explicitly in future manifests |
| Backend sampling off | Historical response identity and current `service.cpp` | Live | Preserve |
| Q4_0 x Q8_0 four-row temporary scheduling | [Q4 scheduling release](../../../benchmarks/intel-1340p/gemma-zc-speed-20260916/README.md) | Live through `GGML_CPU_EXPERIMENTAL_Q4_N4_SCHEDULE=1` | Preserve the measured 2x4 arithmetic and exact output; sustained confirmation measured +11.56% |
| Standard attached target and draft threadpools | `common_init_from_params()` creates 8/16 pools; [generation-parity campaign](../../../benchmarks/intel-1340p/gemma-generation-parity-20260916/README.md) | Implemented but live-disabled | Excluded from the live profile: the eight-run comparison measured -1.98% decode. The code remains available through `--threadpools 1` for diagnostics |
| CPU Gemma target batches `<=4` use the 8-thread decode pool | Historical [small-target-batch report](../../../benchmarks/intel-1340p/gemma-decode-smallbatch-20260910/report.md); current isolated screen | Not present in current source | Excluded: current zero-copy decode fell 23.66 to 15.31 tok/s (-35.28%) and wall time rose 51.55%. The candidate patch is retained only in the campaign evidence |
| ATTN4 2x4 F16 tile | [ATTN4 report](../../../benchmarks/intel-1340p/gemma-decode-attn4-20260911/report.md) | Not present | Conditional-not-run: its required current small-target-batch parent failed |
| SCORE3 3x4 score tile | [SCORE3 rollout](../../../benchmarks/intel-1340p/gemma-score3-rollout-20260911/report.md) | Not present | Conditional-not-run: its required current ATTN4 parent was not reached |
| Model sampling metadata | Historical model default included `top_k=64`; current unspecified-sampling fixture | Live through `--model-sampling 1` | Preserve. Request overrides still win; model-default and generic-default arms both passed the frozen coding fixture, 4/4 total sandbox passes |
| Minimum draft length | Historical workers used `--spec-draft-n-min 1`; current factor screen | Live through `--draft-min 1` | Preserve for policy parity. The current screen measured -0.10% decode and -0.04% wall, with identical work |
| Query reuse | [Query-reuse report](../../../benchmarks/intel-1340p/gemma-query-reuse-20260911/report.md) | Missing | Research only: confirmed saved-64K gain was 0.70%, and the combined release later failed its swap gate during GPU startup |
| CPU affinity and static score scheduling | Hybrid screens and [static scheduling](../../../benchmarks/intel-1340p/gemma-score-static-20260911/report.md) | No strict binding; dynamic scheduling | Excluded: strict binding reduced throughput and static score scheduling lost 9.97% |
| Other SIMD/value candidates | [B0 ledger](../../../benchmarks/intel-1340p/gemma-optimization-plan-20260911/baselines.md) | Missing | Excluded until a new mechanism exists: paired F16, value3, no-unroll, register, inline and packed-Q4 candidates did not improve the matched workload |

The historical three-patch transplant established that its combination was slower. The 16 September campaign then isolated small-target-batch on the current parent and rejected it. This closes the dependent ATTN4 and SCORE3 path for the current zero-copy branch without changing their historical file-mediated results.

### Generation parity gate

Before changing the live service:

1. Freeze current and candidate source, executable, loaded libraries, model files, sampler values, threadpool state, request and rendered-token hashes. Record the exact Vulkan selector and require the same zero-copy route in both arms.
2. Run the historical 512-token/64-output fixture identified by prompt SHA-256 `8553ca8562fbc2ced6af4580cedb400df75e137035f14cce41769cd58c86148f` and payload SHA-256 `62bbb1aad57b5d2241badd1ce2bf6bffa718f5865c21d28d052c1f8fa9853c2f`. If the focused Chat Completions API cannot reproduce the raw completion request exactly, use a local direct harness and label the endpoint difference.
3. Freeze a sustained current-service fixture with at least 512 generated tokens. Use the same rendered prompt tokens, output budget, sampler, seed and conversation state in every arm.
4. Screen one factor in off/on/on/off order. Confirm a useful candidate with eight counterbalanced observations. Keep profiling disabled during timing.
5. Record prompt, handoff, first-token, generation and whole-request times separately. Record generated, verified, drafted and accepted token counts and calculate acceptance from the same boundaries.
6. Require coherent output or the frozen task result, live incremental SSE, cancellation recovery, exact-append reuse, `shared_bytes > 0`, `copied_bytes == 0`, resident Vulkan ownership and zero process/cgroup swap.
7. Compare old 25.767 tok/s only when the exact historical fixture, sampling and timing boundaries match. The current 12-13 tok/s short checks use different work and cannot diagnose a regression by themselves.
8. Append accepted and rejected results to the B0-style ledger before the next candidate. A combined candidate names every parent and cannot assign its result to one component.

The deployed successor keeps the ZC1 model metadata, `n_min=1`, MTP depth 3 and detached pools. It adds only `GGML_CPU_EXPERIMENTAL_Q4_N4_SCHEDULE=1`. Future generation work starts from this release and must preserve Vulkan residency, zero-copy ownership, streaming, cancellation, serial admission and `MemorySwapMax=0`.

## Build

Use the rootless Podman procedure in [Fedora Intel build container](intel-build-container.md). It records how `localhost/llama-intel-build:fedora44` is built, mounted and identified, and why Vulkan inference runs on the host. Use a separate build directory for unqualified candidates; do not overwrite the live tree during screening.

Use a single Vulkan-enabled build for the executable and all linked llama/ggml libraries:

```bash
cmake -S . -B build-gemma-zero-copy-vulkan -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_C_COMPILER=clang \
  -DCMAKE_CXX_COMPILER=clang++ \
  -DBUILD_SHARED_LIBS=ON \
  -DGGML_VULKAN=ON \
  -DGGML_BACKEND_DL=OFF \
  -DGGML_NATIVE=ON \
  -DLLAMA_BUILD_TESTS=ON \
  -DLLAMA_BUILD_SERVER=ON \
  -DLLAMA_BUILD_UI=ON

cmake --build build-gemma-zero-copy-vulkan --target \
  llama-gemma-zero-copy-server llama-gemma-in-memory \
  test-context-handoff test-gemma-hybrid-session-policy -j6

ctest --test-dir build-gemma-zero-copy-vulkan \
  -R '^test-(gemma-hybrid-session-policy|context-handoff(-gemma)?)$' \
  --output-on-failure
```

Do not combine a new executable with an older `libllama` or Vulkan plugin. The initial deployment attempt failed because the older runtime did not export `llama_kv_handoff_cpu`.

## Install or update

The live 16 September deployment uses an immutable local closure. Git stores its hashes and dependencies in the [Q4 scheduling deployment evidence](../../../benchmarks/intel-1340p/gemma-zc-speed-20260916/deployment/); `.gitignore` excludes `runtime/deployments/` binaries. The current paths are:

```text
candidate: runtime/deployments/gemma-q4-n4-schedule-2768e715c-1c5ba700
rollback:  runtime/deployments/gemma-generation-parity-ddb93ad19-7871f502
```

The candidate environment retains `LLAMA_MTP_MIN=1`, `LLAMA_THREADPOOLS=0` and `LLAMA_MODEL_SAMPLING=1`, and adds `GGML_CPU_EXPERIMENTAL_Q4_N4_SCHEDULE=1`. `tools/run-gemma-zero-copy-service.sh` emits the newer command-line flags only when the installed environment defines them, which keeps the immutable rollback binary launchable.

Tracked files:

- `tools/run-gemma-zero-copy-service.sh`;
- `tools/config/llama-gemma-zero-copy.env.example`;
- `tools/systemd/user/llama-gemma-zero-copy.service`;
- `tools/systemd/user/llama-gemma-lan-test.socket`;
- `tools/systemd/user/llama-gemma-lan-test.service`.

For a normal tracked-file installation after a successful build:

```bash
set -euo pipefail
root=/var/home/agent/workspace/projects/llama-cpp

install -d -m 0700 ~/.config/llama-gemma-zero-copy
install -d -m 0755 ~/.config/systemd/user
install -m 0600 "$root/tools/config/llama-gemma-zero-copy.env.example" \
  ~/.config/llama-gemma-zero-copy/service.env
install -m 0644 "$root/tools/systemd/user/llama-gemma-zero-copy.service" \
  ~/.config/systemd/user/
install -m 0644 "$root/tools/systemd/user/llama-gemma-lan-test.socket" \
  ~/.config/systemd/user/
install -m 0644 "$root/tools/systemd/user/llama-gemma-lan-test.service" \
  ~/.config/systemd/user/

export XDG_RUNTIME_DIR=/run/user/$(id -u)
export DBUS_SESSION_BUS_ADDRESS=unix:path=$XDG_RUNTIME_DIR/bus
systemctl --user daemon-reload
systemctl --user enable --now llama-gemma-zero-copy.service \
  llama-gemma-lan-test.socket
```

Install the static profiles and switch command after creating their qualified immutable runtimes:

```bash
install -d -m 0700 ~/.config/huihui-gemma4-security-audit
install -m 0600 "$root/tools/config/huihui-security-audit.env.example" \
  ~/.config/huihui-gemma4-security-audit/service.env
install -m 0644 "$root/tools/systemd/user/huihui-gemma4-security-audit.service" \
  ~/.config/systemd/user/
benchmarks/intel-1340p/bonsai2-27b-integration-20260918/install-bonsai-profile.sh
install -d -m 0755 ~/.local/bin
ln -sfn "$root/tools/gemma-profile" ~/.local/bin/gemma-profile
systemctl --user daemon-reload
```

Keep `huihui-gemma4-security-audit.service` and `bonsai2-27b-cpu.service` static and inactive. `gemma-profile audit` or `gemma-profile bonsai` starts the requested profile directly.

The validated host has `Linger=yes`, which allows the user service to start without an interactive login. Check it with:

```bash
loginctl show-user "$(id -un)" -p Linger
```

## Operate and verify

For routine selection and status, use `gemma-profile` as described in [Switch profiles](#switch-profiles). The commands below inspect the primary unit directly.

```bash
export XDG_RUNTIME_DIR=/run/user/$(id -u)
export DBUS_SESSION_BUS_ADDRESS=unix:path=$XDG_RUNTIME_DIR/bus

systemctl --user status \
  llama-gemma-zero-copy.service \
  llama-gemma-lan-test.socket \
  llama-gemma-lan-test.service
systemctl --user show llama-gemma-zero-copy.service \
  -p MainPID -p NRestarts \
  -p MemoryCurrent -p MemoryPeak \
  -p MemorySwapCurrent -p MemorySwapPeak
journalctl --user -u llama-gemma-zero-copy.service -f
```

Health must report a resident Vulkan model, positive shared bytes and zero copied bytes after at least one cold request:

```bash
curl -fsS http://192.168.1.70:11434/health \
  | jq -e 'select(
      .status == "ok" and
      .vulkan_model_resident == true and
      .zero_copy_ready == true and
      .shared_bytes > 0 and
      .copied_bytes == 0)'
```

Live zero-copy request:

```bash
curl -fsS http://192.168.1.70:11434/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -H 'X-Conversation-Id: zero-copy-smoke' \
  -d '{
    "model":"gemma-4-e4b-qat-mtp-zero-copy",
    "messages":[{"role":"user","content":"Reply with exactly ZERO_COPY_OK"}],
    "temperature":0,
    "max_tokens":32,
    "stream":false
  }' | jq -e 'select(
    .choices[0].message.content == "ZERO_COPY_OK" and
    .zero_copy.route == "vulkan_prefill_cpu_mtp" and
    .zero_copy.shared_bytes > 0 and
    .zero_copy.copied_bytes == 0 and
    .zero_copy.zero_copy == true)'
```

Live stream and progress verification:

```bash
GEMMA_ZERO_COPY_URL=http://192.168.1.70:11434 \
  bun tools/gemma-hybrid/verify-stream.ts
```

The verifier requires at least one `prompt_progress` event, multiple content deltas before the terminal event, final zero-copy telemetry and zero copied bytes. Use `verify-stream-tool.ts` for streamed tool-call assembly.

Required tool-call request:

```bash
curl -fsS http://192.168.1.70:11434/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -H 'X-Conversation-Id: zero-copy-tool' \
  -d '{
    "model":"gemma-4-e4b-qat-mtp-zero-copy",
    "messages":[{"role":"user","content":"Call get_weather for Lisbon."}],
    "tools":[{"type":"function","function":{
      "name":"get_weather",
      "description":"Get weather",
      "parameters":{"type":"object","properties":{
        "city":{"type":"string"}
      },"required":["city"]}
    }}],
    "tool_choice":"required",
    "temperature":0,
    "max_tokens":96,
    "stream":false
  }' | jq '.choices[0].message.tool_calls'
```

## Pi registration

The repository's historical `local-gemma` registration uses `http://127.0.0.1:8091/v1`, a 131,072-token context and a 32,768-token output limit. That registration belongs to the disabled CPU provider and is not valid for the current 32K zero-copy service.

To use this service through Pi, update the provider deliberately to:

- base URL `http://127.0.0.1:18094/v1`;
- model ID `gemma-4-e4b-qat-mtp-zero-copy`;
- context window 32,768;
- maximum output 2,048;
- text input only.

Do not advertise the historical 128K limits for this service. The hosted default remains independent and does not need to change.

## Historical CPU provider and rollback

The disabled `llama-gemma-local-provider.service` is the accepted CPU/MTP rollback profile. It used two independent 131,072-token slots, aggregate context 262,144, batch/uBatch 1024/256, a 12,288 MiB prompt-state cache and the file-mediated hybrid supervisor. Its loopback API was `127.0.0.1:8091`; its CPU worker listened on 18092.

Historical measurements and procedures are retained in:

- [Gemma 128K profile](intel-1340p-gemma4-runbook.md);
- [Gemma concurrency benchmark, 2 August 2026](gemma-local-provider-benchmark-2026-08-02.md);
- [September CPU prefill and decode experiments](../../../benchmarks/intel-1340p/README.md#2026-09-10-and-2026-09-11-gemma-series);
- [`tools/gemma-hybrid/README.md`](../../../tools/gemma-hybrid/README.md), which labels the TypeScript adapter as historical.

Restore the CPU provider only after stopping the zero-copy service and LAN proxy:

```bash
systemctl --user disable --now \
  llama-gemma-lan-test.socket \
  llama-gemma-zero-copy.service
systemctl --user start llama-gemma-local-provider.service
curl -fsS http://127.0.0.1:8091/health
```

This restores the loopback rollback endpoint for a manual session without changing the boot default. The tracked LAN proxy targets 18094; do not start it against the CPU rollback without changing and reviewing that target. Stop the CPU rollback and run `gemma-profile primary` when finished.

## Remove the zero-copy service

```bash
systemctl --user disable --now \
  llama-gemma-lan-test.socket \
  llama-gemma-zero-copy.service
rm -f ~/.config/systemd/user/llama-gemma-lan-test.socket
rm -f ~/.config/systemd/user/llama-gemma-lan-test.service
rm -f ~/.config/systemd/user/llama-gemma-zero-copy.service
rm -rf ~/.config/llama-gemma-zero-copy
systemctl --user daemon-reload
```

Removing the service does not remove model files, build outputs, historical state files or repository evidence.
