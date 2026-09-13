# Small gains and combined candidates

Retain repeatable improvements even when their individual whole-workflow effect is small. Qualify correctness first, then measure each factor and the combination. There is no fixed percentage threshold for keeping an improvement. Noise is recorded as uncertainty, not rounded into a gain.

| Change | Evidence | Current decision | Next discriminating check |
|---|---|---|---|
| Shared KV handoff | At 4,003 prompt/512 output tokens: handoff 97.00ms shared vs 160.85ms copied; decode 20.66 vs 20.69 tok/s. Earlier short-workload decode gain did not persist. | Keep qualified opt-in implementation. Handoff savings survive even when decode is neutral. | Measure whole agentic workflow and cold-stage cost with allocation batching. |
| Allocation-level view preparation (`6c39dbe56`) | Native synthetic continuation passes; two views acquired in 0.711ms. Prior trained profile had 48 acquisitions across two allocations taking 85.26ms. The measurements use different workloads. | Keep tested checkpoint; trained latency savings are unmeasured. | Same runner/model/context, prior vs batched library; record cold handoff plus full task cost. |
| Q4_0 width4 2x4 tile | Read-only dispatch analysis and isolated candidate generator prepared. No compiled candidate or measured gain. | Retain narrow experiment. | Bitwise native comparison over exact FFN shapes and tails; ABBA/BAAB timings, then combined model trial if useful. |
| Q6_K vecdot | Profiled matrix hotspot; no narrow candidate qualified. | Open investigation. | Verify width4 dispatch, conversion and load costs before changing arithmetic. |
| Vulkan Q4_0 FFN | Two shapes account for about half of measured GPU prefill work. No candidate implemented. | Open investigation. | Exact dispatch/tile evidence and numerical tests, then isolated timings. |
| Static score scheduling | Previously measured loser. | Closed as a default; preserve prior evidence. | Reopen only for a new interaction hypothesis, not another unchanged rerun. |

For a combined candidate, hold fixtures, runner, models, limits and sampling constant. Use counterbalanced order, keep all failures, and report absolute stage times plus time to independently verified task completion. Compare the full stack to the common baseline; use leave-one-change-out comparisons where interactions could affect the decision. A cold-stage optimisation may have a small amortised benefit across a long conversation while remaining useful for each newly opened conversation. Do not sum individual speedup percentages.
