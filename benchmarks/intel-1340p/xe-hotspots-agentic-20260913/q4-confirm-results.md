# Eight-thread Q4 tile confirmation

The Q4-only 2x4 candidate passed18 correctness/dispatch cases, including two input families, odd row/query tails and unchanged Q5_0/Q8_0 routes. Eight-thread timing did not confirm the two-thread gain: three of four groups regressed. Do not integrate this candidate as the eight-thread default.

| Input family | m,n,k | Reference median ms | Candidate median ms | Change | Faster pairs |
|---|---|---:|---:|---:|---:|
| sinusoidal | 10240,4,2560 | 0.961287 | 1.032290 | +7.39% | 2/8 |
| sinusoidal | 2560,4,10240 | 0.992358 | 1.057386 | +6.55% | 2/8 |
| mixed-sign PRNG | 10240,4,2560 | 1.091239 | 1.068918 | -2.05% | 6/8 |
| mixed-sign PRNG | 2560,4,10240 | 0.978387 | 1.098078 | +12.23% | 3/8 |

The exact values and ranges are in `q4-confirm-summary.json`. Each sample averages32 invocations with8 threads; eight alternating pairs per group. All outputs are bitwise equal to reference, finite, and diagnostic counters prove only the Q4 width4 route entered the new tile. Timing candidate contains no diagnostic counter.

`q4-confirm-8t-r1` ran3.049s,128.6MiB peak,zero swap,zero throttle delta,host reserve above27GiB,no competing process,services unchanged. Thread reports show8 workers allowed on16 CPUs; no affinity pinning was imposed. The short duration and overlapping ranges limit precision. The original `q4-confirm-8t` failed before execution because the dynamic loader lacked the existing libomp path; that failure is preserved separately and is not a timing sample.

The two-thread screen remains a workload-specific opportunity. Retain its possible weight-reuse benefit and the one small eight-thread favourable group; do not combine them into a positive claim. Future Q4 work needs a hypothesis about scheduling/register pressure/cache behaviour, not more identical retries. No production kernel or deployment changed.

The monitor's process/cgroup guard tests pass (2 tests,10 assertions); native correctness and per-shape counters pass (18 cases); resource evidence and64 timing rows are independently checked by `summarize-q4-confirm.ts`. The attempted independent read-only Q6 review timed out and is not a review pass.
