# Frozen write-v2 comparison

The candidate clamp pilot passed; do not count it as a balanced timing repetition. Keep this new matrix separate from edit-v1 failures.

Factors held constant: current native binary, target/assistant models, write-v2 tools/system prompt, stable model-visible test durations, raw result capture, all three fixtures/hidden grades, 10 rounds x512 tokens, MTP3, context8192, batch256, threads8/16, unchanged initial GPU->CPU path. Baseline uses prior allocation library; candidate uses batched allocation library. No Q4 candidate kernel is integrated.

Screen exactly six runs, separately admitted and strictly sequential:

| Order | ID | Fixture | Arm |
|---:|---|---|---|
| 1 | w2-clamp-b0 | clamp | baseline |
| 2 | w2-clamp-c0 | clamp | candidate |
| 3 | w2-median-c0 | median | candidate |
| 4 | w2-median-b0 | median | baseline |
| 5 | w2-defaults-b0 | defaults | baseline |
| 6 | w2-defaults-c0 | defaults | candidate |

This is a balanced-order screen, not a precise throughput estimate. Failures count and are independently graded; stop on unsafe resource/native behaviour. A failed model task does not silently earn a retry. Per-run cap remains600s/16GiB/swap16MiB/reserve6GiB. No process overlaps or service changes.

Record pass/fail per phase, tool adherence, time to correct solution, initial handoff/TTFT, warm request/cache/evaluated/generated work and MTP counts. Compare timing only for equivalent successful tasks; if work differs, show it and avoid a kernel speedup claim. Tool timings remain in raw evidence but not prompts. Check identical prefix hashes before interpreting later divergence.

After screening, choose confirmation repetitions only if they could change the decision. An individually small repeatable cold-stage gain remains useful and should later be measured with Q4/Q6/Vulkan candidates. No percent cutoff, no sum of percentages, and no claim that this screen covers long conversations.
