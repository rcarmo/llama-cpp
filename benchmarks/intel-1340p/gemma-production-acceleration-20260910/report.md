# Gemma acceleration deployed

The existing `http://127.0.0.1:8091` endpoint now serves GPU cold prefill followed by retained CPU/MTP decoding. Rui approved rollout at21:45UTC. Final release `20260910-sse1` passed production checks at22:25UTC on10September2026.

| Setting | Deployed value |
|---|---|
| Cold prefill | Pinned Iris Xe Vulkan FP32 attention selector |
| GPU batch / microbatch |1024 /256 |
| Eligible GPU input |4096..65536 tokens, cold text chat |
| Decode / CPU prefill | Retained `b10579-abdbeadfb`,8 /16 threads |
| Speculation | MTP depth3 |
| KV / attention |F16, compact SWA, FA off |
| CPU / GPU context |Two128K CPU slots / two72K GPU streams |
| Admission | Serial execution, at most8 outstanding requests |
| Alias |`gemma-4-e4b-qat-mtp`, unchanged |
| Supervisor / CPU PID at verification |632949 /632969 |

Warm turns stay on CPU. GPU starts on demand and stops before decoding. Larger or unsupported requests bypass GPU. Fully populated dual128K capacity remains unqualified. Serial execution replaces concurrent generation while preserving two cached conversations; this is a limit of the initial rollout.

## Production checks

The final smoke used a5236-token synthetic inventory prompt:

- `x-hybrid-route: gpu-cold`; native SSE reported5235 cached tokens and one evaluated CPU token.
- Streamed tool deltas assembled `lookup_stock({"sku":"PANDA-RESTORE"})` and terminated normally.
- Actual tool-result continuations under `none` and `auto` returned `23`, with the long prefix cached on CPU.
- A further cached append returned `RESTORED`.
- Counters: one GPU request, three warm CPU requests, zero fallbacks/errors, empty queue.
- Model listing, two idle128K slots, nine retained CPU executable/library hashes and zero CPU swap passed.
- No GPU worker remained after prefill.
- Native `/completion` SSE also completed using its `stop:true` terminal record.

`production-smoke-final.json` and `native-completion-stream-final.json` record final acceptance. This is functional verification, not a new latency benchmark. Prior performance measurements remain in the attention, coding and batch checkpoints. Worker startup, speech guards and serial admission add serving costs.

## Implementation

Source is under `tools/gemma-hybrid`. Initial code checkpoint: `75a880bab`. The native-completion SSE fix is checkpointed with this evidence. Production runs an immutable release copy rather than the mutable checkout.

The adapter renders and tokenises through the retained CPU server, selects a CPU slot by token-prefix overlap, and sends eligible cold text to the measured Vulkan worker. GPU saves bounded compact SWA. The restricted Gemma v3-to-v2 converter validates schema, token coverage and byte-identical KV payload before CPU restore. GPU stops before generation. SSE bytes are relayed directly; output is not buffered and converted into fake streaming.

One queue owns slot mutation until native EOF or cancellation cleanup. GPU failure before generation removes temporary transfers, invalidates the affected slot and falls back to CPU. Output already sent is never retried. CPU death invalidates the supervisor generation; systemd kills the cgroup and restarts with empty ownership. An OS lock prevents duplicate controllers sharing the private state directory.

Transfer names are generated locally and removed after use. Existing user cache files are untouched. Prompt/output content is not persistently logged. Native configuration and slot-file mutation routes are blocked to protect ownership. Ordinary OpenAI SSE, tools, read-only routes and template helpers are available. Native resumable-stream/replay/control extensions are not implemented. Unqualified features bypass GPU and depend on existing CPU compatibility. Request JSON is capped at2MiB.

## Native lifecycle evidence

Successful checks span retained stages; failed probes were not relabelled as passes.

| Check | Evidence |
|---|---|
| Cold GPU handoff with streamed tool output |`cold-sse.json`, final production smoke |
| Warm tool result, independent short owner, return to long owner | Successful rows in `attempt4-results.json` |
| Queued cancellation without releasing the active owner; decode-stream cancel | Successful cancellation row in `attempt4-results.json` |
| GPU cancellation with no orphan |`recovery-results.json` |
| Actual GPU SIGKILL, CPU fallback, correct answer |`recovery-results.json` |
| Actual CPU SIGKILL, new supervisor/worker PIDs, correct answer |`recovery-results.json` |
| GPU handoff into CPU slot1 after restart |`recovery-results.json`:4751 input,4750 cached, one evaluated |
| Native completion SSE termination |`native-completion-stream-final.json` |

The cancellation probe interrupted GPU startup/admission, not a long prefill already in progress. Recovery checks use short fixtures. Full64K backend handoff was qualified earlier, but a full64K HTTP request through this adapter and fully populated dual128K lifecycle have not been measured.

## Failures and fixes

1. **CPU library path:** staging omitted the existing runtime directory containing `libomp.so`. The restart loop was stopped and production restored. The corrected configuration includes both library directories; CPU/GPU `--version` probes pass.
2. **Converter return shape:** the adapter read the wrong field. The validated count is `conversion.parsed.tokens`. The failed transfer fell back to CPU; the corrected check has a regression test.
3. **Undersized kill fixture:** a prompt below4096 tokens correctly stayed on CPU, so no GPU PID existed to kill. The replacement fixture was tokenised explicitly and contained4751 tokens.
4. **Signal exit detection:** Bun reports a killed child with `exitCode=null`, `signalCode=SIGKILL`. Checking only the first field caused an unnecessary startup wait. Both are now checked; native GPU fallback and CPU restart pass.
5. **Native SSE termination:** `/completion` ends with `stop:true`, unlike OpenAI `[DONE]`. A post-cutover probe exposed an incomplete-stream error. Release `20260910-sse1` includes separate rules and passes both formats.

20 offline tests/58 assertions pass. They cover the converter, queue, owners, body limits, stream lifetime/disconnect, signal termination and both SSE formats. Delegated review attempts timed out; no independent review approval is claimed.

## Speech and resources

Speech clearance at21:59:32UTC covered integration, and22:19:47UTC covered cutover. Future GPU work retains job/native-CPU/CLI/socket guards,12GiB available before startup,6GiB while active and16MiB maximum swap per worker. Checks run before startup and every750ms during GPU work. New speech activity stops GPU only; CPU remains available. STT settings and private media/transcripts were untouched.

The bounded state converter is synchronous, so timer callbacks cannot run during conversion. Cancellation is checked immediately before and after it. This is a response-latency limit, not instruction-level preemption. No autonomous benchmark remains active after cutover.

## Rollback

The original unit, environment, launcher, binary and user cache files were preserved. Cutover used a stop hook and independent seven-minute rollback timer until acceptance. Successful markers are present; the temporary timer is stopped.

```
bash /var/home/agent/workspace/reports/gemma-production-acceleration-20260910/rollback.sh
```

Rollback stops the hybrid cgroup, restores the original unit, reloads systemd, starts CPU-only serving and checks health. It does not delete user cache files. Configuration/library/tool/cache checks are still required for a full rollback audit.

## Next objective

Acceleration is deployed within these bounds. Next: profile saved64K decode-only costs on the retained CPU, then optimise one measured target, draft or kernel bottleneck. Broad thread-count, MTP-depth and CPU-FA screens are already complete. CPU8/MTP3/FA-off remains the best measured decoder; a global maximum has not been established.
