# Gemma 4 E4B zero-copy service on Sigma

The enabled Gemma service on `sigma` is `llama-gemma-zero-copy.service`. It listens on `127.0.0.1:18094` and is exposed without authentication on the trusted LAN at `http://192.168.1.70:8094/`. The older file-mediated `llama-gemma-local-provider.service` is disabled and ports 8091 and 18092 are closed.

## Current deployment

| Item | Value |
|---|---|
| Model | Gemma 4 E4B QAT Q4_0 |
| MTP assistant | Gemma 4 E4B assistant Q8_0 |
| Service | `llama-gemma-zero-copy.service` |
| Loopback API | `http://127.0.0.1:18094/v1` |
| LAN UI and API | `http://192.168.1.70:8094/` |
| Context | 32,768 tokens, one resident slot |
| Maximum output | 2,048 tokens |
| Admission | Serial, at most eight outstanding HTTP requests |
| Cold prefill | Vulkan on Intel Iris Xe |
| Generation | CPU target with MTP depth 3 |
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

## Request lifecycle

The process loads CPU target, CPU assistant and Vulkan target model owners once at startup. A cold request then:

1. creates a fresh Vulkan context from the resident Vulkan target model;
2. renders and evaluates the chat prompt in that context;
3. requires `shared_bytes > 0` and `copied_bytes == 0` from `llama_kv_handoff_cpu`;
4. destroys the consumed Vulkan context while retaining the Vulkan model owner;
5. binds a CPU MTP assistant to the destination context;
6. re-evaluates the final prompt token and generates on CPU.

The transfer does not write a K/V state file. The response includes a `zero_copy` object with the route, byte counters and timings. The health endpoint reports cumulative handoff counters.

Only an exact append to the committed message/tool history reuses CPU K/V. An edited message, regenerated branch, changed tool list or different conversation resets the slot and performs another cold Vulkan prefill. The request can keep the same `X-Conversation-Id`; divergent history is a cold start, not an error.

A client disconnect aborts active inference and clears the resident slot. `DELETE /v1/stream` with the owning `X-Conversation-Id` explicitly cancels and clears it. The service streams prompt progress, content/reasoning and tool-call deltas to the embedded UI as they become available, but it does not keep a server-side replay buffer after a dropped stream connection.

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

Retained evidence: [Gemma zero-copy service qualification](../../../benchmarks/intel-1340p/gemma-zero-copy-service-20260915/README.md).

## Generation inheritance contract

A replacement Gemma serving path must preserve the accepted generation baseline or record an isolated matched reason for each difference. On 16 September 2026, the current-service audit reread all 48 `README.md` and `report.md` files under the indexed Gemma benchmark campaigns, the August [completion audit](../../../benchmarks/intel-1340p/ornith-gemma-optimization/completion-audit.md), the September [B0 baseline ledger](../../../benchmarks/intel-1340p/gemma-optimization-plan-20260911/baselines.md), the historical [512-prompt/64-output result](../../../benchmarks/intel-1340p/maple-qwen-campaign/performance/gemma/response-generation.json), and the current source, build and live process state. Future work starts from this table instead of reconstructing the decisions from chat history.

Status terms in this table are exact: `live` means enabled in `llama-gemma-zero-copy.service`; `excluded` means measured evidence does not support enabling it; `conditional-not-run` means a required parent failed before the candidate was reached; `research` means the result is too small or narrow for the current default. The [16 September generation-parity campaign](../../../benchmarks/intel-1340p/gemma-generation-parity-20260916/README.md) is the current deployment record.

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
| Standard attached target and draft threadpools | `common_init_from_params()` creates 8/16 pools; [current campaign](../../../benchmarks/intel-1340p/gemma-generation-parity-20260916/README.md) | Implemented but live-disabled | Excluded from the live profile: the eight-run comparison measured -1.98% decode. The code remains available through `--threadpools 1` for diagnostics |
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

The deployed ZC1 profile uses model metadata, `n_min=1`, MTP depth 3 and no attached pools. The final sustained A/B was throughput-neutral: 23.0666 live versus 23.0466 candidate tok/s (-0.09%), with identical work/output and zero swap. Future generation work starts from ZC1 and must preserve Vulkan residency, zero-copy ownership, streaming, cancellation, serial admission and `MemorySwapMax=0`.

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

The live 16 September deployment uses an immutable local closure. Git stores the closure hashes and dependencies in the [generation-parity deployment evidence](../../../benchmarks/intel-1340p/gemma-generation-parity-20260916/deployment/); `.gitignore` excludes `runtime/deployments/` binaries. The current paths are:

```text
candidate: runtime/deployments/gemma-generation-parity-ddb93ad19-7871f502
rollback:  runtime/deployments/gemma-zero-copy-rollback-0ba23ad3
```

The candidate environment explicitly sets `LLAMA_MTP_MIN=1`, `LLAMA_THREADPOOLS=0` and `LLAMA_MODEL_SAMPLING=1`. `tools/run-gemma-zero-copy-service.sh` emits these newer flags only when the installed environment defines them, which keeps the immutable rollback binary launchable.

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

The validated host has `Linger=yes`, which allows the user service to start without an interactive login. Check it with:

```bash
loginctl show-user "$(id -un)" -p Linger
```

## Operate and verify

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
curl -fsS http://192.168.1.70:8094/health \
  | jq -e 'select(
      .status == "ok" and
      .vulkan_model_resident == true and
      .zero_copy_ready == true and
      .shared_bytes > 0 and
      .copied_bytes == 0)'
```

Live zero-copy request:

```bash
curl -fsS http://192.168.1.70:8094/v1/chat/completions \
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
GEMMA_ZERO_COPY_URL=http://192.168.1.70:8094 \
  bun tools/gemma-hybrid/verify-stream.ts
```

The verifier requires at least one `prompt_progress` event, multiple content deltas before the terminal event, final zero-copy telemetry and zero copied bytes. Use `verify-stream-tool.ts` for streamed tool-call assembly.

Required tool-call request:

```bash
curl -fsS http://192.168.1.70:8094/v1/chat/completions \
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
systemctl --user enable --now llama-gemma-local-provider.service
curl -fsS http://127.0.0.1:8091/health
```

This restores the loopback rollback endpoint. The tracked LAN proxy now targets 18094; do not start it against the CPU rollback without changing and reviewing that target.

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
