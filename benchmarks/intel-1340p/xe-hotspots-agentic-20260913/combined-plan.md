# Final combined trained comparison

Compare the practical pre-batching/Q6-OFF baseline to allocation-level KV views plus the promoted Q6 opt-in. Both use the unchanged, retained O3 default Vulkan plugin. The large-tile candidate failed the O1 synthetic confirmation and is excluded. Shared KV is enabled in both arms, so this estimates the remaining hotspot changes rather than comparing against an obsolete file-handoff route.

Freeze the exact native caller, harness/tool responses, library hashes and four-run order in `combined-freeze.json`. Run one complete clamp repair plus follow-up per independently admitted process: baseline, combined, combined, baseline. Each run retains the independent hidden grades and final source, actual prompt/generated/evaluated/MTP work, prefix reuse, cold handoff/TTFT, warm native time and whole-workflow latency. Same task/interface as the completed original matrix; no retuning or changing task budgets. Original matrix and predecessor Q6 ABBA are separate evidence, not repeated or replaced.

Bounds per run: 600 seconds, 16 GiB memory, 16 MiB swap, 6 GiB host reserve, 10 rounds of at most512 tokens, MTP3,256MiB sandbox tools; initial Vulkan prefill then persistent CPU-owned warm rounds. Require fresh exact three-way admission for every run, automatic worker/tool cleanup, no competitors and unchanged services. No models/weights/services/config deployment changes.

Acceptance: report task outcomes first. Matched prompt/output/work is required for a causal timing comparison, though cross-backend token equality is not a general quality rule. Do not drop a valid slower observation. Compare medians/ranges for whole time, cold handoff, cold TTFT and warm native sum; do not add component speedups. Two runs per arm/one task is a small exploratory confirmation, not a confidence interval or broad agentic noninferiority bound. Retain defaults fixture failures from the original matrix.

After verification, publish raw evidence, merge qualified opt-in implementation into master, push and verify remote identity, then deliver charts showing gains, regressions, task outcomes and these limits. No deployment.
