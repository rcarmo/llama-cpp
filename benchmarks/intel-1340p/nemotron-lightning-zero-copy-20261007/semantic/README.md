# Native semantic and interruption supplement

7 October 2026. Same exact Lightning Q4 model and strict handoff checkpoint; no service started, no primitive/ABBA tests repeated. Parent evidence commit `ea689cf7b`; semantic harness checkpoint `3c0ca591dcd526e1e54a0f7a150ca5419ff20cdc`. New on-demand harness: `tests/test-nemotron-semantic-handoff.cpp`, linked to existing `llama-common` Jinja template renderer, PEG response parser, sampler and tokenisation. This is not a server/API/browser qualification.

[Structured task/resource results](results.json), [source manifest](source-manifest.txt), native `*-response.json`, `*.log`, request/token IDs, cgroup samples and SIGKILL phase markers are retained here. [Prespecified plan and reproduction helpers](../reproduce/semantic/semantic-plan.md).

## Task results

One CPU and one handoff observation per fixture. Both pass:

| Fixture | Exact independent check | Prompt tokens | CPU / handoff total seconds |
|---|---|---|---|
| Nonthinking arithmetic plus warm follow-up | `42`, then `40` | 31, then 60 total; 33 cached / 27 evaluated | 3.599 / 17.359 |
| Nonthinking JavaScript uniqueStable | Six executed assertions: ordering, no mutation, empty input, strings, object identity, NaN | 47 | 6.405 / 14.508 |
| Positional recall from 96 synthetic records | Record 047 = `marker_5dbe6` | 1324 | 34.520 / 31.642 |
| Required weather tool plus result follow-up | get_weather Lisbon, tool result21C, final answer `21` | 278, then352 total;304 cached /48 evaluated | 11.317 / 23.457 |
| Thinking arithmetic | Nonempty parsed reasoning, answer `42` | 31 | 12.764 / 29.224 |

Prompt and generated token IDs are retained. CPU/handoff nonthinking code used 48/16 generated tokens, respectively; thinking arithmetic used129/149. These differing outputs and one observation each do not support speedup claims. The recall response was correct, but the timing difference is a single sample. The earlier fixed-token timing screen remains separate.

Nonthinking uses temperature0, thinking uses temperature1; seed42, top-p0.95/min-p0, native common sampler default ordering/top-k. No model-derived sampling-default import, worker-affinity qualification or server grammar defaults claimed. Output limits32 arithmetic/recall,128 tool,256 code,320 thinking. Every accepted response reaches EOG rather than truncation. Jinja reasoning format is DeepSeek with enable_thinking toggled separately. Tool grammar/triggers and preserved tokens are inherited from the renderer; test tool IDs are synthesised locally, not real external tool execution.

Generated code was executed in a read-only, network-disabled, CPU1/256MiB/10s Podman container using Bun, with no secrets or model/GPU access. Logs: `code-{cpu,handoff}-independent-check.log`.

## Ownership and resources

Handoff reports `268937728` shared bytes / zero copied state bytes for the allocated4096-token context. Source context and GPU model are destroyed before CPU generation. Arithmetic/tool follow-ups remain CPU-owned with33/304 cached prompt tokens; no second GPU load or handoff occurs. This validates those exact warm histories, not arbitrary divergent prefixes: the harness rejects rollback beyond its three retained slots.

CPU4, batch512/microbatch128, F16K/V/F32R/S, FAoff, rs3, mmap,20GiB model cgroup/no swap, physical Intel renderD128, host reserve>=6GiB,180s per native process. All10 accepted task runs have zero sampled swap/OOM/OOM-kill. Maximum cgroup peak20GiB, minimum sampled available memory12,179,292KiB. `memory.events` was polled; final counters may have advanced between the last sample and process exit. Do not infer absent reclaim from sampled zero counters at the cap. No dedicated thermal/worker telemetry.

## Native process interruption

A watcher observed the native harness's `prefill_started` marker on a recall request, then SIGKILLed its container process. A second run was killed after `generation_started` on the CPU-owned post-handoff context. Both exit137, have `OOMKilled=false`, leave no native process/container, and discard all uncertain state. Phase markers show the intended phase; there is no device-fence proof that a GPU kernel was executing at the exact instant of the prefill kill.

A fresh handoff process after both kills answers `81` for9x9, completes EOG, reports positive shared bytes/copy0 and destroys the GPU owner before decoding. This qualifies native-process teardown/fresh restart only: not graceful disconnect cancellation, server queues, persistence recovery, driver reset/crash, or exactly-once real tools.

## Harness corrections and limits

An initial arithmetic response parser was missing `parser.parser.load(chat.parser)`, so it included prefixed assistant/thinking markers in parsed content. This was a harness omission, corrected before accepting the final arithmetic/tool matrix. The invalid response is retained in `invalid-parser-omitted-arena-response.json`. No model/kernel tolerance was changed. Changing reasoning_format alone was insufficient; the native service's explicit parser-arena load was reused.

Future harness output records the explicit sampler chain/settings. Accepted observations above precede that report-only addition; hashes are retained separately. CPU and Intel builds verify the final harness, without repeating model work. No full CI or broad statistical quality inference.

Compute was explicitly drained/released to @whisper. Qwen11434/8094, Gemma and speech stay inactive/disabled; models/configs/history and primary checkout policy edits are untouched. No push, default-branch merge or persistent deployment.

## Prior-feature reuse supplement

- Applied: existing native `common/chat.*` Jinja rendering and loaded PEG parser arena, `common/sampling.*`, renderer-derived tool grammar/triggers; all five fixture pairs exercise the renderer/parser, required tool round-trip exercises grammar and IDs.
- Adapted: retained Nemotron API arithmetic/uniqueStable/weather fixtures from the original CPU qualification; native harness changes transport and sampling, so this is a new series, not an API latency comparison. Independent output checks and code execution retained.
- Applied: existing strict handoff source consumption, mmap and GPU-owner release, CPU warm-prefix ownership. All handoff fixtures report shared/copy accounting; arithmetic/tool cached follow-ups do not reload GPU.
- Adapted: guarded bounded launcher/cgroup monitor, phase-targeted native process termination and fresh reconstruction. SIGKILL observations test teardown only; serving queues, SSE/disconnect and driver reset remain deferred.
