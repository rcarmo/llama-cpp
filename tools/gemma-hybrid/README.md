# Gemma hybrid tools

`llama-gemma-zero-copy-server` owns a persistent single-slot Gemma session. A cold chat request prefills with Vulkan, moves the K/V cache into a CPU context in process, destroys the Vulkan owner, creates the CPU MTP borrower and generates the response. The request fails unless `shared_bytes > 0` and `copied_bytes == 0`.

Build and run it with:

```sh
cmake --build build --target llama-gemma-zero-copy-server
build/bin/llama-gemma-zero-copy-server \
  --model target.gguf --draft assistant.gguf \
  --host 127.0.0.1 --port 18094 --ctx-size 32768
```

The server provides the embedded UI, `/health`, `/props`, `/v1/models` and `/v1/chat/completions`. It accepts OpenAI messages and tools, parses tool calls and reuses K/V only when the request exactly appends to the committed history. An edited, regenerated or otherwise divergent branch resets the slot and runs cold, including requests with the same `X-Conversation-Id`. It is serial and replaces the resident conversation when a different conversation starts. Client disconnects abort the active decode and clear the slot. `DELETE /v1/stream` also clears the owning slot.

The service accepts non-streaming requests and finite SSE responses. It does not retain server-side replay data after a stream disconnect. Maximum request JSON is 16 MiB and at most eight HTTP requests may wait for the serial owner. Context and output limits come from `--ctx-size` and `--max-output`. Use an external supervisor for memory, swap and process limits. The Sigma profile uses `MemoryMax=16G`, `MemorySwapMax=0` and one 32K slot.

See [the Gemma zero-copy service qualification](../../benchmarks/intel-1340p/gemma-zero-copy-service-20260915/README.md) and [the in-process K/V handoff contract](../../docs/local/intel-i5-1340p/in-memory-kv-handoff.md).

`llama-gemma-in-memory` is the one-request native diagnostic. It retains target history and sampling in RAM and reports shared/copied bytes.

The TypeScript adapter below is the older file-mediated loopback implementation. It is retained for historical reproduction and is not used by the zero-copy LAN service.

## File-mediated adapter

Opt-in loopback adapter for the tested Intel Gemma configuration. GPU cold text prefill uses the pinned Vulkan FP32 selector with microbatch256; generation and warm turns use the retained CPU8/prefill16, MTP3, F16 KV, FA-off worker.

## Deployed CPU decode refinement

The qualified `20260910-smallbatch` release adds the opt-in retained-ABI [small target-batch patch](patches/README.md). CPU Gemma target batches of at most four tokens use the8-thread decode pool; large prefill remains16-threaded and the assistant is unchanged. Eight counterbalanced64K runs measured16.52% faster generation, with finite KV, tool/cache and large-prefill checks passing. Configuration must pin the candidate `libllama` hash and set `LLAMA_EXPERIMENTAL_SMALL_TARGET_BATCH=1`; the source patch alone does not activate it.

The `20260911-attn4` release retains that change and adds the [four-query F16 attention tile](patches/attn4.md). Eight counterbalanced 64K runs measured a further 2.90% median decode gain, from 8.5536 to 8.8020 tok/s. Ranges overlap. The candidate passed native reference tests, finite-state/tools/cache checks and a guarded production SSE cutover. It pins the CPU backend and enables `GGML_CPU_EXPERIMENTAL_ATTN4=1`; GPU and adapter code are unchanged. The previous smallbatch release is the rollback target. An earlier GPU-startup cutover aborted with an unexplained swap peak, rolled back, and is retained in the [evidence report](../../benchmarks/intel-1340p/gemma-decode-attn4-20260911/report.md).

The `20260911-score3-stopped` release adds the [score-only 3x4 tile](../../benchmarks/intel-1340p/gemma-decode-score3-20260911/patch/score3.patch) over ATTN4. The earlier eight-run comparison measured another 3.124% median decode gain (8.6634 to 8.9341 tok/s). Resumed finite64K/tool/cache qualification and one guarded production SSE cutover passed. See the [rollout report](../../benchmarks/intel-1340p/gemma-score3-rollout-20260911/report.md). It also enables the explicit stopped-speech policy below; the rollback target is ATTN4.

## Run

