# Baseline control: task failure and shutdown-sampling race

`clamp-baseline-control` used the pre-batching library with the same corrected native caller, fixture, prompt and limits. It also made the invalid nested-function edit and failed the independent final-artifact grade. On round five it reached the 512-token output limit. It generated 631 tokens across five rounds; the unit ran 52.217s with an 11.8GiB peak and zero unit swap.

The original result additionally records `worker swap guard`. The final sample has `swap_kib:null`; every preceding swap sample is zero. During intentional native shutdown, `/proc/PID/status` lost its `VmSwap` field before the periodic sampler stopped. Converting the missing value produced NaN, which triggered the fail-closed guard. No competing processes were sampled and minimum available memory was 16,614,348KiB. The original result is retained and excluded from qualified timing comparisons.

The runner now stops its sampling interval before sending the deliberate close request. The workflow deadline and cgroup remain active, the native exit code is still checked, and the reader is awaited. Live-process resource guards are unchanged. A focused test verifies this ordering and rejects a nonzero exit. Another regression checks the saved terminal-null sequence separately from the already-observed output-limit failure. Ten outcome/tool tests pass with 51 assertions.

Evidence: `agentic-runs/clamp-baseline-control/`, `evidence/baseline-diagnostic.json`, `evidence/outcome-shutdown-tests.log`. The exact pre-fix runner is retained as `source-history/agentic-runner-baseline.ts`. All native/tool workers and containers drained, services remained unchanged, and both peers received the exact-ID release.

This control has no successful task result. Its initial handoff was 69.379ms, versus the single candidate's 62.186ms; differing generated work and the shutdown race prevent a performance conclusion. Retain the observations for later matched confirmation rather than attributing the difference to batching.
