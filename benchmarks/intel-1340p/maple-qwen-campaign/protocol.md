# Maple, Gemma and Qwen campaign protocol

This campaign compares quality first and performance second on the LattePanda Sigma. Each model runs alone. The hosted Pi default does not change.

## Fixed host controls

- CPU: Intel Core i5-1340P.
- Model workers: logical CPUs 0-7, the four P-core SMT pairs.
- Process affinity: logical CPUs 0-15.
- Threads: 8.
- Service switching: stop the active local model before starting the next model.
- Cool start: package temperature below 60 C and one-minute load average below 1.5.
- Thermal abort: stop a measured run after three consecutive samples at or above 97 C.
- Telemetry interval: 1 second for performance runs.
- Promotion threshold: at least 2% repeated end-to-end improvement.

## Model profiles

Maple and Gemma use two independent 131,072-token slots. Qwen uses one 131,072-token slot. Quality requests run serially, so slot count does not affect their result.

| Model | KV | Batch / ubatch | MTP | Prompt-state cache |
|---|---|---:|---:|---:|
| Maple exact compact | F16 | 2048 / 512 | none | 12,288 MiB |
| Gemma 4 E4B | F16 | 1024 / 256 | 3 | 12,288 MiB |
| Qwen3.6 35B-A3B Q2 | Q4_0 | 1024 / 256 | 3 | disabled |

Operational differences remain because they are part of each accepted deployment. Requests, reasoning budgets, seeds and validators are identical. Maple and Gemma bind to loopback. Qwen's accepted service binds to all interfaces, while this campaign sends requests only to `127.0.0.1:8090`.

## Six-case API corpus

The cases are:

1. missing-evidence refusal;
2. cached dependent follow-up;
3. strict JSON instruction following;
4. required repository tool selection;
5. implementation debugging;
6. repository implementation planning.

Reasoning and total completion limits:

- missing evidence: 96 reasoning tokens, 192 total tokens;
- tool and strict JSON: 128 reasoning tokens, 256 total tokens;
- engineering prose: 256 reasoning tokens, 1,024 total tokens.

Each response records wall time, prompt and generation rate, generated tokens, reasoning and content lengths, finish reason, tool name and semantic validation.

## Quality scoring

Objective checks run before review:

- exact JSON shape and values;
- one required tool call with valid JSON arguments;
- requested tool argument precision;
- visible answer after bounded reasoning;
- no reasoning tag leakage;
- missing-evidence refusal;
- independent test success for code edits;
- allowed-file constraint and diff minimality;
- token-limit convergence.

Blind review compares anonymised outputs for factual support, instruction compliance, usefulness and unsupported claims. A model does not pass a prose convergence gate when it reaches the 1,024-token limit.

## Performance protocol

Matched measurements use short prompt, 4K prompt, 32K prompt and generation. Cached long-prefix tests are reported separately because Qwen has no separate RAM prompt-state cache. First-token latency, one-request throughput, configured slot count, RSS/PSS, faults, swap and package temperature are recorded. Configured slots do not prove concurrent throughput; Maple's separate two-request trial is reported as operational evidence.

A context or concurrency result is never presented as matched when model geometry differs.

## Safety and rollback

The accepted Maple exact compact service on port 8093 is the rollback reference. Gemma remains the primary local model. The hosted default remains `github-copilot/gpt-5.6-terra`.

No candidate representation replaces the Maple provider until numerical, API, Pi and agentic checks pass. The final campaign commit is authorised. A push or pull request requires separate approval.