```
bun tools/gemma-hybrid/main.ts /absolute/path/config.json
```

Use a systemd unit with `KillMode=control-group`, `Restart=on-failure`, a restart rate limit and a private state directory. The parent owns both native workers. A CPU exit invalidates the entire supervisor generation. The OS lock on `<stateDir>.lock` prevents duplicate controllers using that directory. Native stdout/stderr are discarded to avoid persistent prompt logs.

Configuration supplies loopback host/port, `cpuUrl`, `gpuUrl`, `stateDir`, optional `minGpu`/`maxGpu`, and CPU/GPU profiles. Each profile has exact `argv`, an allowlisted `env`, and file SHA-256 `hashes`. Include all mapped model-runtime libraries and the executable. Do not put credentials in the worker environment.

This adapter is specific to the validated Gemma E4B compact-SWA F16 FA-off state schema. `state.ts` retains the restricted v3-to-v2 text-token converter and payload hash checks. It is not a generic llama.cpp router.

## API and limits

- Original loopback API and model alias are preserved through the CPU backend.
- Chat/completion SSE bytes, tool deltas and reasoning output are forwarded, not synthesised. Queue ownership lasts until EOF or cancellation cleanup.
- Cold text chat with4096..65536 tokens can use GPU. Output headroom remains governed by the CPU context. Larger/unsupported requests use CPU. This is not fully populated dual128K qualification.
- Warm conversations use token-prefix matching and two LRU CPU slot owners. No prompt text is logged. Admission is serial, with eight outstanding requests maximum. Two cached conversations are supported, but simultaneous generation is replaced by a queue.
- Maximum JSON request is2MiB. Native output budgets are retained. Client supplied slot IDs must be0,1 or-1.
- `/hybrid/status` reports only route counts, queue state and last token count/slot; no prompt/output content.
- Read-only native routes and token/template helpers are forwarded. Mutating native configuration and slot-file actions are blocked to protect ownership. Native stream replay/control extension routes are not implemented; ordinary OpenAI SSE is supported.
- Non-text chat, custom templates, multiple outputs and other unqualified features bypass GPU. Existing CPU backend compatibility governs those requests.

GPU starts on demand and stops before CPU decoding. Admission checks current speech job/native activity/queued bytes and12GiB available RAM before start, then6GiB reserve and16MiB per-worker swap continuously. Speech contention interrupts GPU work; CPU remains available. Accelerated requests have a20-minute internal deadline. A GPU failure before generation erases the affected CPU slot and falls back to CPU; responses are never replayed after output transmission starts.

When the owner deliberately stops both speech services, `speechMode: "stopped"` requires both loaded units inactive/dead with MainPID0, no speech listeners/connections and no native speech workers. Command failures, unexpected processes or reactivation block GPU admission. The default `speechMode: "active"` still requires a working jobs API; connection errors never imply idle. To use GPU alongside restarted speech, explicitly restore active mode and verify it. CPU fallback remains available in either mode.

Runtime checks do not prove capacity for all two-slot128K workloads. GPU eligibility is restricted when known retained owner prefixes exceed64K. CPU-only oversized requests remain subject to the original service's resource limits. There is no exactly-once external tool execution guarantee; this adapter does not execute tools.

## Tests

```
bun test tools/gemma-hybrid
```

Offline tests cover conversion, FIFO admission, cancellation, SSE lifetime/metadata, warm prefixes, independent slots, fallback, body/route limits, signal-killed processes and converter return shape. They do not replace native inference checks.

Native staging evidence is recorded under `reports/gemma-production-acceleration-20260910` in the development workspace: cold5236-token SSE tool call, warm result, two owners, queued/decode cancellation, GPU interruption, actualGPU SIGKILL fallback, actualCPU SIGKILL generation restart and subsequentGPU handoff into slot1. Failed launcher/return-shape/kill probes remain recorded. Test counts and deployment status belong in the rollout report; this source directory alone does not establish production deployment.

## Rollback

Keep the original unit, environment file, launcher, CPU binary and cache directory. Stop the hybrid service (its cgroup must stop bothworkers), restore the original unit, reload systemd and start it. Health, original argv/config/library hashes and tool/cache smoke must pass after rollback. Never overwrite/delete existing user slot files while installing or rolling back.
