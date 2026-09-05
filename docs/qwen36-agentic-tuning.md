## Qwen3.6 agentic prefill tuning

The three-turn fixture reads config.json, receives a 5.3K-token tool result,
reads worker.ts, then recommends a bounded retry configuration. It uses real
OpenAI-compatible tool calls, growing conversation history and prefix caching.
Run it with Bun:

```bash
BENCH_URL=http://127.0.0.1:8090 bun tools/pi/benchmarks/qwen-agentic.ts /workspace/tmp/agentic-run
```

Requests, responses and timing summaries are saved for inspection. The fixture
executes no model-selected filesystem commands: tool results are deterministic
mock data. Its final-answer check is a lexical smoke check, not a semantic judge;
inspect the saved answer for incorrect explanations even when `passed` is true.
`parallel_tool_calls:false` makes the serial inspection contract explicit.

## Failures and root causes

| Observation | Cause and resolution |
|---|---|
| CUDA OOM on repeated cycles at 24 cache slots / microbatch 1024 | Backtrace reaches `cudaGraphInstantiate`. Additional executable graph allocation exhausts remaining VRAM. Reduced expert cache to 16 slots; retained faster 1024 microbatch. Five consecutive cycles and live validation passed. This is a configuration mitigation, not a general CUDA OOM recovery fix. |
| Eight-slot candidate returned two reads together | Fixture expected one call but did not set the parallel-tool-call policy. Set `parallel_tool_calls:false`; serial-call checks then passed for 8, 16 and 24 slots. |
| Unsupported cache-reuse warning | Hybrid context disables chunk-shift cache reuse. Removed `--cache-reuse 512`; ordinary prefix caching remains enabled and measured. |
| Erratic decode and total task timings | Concurrent host work causes contention; repeated runs include large outliers. These samples cannot establish isolated hardware performance or tail-latency guarantees. |

The CUDA graph creation/update paths were inspected. They currently treat
instantiation failure as fatal. Retrying a captured graph through eager execution
requires careful accounting for recurrent-state writes and executable ownership;
no untested fallback was added just to suppress the failure.

## Measurements and selected trade-off

The old 24-slot / 512-microbatch baseline completed the task in 8.38 seconds,
with 4.87 seconds processing the 5,326-token new tool result. The last turn
reused 5,713 tokens and evaluated only 76 new tokens. Prompt threads 4, 5 and 6
all needed roughly 4.9 seconds for that tool result; extra threads did not help.

Microbatch 256 took about 6.9 seconds for prefill. Microbatch 768 took about
4.7 seconds. Microbatch 1024 with 16 cache slots took about 3.9 seconds.
Five consecutive cycles at 16/1024 passed the fixture checks, with total times
7.47, 7.12, 7.23, 18.79 and 9.20 seconds. Prefill times were 3.87-4.17 seconds.
The outliers remain part of the results, not discarded samples.

The deployed 16-slot / 1024-microbatch profile completed the same task in
7.48 seconds, including 3.88 seconds of tool-result prefill. Relative to the
initial baseline, that is about 11% lower task latency and 20% lower prefill
latency. It generated 1,024 tokens at 82.55 tok/s, versus the earlier 84.08 tok/s
with the decode-oriented profile (about 1.8% lower). This favours agentic
prefill without claiming a universal throughput gain.

All other selected settings remain: four threads, 32K single slot, q4 KV,
Flash Attention, native MTP depth one, resident loading and async CPU off.
The generalised async scheduler did not improve the previous matched MoE tests.

## Near-32K agentic validation

Set `BENCH_ROWS=1700` to generate the larger tool result. The fixture bounds
rows to 1-1700 and calls the chat token-count endpoint before each completion,
rejecting requests whose prompt plus the 512-token output budget exceeds 32K.
Invalid row counts are rejected before any request.

```bash
BENCH_ROWS=1700 bun tools/pi/benchmarks/qwen-agentic.ts /workspace/tmp/agentic-long
```

Two repeated cycles reached 31,689 prompt tokens. The tool-result turn processed
31,226 new tokens at 1,249.75 and 1,231.59 tok/s. The final turn reused 31,613
tokens and processed only 76 new tokens, generating at 65.69 and 65.32 tok/s.
Total cycle times were 34.02 and 29.45 seconds, including token-count requests.
Both responses correctly identified zero as unlimited retries and recommended
setting maxRetries to 3. A preceding 27,889-token cycle also passed, although
its decode timings were much lower under contention.

A normal-size three-turn task immediately afterward passed in 6.98 seconds;
health remained OK. Process VRAM after these varied graph shapes reached
11,576 MiB, higher than the short-prompt footprint. This leaves little margin
for additional GPU workloads; the successful runs do not guarantee that every
possible request shape will fit. No fresh configuration change was made during
this follow-up.

## Limits and rollback

The initial sweep covered approximately 5.8K tokens of history. Subsequent
long-context validation reached 31,689 prompt tokens in two repeated agentic
cycles, with the correct serial tool calls and configuration correction. This
is a deterministic fixture, not a claim about arbitrary agents or full-32K
semantic quality. No broad model
instruction-following defect is claimed fixed by a request-policy change.
No CUDA runtime source change was needed for the selected configuration.

For the former decode-oriented profile, restore 24 cache slots and microbatch
512 in `tools/pi/bin/run-qwen36-27b-mtp-cuda.sh`, install the launcher, and restart
`llama-qwen36-27b-mtp.service`. Keep microbatch 1024 paired with the lower cache
footprint unless additional request-time graph headroom has been validated.
