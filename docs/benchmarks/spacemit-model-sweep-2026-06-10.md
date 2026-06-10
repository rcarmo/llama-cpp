# SpaceMIT model benchmark sweep — 2026-06-10

Branch: `exp/dense-fallback-profile`

Commit under test: `24a0e2d docs: add spacemit default fast path runbook`.

Fast paths are default; no `SPACEMIT_EXPERIMENTAL_*` accepted-route flags were used.

## Method

The production `qwen-reap` server was temporarily stopped to avoid TCM/CPU contention, then restarted and health-checked after the sweep.

Command per model:

```sh
timeout 900s build/bin/llama-bench -m "$model" -t 8 -p 16 -n 16 -r 3
```

Standalone text-model results are shown as `pp16` and `tg16` tokens/sec. Files that failed to load are retained in the table; these are likely auxiliary/projector/assistant artifacts rather than standalone text models.

## Results

| Model | Size GiB | Status | pp16 tok/s | tg16 tok/s | Elapsed | Notes |
|---|---:|---|---:|---:|---:|---|
| `Qwen3.6-28B-REAP20-A3B-Q4_K_M.gguf` | 16.08 | ok | 26.25 ± 0.33 | 7.59 ± 0.05 | 118s |  |
| `asst-mtp.gguf` | 0.09 | fail_1 |  |  | 1s | failed to load model |
| `gemma-4-12B-it-qat-UD-Q4_K_XL.gguf` | 6.26 | ok | 23.62 ± 0.02 | 3.51 ± 0.00 | 39s |  |
| `gemma-4-E2B-it-mmproj.gguf` | 0.92 | fail_1 |  |  | 0s | failed to load model |
| `gemma-4-E2B-it-qat-UD-Q4_K_XL.gguf` | 2.44 | ok | 92.41 ± 0.11 | 12.96 ± 0.01 | 12s |  |
| `gemma-4-E2B-it-qat-mmproj-F16.gguf` | 0.92 | fail_1 |  |  | 0s | failed to load model |
| `gemma-4-E2B_q4_0-it.gguf` | 3.12 | ok | 87.49 ± 0.13 | 11.80 ± 0.01 | 18s |  |
| `gemma-4-E4B-it-Q4_K_M.gguf` | 4.64 | ok | 50.87 ± 0.01 | 6.77 ± 0.02 | 30s |  |
| `gemma-4-E4B-it-assistant.Q8_0.gguf` | 0.09 | fail_1 |  |  | 1s | failed to load model |
| `gemma-4-E4B-it-qat-UD-Q4_K_XL.gguf` | 3.93 | ok | 59.88 ± 0.02 | 7.72 ± 0.01 | 21s |  |
| `qwen2.5-1.5b-q4_k_m.gguf` | 1.04 | ok | 149.03 ± 0.12 | 21.20 ± 0.01 | 11s |  |
| `qwen3-0.6b-q4_k_m.gguf` | 0.37 | ok | 234.29 ± 0.36 | 39.51 ± 0.03 | 6s |  |

## Server status after benchmark

Production launch script restarted successfully:

```sh
/home/me/run-qwen-reap-server.sh
```

Health check:

```json
{"status":"ok"}
```
