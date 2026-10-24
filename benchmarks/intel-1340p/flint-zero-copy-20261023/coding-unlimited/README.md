# Flint completion-driven coding evaluation

**Completed: all six tasks passed, with 1,053 assertions and natural EOG.** The original [1,024-token series](../coding/README.md) is retained as budget calibration after the user rejected its output cap.

## Generation policy

- The same six prompts, references and hidden assertions are frozen unchanged. References pass 1,053 assertions; five scorer-boundary self-tests pass.
- No output-token cap and no native generation/process timeout. Generation runs to model EOG. Resource-guard or context-capacity exits are recorded as incomplete.
- Thinking is enabled, with native reasoning separation requested. A fully closed leading model-native thought block can be separated structurally if the parser leaves it in content. The final answer must still be exactly one fenced JavaScript block. No code repair or semantic test changes.
- The physical context is 16,384 tokens within the existing 20 GiB execution cap; the training context is 262,144. Context capacity is finite. No shifting, truncation or forced reasoning close.
- CPU allowance 16; 16 prompt / 4 P-core decode workers; batch/microbatch 512; F16 KV, FA off; explicit mmap/no_host; unchanged Q3_K_XL. Host reserve at least 6 GiB and zero container swap.
- Untrusted candidate execution retains its separate 10-second sandbox safety limit. That limit does not stop model generation.

The raw output and progress are persisted locally every 128 tokens under workspace `tmp/llama-cpp/runs/flint-trial-20261023-be9528654612/coding-unlimited/`. `checkpoint.json` is a dated snapshot, not a live feed. Final scores are in results.jsonl; final-checkpoint.json supplements the original dated snapshot. All six tasks passed. This small frozen suite does not establish a broad quality ranking.

## Publication verification pause

Native processes were suspended with SIGSTOP for the publication build/tests and a short dependency check, then resumed with SIGCONT. The container, model/KV and sampler state were retained; no generation restart or replacement answer was used. The append-only `publication-pause.jsonl` records the interval. Native wall/generation timing includes that interval, so this series is not a throughput comparison with the earlier replay campaign. The publication pause remains part of the recorded timing. The final scores extend the original two rows without regenerating answers.

## Reproduction and identities

[Protocol](plan.md), `FROZEN-SHA256SUMS`, `SOURCE-HEAD`, `source-before-generation.patch`, model/binary hashes, all case inputs, verifier, reference checks and Sigma-specific runner are retained. Recreate the original layout or adjust paths and freeze a new series; do not overwrite this one. The source snapshot predates the publication commits. The [combined-source verification](../integration-verification.md) records later checks separately.

Later user-authorised Flint serving was replaced by ThinkingCap; see the current model-serving status. This evaluation does not change server output admission limits.

## Final completed results

| Task | Stop | Generated tokens | Assertions | Result |
|---|---|---:|---:|---|
| csv-row | eog | 6095 | 33 | pass |
| merge-patch | eog | 2220 | 9 | pass |
| async-map | eog | 6013 | 22 | pass |
| subtract-ranges | eog | 1621 | 890 | pass |
| round-decimal | eog | 10253 | 23 | pass |
| glob-match | eog | 4731 | 76 | pass |

The first CSV task completed after 6,095 tokens and passed all 33 assertions. The original 1,024-token budget prevented that completion. All remaining tasks also completed without output-token or generation-time caps. The later ThinkingCap comparison preserves this cohort separately.
