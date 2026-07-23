# Qwen Q4_K_M at 16K context — 2026-07-23

Q4_K_M loads safely with one 16K slot and retains its short-context speed, but newly ingested 4K context is too slow for interactive use. Cached long conversations are viable because prefix reuse avoids repeated prefill.

## Configuration

The test changed only context and slot path from the production launcher:

- model: `Qwen3.6-35B-A3B-UD-Q4_K_M-MTP.gguf`;
- one 16,384-token slot;
- eight main/batch/draft workers;
- batch 2,048, microbatch 512;
- q8_0 K/V;
- MTP draft minimum/maximum 1;
- prompt caching enabled;
- no warm-up.

## Load and short-context result

The server loaded with 8.33 GiB available, comparable to the 4K service before the test. The larger configured context is allocated lazily.

| Workload | Prompt | Generation | Draft acceptance |
|---|---:|---:|---:|
| 28-token cold request | 21.88 tok/s | 6.97 tok/s | 24/38 |
| Same request, 24 cached tokens | 11.50 tok/s for 4 new tokens | 7.05 tok/s | 24/38 |

Configured 16K context does not reduce short-context generation speed.

## Used 4K context

A README prefix produced an actual 4,122-token chat prompt.

| Workload | Prompt | Generation | Total wall time |
|---|---:|---:|---:|
| First ingest | 6.42 tok/s | 2.67 tok/s for 32 tokens | 653.9 s |
| Repeated prefix, 4,118 cached | 2.81 tok/s for 4 new tokens | 2.67 tok/s for 32 tokens | 13.4 s |

The first ingest required 642 seconds of prompt evaluation. The repeated request reused 4,118 tokens and evaluated only four, but generation stayed at 2.67 tok/s because each new token still attends to the active 4K context.

Available memory after the used-context request was about 7.9 GiB. No memory or service errors occurred, and output was coherent. MTP accepted 15/15 draft tokens for the long-context response.

## 8K decision

An 8K request was not run. The measured 4K prefill already exceeds ten minutes, and attention cost lowers generation to 2.67 tok/s. An 8K test would consume substantial time without changing the deployment conclusion.

## Deployment decision

Keep the production launcher at 4K for general interactive use. A separate one-slot 16K profile is technically safe and useful when the prompt prefix can be cached across turns. It is not suitable for repeatedly ingesting new multi-thousand-token documents.

The 16K test server was stopped, its isolated slot directory removed, and the normal 4K Q4 service restored on port 8090. `/health` returned `{"status":"ok"}`.
