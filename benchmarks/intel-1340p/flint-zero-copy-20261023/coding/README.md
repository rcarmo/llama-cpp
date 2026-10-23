# Flint executable coding benchmark — 23 October 2026

**Initial budget-calibration series.** The user rejected the 1,024-token cap. A separate completion-driven series removes output-token and generation-time caps. The capped results below remain intact and are not the final coding verdict.

## Result

**0/6 passed; 0/6 completed.** Every task reached the frozen 1,024-token output limit. No candidate reached the executable-assertion stage. Six finite native runs succeeded and drained; that is not a coding pass.

| Task | Prompt tokens | Generated tokens | Prefill seconds | Generation seconds | Generated tok/s | Stop | Task result |
|---|---:|---:|---:|---:|---:|---|---|
| csv-row | 135 | 1024 | 3.24 | 78.82 | 12.99 | limit | fail |
| merge-patch | 142 | 1024 | 3.35 | 79.09 | 12.95 | limit | fail |
| async-map | 144 | 1024 | 3.39 | 79.95 | 12.81 | limit | fail |
| subtract-ranges | 147 | 1024 | 3.46 | 80.96 | 12.65 | limit | fail |
| round-decimal | 186 | 1024 | 4.13 | 81.03 | 12.64 | limit | fail |
| glob-match | 122 | 1024 | 2.99 | 80.49 | 12.72 | limit | fail |

This establishes failure to complete these tasks within this output budget, not a general coding-quality score or a comparison with other models. Generated token counts include thoughts, not just JavaScript. All six raw outputs began with `<think>` despite `enable_thinking=false`; the native parser left that material in content and the separate reasoning field was empty. The false flag was a request, not an enforced thinking ban. No output was repaired, retried or truncated into an answer. The earlier incomplete 384-token thinking-on sample remains a separate failure.

## Frozen protocol

- Six JavaScript tasks: strict CSV row parsing, RFC7396 merge patch, ordered bounded async map, clipped half-open range subtraction, decimal-string half-even rounding, full UTF-16 glob matching.
- Exactly one fenced JavaScript block and a function assigned to `module.exports`; no dependencies/imports/filesystem/network. Incomplete output fails before code extraction.
- Prompts, references and hidden assertions were hashed before inference, and hashes verified before and after the suite. All six reference implementations passed **1,053 assertions** in the same scorer container; these are reference assertions, not successful candidate tests.
- Scorer boundary: networkless read-only container, capabilities dropped, no-new-privileges, 1CPU/256MiB/64PIDs/10s. Read-only benchmark directory and Bun binary only; no models, workspace-wide or secret mounts. Node vm is a secondary timeout aid, not the security boundary.
- One seed42 run per task; temperature1/top-k20/top-p0.95/min-p0; native model template and common_chat_session/sampler; maximum1,024 generated tokens; context2,048, F16KV, FAoff.
- Sigma CPU: 16-CPU allowance,16prompt threads,4decode P-core workers with explicit batch/decode masks, poll50, batch/microbatch512, explicit mmap and no_host. No GPU-cache arm because the throughput campaign rejected it. No other model or service restored.
- Q3_K_XL GGUF18494977472bytes, SHA256 `91b8d85ab6ff7fb095d9a972f9afa6f3fa2b9acb642867a079f3e013ea3c350c`. Binary/library identities are retained in `binary.sha256`; this benchmark predates the combined-branch build. Do not attribute its timings to that later build.

## Timing and resources

Generation timing includes sampling, finite-logit scans and per-token decode. It excludes model loading and prefill; native wall is prefill plus generation, not end-to-end request latency. Loading was not separately instrumented. Supervisor timestamps and resource samples retain the wider process envelope, sampled every2s.

Each native run had a 300s timeout,20GiB memory limit and zero container swap. Minimum host MemAvailable was 24.56GiB, above the6GiB guard. Maximum observed cgroup swap was0, all cgroup oom_kill counts0, and all post-exit receipts report exit0/oomfalse/PID0. Peak incremental cgroup charge was 0.470GiB; this is **not total model residency** because mmap-backed file-cache pages may be charged elsewhere. GGUF backing alone is17.22GiB.

## Retained files

`results.jsonl` contains original scoring outcomes; `results.json` and `results.csv` add timing/resource summaries. Case prompts, hidden tests/references, frozen hashes, raw and parsed outputs, native logs, cgroup/resource receipts, reference verification, scorer and runner are retained. Hidden tests were hidden from the model during generation; they are public here for audit. Reproduction scripts encode Sigma's original workspace/run paths; recreate that layout or adjust only paths and freeze a new series before generating anything. Do not overwrite this series.

No deployment, broad quality qualification, cross-model quality ranking or BF16 comparison is claimed.
