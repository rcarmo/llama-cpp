# Flint completion-driven coding evaluation

**Running at this publication checkpoint. 2 of 2 completed tasks passed; the six-task result is not established.** The original [1,024-token series](../coding/README.md) is retained as budget calibration after the user rejected its output cap.

## Generation policy

- The same six prompts, references and hidden assertions are frozen unchanged. References pass 1,053 assertions; five scorer-boundary self-tests pass.
- No output-token cap and no native generation/process timeout. Generation runs to model EOG. Resource-guard or context-capacity exits are recorded as incomplete.
- Thinking is enabled, with native reasoning separation requested. A fully closed leading model-native thought block can be separated structurally if the parser leaves it in content. The final answer must still be exactly one fenced JavaScript block. No code repair or semantic test changes.
- The physical context is 16,384 tokens within the existing 20 GiB execution cap; the training context is 262,144. Context capacity is finite. No shifting, truncation or forced reasoning close.
- CPU allowance 16; 16 prompt / 4 P-core decode workers; batch/microbatch 512; F16 KV, FA off; explicit mmap/no_host; unchanged Q3_K_XL. Host reserve at least 6 GiB and zero container swap.
- Untrusted candidate execution retains its separate 10-second sandbox safety limit. That limit does not stop model generation.

The raw output and progress are persisted locally every 128 tokens under workspace `tmp/llama-cpp/runs/flint-trial-20261023-be9528654612/coding-unlimited/`. `checkpoint.json` is a dated snapshot, not a live feed. Only completed rows can be scored; no six-task total or cross-model quality ranking is established. Final outcomes and resources require a later report update.

## Publication verification pause

Native processes were suspended with SIGSTOP for the publication build/tests and a short dependency check, then resumed with SIGCONT. The container, model/KV and sampler state were retained; no generation restart or replacement answer was used. The append-only `publication-pause.jsonl` records the interval. Native wall/generation timing includes that interval, so this series is not a throughput comparison with the earlier replay campaign. If verification is still running in the checkpoint, the resume event will appear in the later final evidence.

## Reproduction and identities

[Protocol](plan.md), `FROZEN-SHA256SUMS`, `SOURCE-HEAD`, `source-before-generation.patch`, model/binary hashes, all case inputs, verifier, reference checks and Sigma-specific runner are retained. Recreate the original layout or adjust paths and freeze a new series; do not overwrite this one. The source snapshot predates the publication commits. The [combined-source verification](../integration-verification.md) records later checks separately.

No model service was restored. The server's own output admission limits are unchanged.

## Completed at checkpoint

| Task | Stop | Generated tokens | Assertions | Result |
|---|---|---:|---:|---|
| csv-row | eog | 6095 | 33 | pass |
| merge-patch | eog | 2220 | 9 | pass |

The first CSV task completed after 6,095 tokens and passed all 33 assertions. The original 1,024-token budget prevented that completion. Remaining tasks continue without output-token or generation-time caps.
