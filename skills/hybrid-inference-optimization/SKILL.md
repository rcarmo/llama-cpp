---
name: hybrid-inference-optimization
description: Profile, fix and benchmark hybrid GPU-prefill and CPU/SIMD decoding, especially long-context KV handoff and coding/tool rounds. Use for backend kernels, batch/thread/MTP tuning, state-layout changes and performance qualification on shared-memory hosts.
---

# Optimise hybrid inference with measured evidence

Improve the user's workload while preserving correctness, state ownership and other services. Separate the best measured configuration from proof of a global optimum.

Read [AGENTS.md](../../AGENTS.md) and [CONTRIBUTING.md](../../CONTRIBUTING.md) first. This fork permits owner-authorised implementation and frequent tested commit/push checkpoints. Check the remote URL before publishing; upstream submission and deployment are separate decisions.

## Start from retained state

1. Read the active plan, latest report, machine-readable results and failed runs. Inspect live process identity and pending supervised jobs before starting anything.
2. Do not repeat a completed experiment without a specific question. A running supervised trial is resumed or monitored, not relaunched after a context interruption.
3. Record source revision, loaded binary/library hashes, build flags, compiler, model/tokeniser/quantisation, assistant model, driver/device ID and exact arguments/environment. A checkout revision is not the running binary revision.
4. Record actual prompt length, context per stream, stream count, populated slots, FA/KV layout, batch/microbatch, thread pools and cache/checkpoint settings. Allocated capacity is not validated populated capacity.
5. Separate experimental, tested, accepted and deployed status. A commit, available CLI flag or passing smoke does not establish deployment.
6. Build a configuration-inheritance matrix before replacing an existing serving path. Include every accepted thread, batch, speculative, sampler, K/V, attention, model-loading, backend and build setting, plus accepted source patches and measured exclusions. For each item, mark `preserved`, `changed with evidence`, `retest` or `excluded`. An undocumented difference blocks performance deployment.
7. Use the previous accepted stack as the first candidate, in dependency order. Do not test several inherited optimisations as one transplant and use the combined result to reject the components. A combined loss leaves each isolated factor unresolved unless the interaction itself was the declared question.

