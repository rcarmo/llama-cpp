# Final combined agentic comparison

Allocation batching plus promoted Q6 changes whole-workflow median time by **-1.76%** and warm native median time by **-1.92%** against the retained pre-batching/Q6-OFF control. Both arms use shared KV and the same unchanged O3 default Vulkan plugin. This is a combined effect, not a sum of stage percentages.

| Run | Arm | Whole seconds | Warm native seconds | Cold handoff ms | Repair / follow-up |
|---|---|---:|---:|---:|---|
| combined-clamp-b0 | baseline | 57.933 | 48.567 | 69.019 | PASS / PASS |
| combined-clamp-c0 | combined | 56.225 | 47.531 | 64.966 | PASS / PASS |
| combined-clamp-c1 | combined | 57.551 | 48.350 | 67.156 | PASS / PASS |
| combined-clamp-b1 | baseline | 57.886 | 49.195 | 72.277 | PASS / PASS |

| Metric | Baseline median | Combined median | Time change |
|---|---:|---:|---:|
| Whole workflow | 57909.306 ms | 56888.138 ms | -1.76% |
| Warm native sum | 48.881 s | 47.941 s | -1.92% |
| Cold handoff | 70.648 ms | 66.061 ms | -6.49% |
| Cold first token | 6.715 s | 6.690 s | -0.37% |
| Warm first-token sum | 18.185 s | 17.925 s | -1.43% |

All four runs pass both hidden grades with identical prompts/tools, raw output and final source. Each has 10 rounds, 572 generated, 900 evaluated, 549 drafted and 389 accepted tokens. The persistent CPU owner reuses the evaluated prefix on warm rounds; only the initial prefill uses Vulkan. Frozen harness/native/library hashes and loaded maps are checked by compare-combined.ts; original unit logs and per-round manifests are retained.

Every run respected 600s / 16GiB / 16MiB swap / 6GiB reserve bounds, recorded zero swap/no sampled competitors and unchanged services. All native GPU/CPU/MTP/tool workers and trial containers/render-device holders were absent before each exact release. Unit runtime includes supervisor overhead; the table uses measured runner whole-workflow time. No deployment or service change.

## Limits and rejected candidates

Two observations per arm on one repair task establish an exploratory confirmation, not a confidence interval or broad noninferiority result. Ranges and individual observations remain in combined-summary.json. The original six-run matrix still has 4/6 completed workflows and 6/6 correct final artifacts; defaults reaches the round cap in both arms. Its failures are not erased by the final clamp passes.

The Q4 width 4 tile regressed in 3/4 eight-thread groups; its smaller two-thread opportunity stays report-only. The Vulkan large 128x128 selector passed correctness but regressed +250.36%/+225.80% in the O1 untraced screen; default medium 64x64 remains unchanged. CPU Q6 is opt-in and device/shape gated; full generic-backend, broader hardware, long-context capacity and serving recovery are unqualified.

The first final baseline preflight had a crypto ArrayBuffer type error before any unit/model launch; it was corrected to bytes before the sole admitted run. No failed or contended trained run was dropped from this final matrix. Earlier campaign failures stay published.

See charts/agentic-progress.svg, charts/hotspot-decisions.svg and their chart-data.json/CSV for data-backed plots.