For the current shared-memory Intel host, read [Sigma controls and lessons](references/sigma.md). For Gemma work, also read the [generation inheritance contract](../../docs/local/intel-i5-1340p/gemma-local-provider-runbook.md#generation-inheritance-contract) before changing or benchmarking the service. Do not apply those limits blindly to another machine.

## Prespecify a bounded experiment

Write a small plan before inference:

- Hypothesis, expected expensive operation and which change could improve it.
- Exact baseline/candidate manifest and factors held constant.
- Fixtures, seeds, complete sampling chain and model-derived defaults, speculative minimum/maximum draft lengths, output budget and independent expected results.
- Resource ceilings, abort/timeout ownership and automatic restoration.
- Screening budget, confirmation order and decision criteria.
- Known failures and what remains untested.

Change one factor for causal claims. If testing a combined design, label its factors and avoid assigning the gain to one component. Select a practical baseline, not an obsolete weak control that exaggerates benefit. Reproduce at least one retained fixture from the previous accepted stack before introducing a new fixture; if an API or template change prevents exact reproduction, record the changed token stream and treat the measurements as a new series.

## Guard the host

- Obtain required maintenance approval and coordination with other service owners before builds or load tests. Recheck immediately before work; stale clearance is not exclusivity.
- Monitor service job metadata, native CPU activity and queued upload bytes during trials. An idle browser connection can submit work at any time. Do not inspect private media or transcripts to establish idleness.
- Enforce available-memory and per-process swap limits. Shared GPU memory, driver allocations and file cache are not fully represented by summed RSS or PSS.
- If concurrent model residency cannot fit, stop production only under approval. Never treat swapped production pages as free experimental capacity.
- Use a bounded supervised process group with a restoration hook that survives agent abort or timeout. Track every spawned native process/container; terminate only trial-owned work on contention.
- Keep hardware protection active. Apply temperature policy from the approved experiment; do not invent an additional thermal abort that invalidates a planned comparison.
- After maintenance, verify original argv/config/unit/library identity, health, slots, process swap, tools and growing-prefix reuse. A unit being active is insufficient.

## Find the expensive stage

Measure startup/page-in/compilation, template/tokenisation, prefill, save, format conversion, restore, decode, tool execution and warm append separately. Also record whole-request latency including all routing work the user would pay.

Use device timing or operator profiling to locate work, then disable intrusive instrumentation for comparisons. Profilers can serialise dispatch or change CPU placement. A profiler wall time is not a benchmark result.

Useful controls:

- Restore an already validated long state to test decoding or tail prefill without recomputing the whole prompt.
- Check whether the replacement executable still uses standard initialisation side effects such as model-derived sampling defaults and attached decode/batch threadpools. Setting context thread counts alone does not establish execution parity.
- Separate request wall time, evaluated tokens, cached tokens, generated tokens and MTP drafted/accepted counts. A faster short answer is not proof of a faster kernel.
- Verify actual worker affinity; command-line masks and OpenMP variables do not establish placement.
- Check workload-specific backend dispatch, precision, shape gates, device capabilities and split/reduction rules. An environment variable being set does not prove the desired kernel ran.
- Confirm candidates on fresh long prefill as well as cached tails. Different context positions, microbatch shapes and residency can reverse a ranking.

## Correctness before interpretation

### State and layout

- Check model/tokeniser identity, token IDs, sequence positions, stream ownership, tensor count/type/strides, V transposition and SWA coverage at both ends.
- Keep native compatibility and reuse checks. Never change a file version merely to silence rejection.
- If conversion is needed, parse the supported schema to exact EOF, bound sizes before allocation, reject unsupported media/extensions/layouts, and publish output only after validation.
- For layout-only transforms, prove exact round-trip bytes and token identity. For an intentionally lossy transform, specify and measure its error budget instead.
- Inspect actual values for NaN/Inf; successful parsing or HTTP restore is not proof of finite, correctly positioned state.
- Preserve enough valid SWA history for rollback and the final-token/MTP continuation. Destination ring capacity matters when source microbatch size changes. Do not export stale/foreign cells or bypass a rollback guard.
- Verify same-backend save/restore first, then transfer, target-only continuation, MTP, append and another slot's independence.

### Numerical and task evidence

Exact cross-backend greedy token equality is diagnostic, not an acceptance gate. Floating-point reduction changes can move a close argmax without corrupting state or degrading quality.

Use complementary checks:

- Native operator tests against an appropriate reference, including real long shapes, masks, tails and precision settings.
- Report baseline numerical failures alongside candidate results. Test default and higher-precision accumulation separately when relevant; do not silently loosen tolerances to obtain a pass.
- Same-prefix, pre-sampling probability comparisons. Truncated top-k distributions need a common residual bucket; do not zero-fill missing union entries as if they were full distributions.
- Independent code tests, source-grounded retrieval, positional recall and uninterrupted tool round trips with cached follow-ups.
- Blind factual scoring where executable checks are insufficient; retain baseline failures and uncertainty. A few successful repetitions do not prove a tight noninferiority bound.

Keep invalid fixtures, original failures and corrected supplements. An explicit prompt that succeeds does not erase an implicit prompt that returned empty output.

## Confirm performance and retain opportunities

Screen a small set of justified candidates. Confirm finalists using counterbalanced order such as ABBA/BAAB, with independent restarts/slot resets as required. Freeze prompts, tool results and model settings; record unavoidable variability. Report individual observations and medians, not only the best run.

Distinguish these decisions:

| Decision | Required evidence |
|---|---|
| Stop unsafe trial | Resource contention, incorrect ownership, malformed state, nonfinite values or another hard safety failure |
| Keep research branch | Plausible mechanism, useful partial benefit or diagnostic result, with cost and next discriminating test recorded |
| Choose experimental default | Repeated task-correct whole-workload benefit, bounded resource/lifecycle behaviour and explicit trade-offs |
| Deploy | Owner approval plus serving integration, rollback, native cancellation/crash/respawn, admission and capacity qualification |

Minor regressions can hide future improvements. Do not discard a branch solely because it loses one benchmark or misses a provisional percentage threshold. Maintain an opportunity register: benefit, regression, uncertainty, applicable workloads and next useful test. Numerical improvement with neutral timing is a valid research result.

A tail gain is not a full-prefill gain. A whole-workflow win can coexist with slower warm rounds. A small temporal difference may be noise; repeat only when it can change a decision. Workload-specific selection may be better than one global batch/thread setting.

Quantised KV can reduce resident capacity but add conversion and attention costs. Lossless file compression reduces disk/transfer bytes, not resident tensor allocation. FA, quantisation and speculative decoding are separate model/backend-specific hypotheses.

## Serving and recovery qualification

- Assign an owner by session and token-prefix identity, not a request label such as `cold`.
- Bound outstanding requests, request/output sizes, native contexts, active transfers and fallback residency.
- Avoid moving an established CPU-owned conversation back to GPU for a tiny append.
- Commit ownership only after a complete compatible transfer; failures drain or invalidate affected slots. Poison admission when cleanup cannot establish a safe state.
- Test cancellation at every phase, queued cancellation, eviction, independent slots and abandoned transfer files.
- For user-facing SSE, verify prompt-progress events, incremental parsed content/reasoning/tool-call deltas, terminal usage/timings, disconnect cleanup and cancellation. A `text/event-stream` content type alone does not prove that output is live; record event arrival times and check the actual frontend.
- Distinguish mocked failures, controller SIGKILL and native-worker/driver crashes. File-journal tests alone do not prove native crash recovery or exactly-once tool execution.
- Validate fallback at its claimed size and latency. Unloading all workers can fit memory while destroying warm ownership; make that cost visible.

## Checkpoint and deliver

1. Review the exact diff and run targeted tests. Preserve source/build identity for each measured variant.
2. Commit small coherent checkpoints frequently when authorised: policy/skill, reproducible harness, verified fix, then evidence. Label speculative code and failed experiments explicitly.
3. Stage only task-owned files. Exclude secrets, user data, model weights, multi-GB slot files, mutable service state and build products. Store hashes/manifests and compact raw evidence instead.
4. Verify the remote is the owner's fork; fetch and merge without rewriting history, push the checkpoint, then compare local and remote commit IDs. Report any conflict or transport failure directly.
5. Publish the chosen configuration and retained alternatives with exact measurements, uncertainty, restoration status, remaining gates and rollback. Do not call an optimisation deployed or globally maximal without the corresponding evidence.
6. Update the configuration-inheritance matrix and append-only baseline ledger. Future work must be able to identify the current parent, accepted increments, negative controls and next isolated test without reading chat history.

Relevant technical references: [build](../../docs/build.md), [server](../../tools/server/README.md), [GPU prefill staging](../../docs/gpu-prefill-staging.md), [shared VRAM relocation](../../docs/shared-vram-relocation.md). Existing staging features still require measured backend/model compatibility; documentation alone does not qualify a new route.
