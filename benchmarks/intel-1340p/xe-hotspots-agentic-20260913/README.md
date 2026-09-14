# Xe handoff and agentic harness checkpoint

Allocation-level KV views are implemented in `6c39dbe5665e3e772109a0c02598283b4d0fc434`. Native synthetic continuation passes with two retained views. The trained six-run matrix has mixed millisecond-scale handoff changes and no whole-workflow speedup.

The write-v2 whole-file tool pilot now passes repair and follow-up in the same persistent process. The frozen six-run matrix is complete: clamp and median pass in both arms; defaults reaches the round cap in both despite passing final artifacts. Paired work is identical, but no whole-workflow speedup is established. The seven earlier edit-v1 attempts are retained: two early harness failures, two contention interruptions, a candidate task-budget failure, a baseline output-budget failure additionally affected by a shutdown-sampling race, and a CPU-only output-budget failure. The narrow Gemma renderer-boundary correction passed both vocabulary-only regressions and that trained conversation.

## Evidence

| Check | Result |
|---|---|
| Native synthetic Gemma handoff | Exact copied-reference CPU continuation after source/model destruction; two views, 0.711ms acquisition diagnostic |
| Failed exclusive agentic pilot | Six completed rounds; 59.998s unit, 11.8GiB peak, zero swap, no sampled competitors; stopped on closing-turn delimiter guard |
| Corrected renderer | 21 prompt-prefix transitions across three traces, including a later user requirement; 12 message/tool mutation rejections |
| Tool tests | Four pass, 25 assertions; path/symlink/edit/test-integrity restrictions |
| Actual sandbox test (earlier checkpoint) | Buggy source rejected, fixed source independently graded successfully |
| Corrected trained pilot | Ten uninterrupted rounds, 1,400 generated tokens, 134.599s, zero swap; exhausted task budget |
| Edit-v1 trained task completion | Failed; independent post-run grading rejects the final sources |
| Write-v2 trained task completion | Both repair and follow-up pass; 10 rounds, 57.562s, 7+10 independent assertions, zero swap |

Run portable evidence checks with Bun:

```sh
bun verify-checkpoint.ts
bun test agentic-tools.test.ts agentic-outcome.test.ts
sha256sum -c SHA256SUMS
```

`verify-checkpoint.ts` reads retained results and checks metric/state invariants. It does not execute model inference or prove a future run will pass. `verify-render.ts` checks output from the native vocabulary-only regression, including its retained negative control.

## Source and recipes

`agentic-session.cpp` is the corrected report-only JSON-lines native caller. `source-history/agentic-session-exclusive.cpp` exactly matches the exclusive failed-run source hash. Other attempt manifests retain their original source/binary/library identities. The compiler reports two existing unused-function warnings from the common Jinja headers.

Recipes retain Sigma workspace paths and are not production installers. To repeat native work, place this directory under `WORKSPACE/reports/xe-hotspots-agentic-20260913`, with the matching checkout under `WORKSPACE/projects/llama-cpp`, retained baseline libraries under `reports/xe-in-memory-perf-20260913`, and read-only pinned model files. Review the absolute paths before using another machine. The compiled executables, libraries, weights and resource-admission file are deliberately excluded. Rebuild in the specified container and obtain fresh operational admission; historical admissions in manifests do not authorise another run.

- `build-batched.sh`, `native-batched.cpp`, `run-native.ts`: allocation-level synthetic qualification recipes.
- `compile-agents.sh`, `render-regression.sh`: corrected caller build and vocabulary-only regression.
- `agentic-runner.ts`, `agentic-tools.ts`, `launch-agentic.sh`, `agentic-stop.sh`: bounded real-tool workflow and owned-container cleanup.
- `agentic-protocol.md`: task, state, metrics and resource contract.
- `agentic-pilot-findings.md`: failures, diagnosis and corrected offline checks.
- `boundary-pilot.md`: corrected trained execution, failed task and next diagnostic controls.
- `baseline-control.md`: pre-batching control failure and shutdown-sampling regression.
- `cpu-control.md`: CPU-only diagnostic failure; the problem is not specific to handoff/batching.
- `agentic-matrix-next.md`: comparison controls; historical traces remain unchanged.
- `write-v2-plan.md`, `write-v2-pilot.md`, `write-v2-matrix.md`: explicit whole-file series, passed pilot and frozen six-run screen.
- `write-v2-results.md`, `write-v2-matrix-summary.json`: matched task/timing results, all outcomes and limits.
- `compare-write-v2.ts`: frozen-source/prompt/work checks and paired calculations.
- `verify-agentic-run.ts`: per-run guards/cache/tool/grade verifier.
- `agentic-outcome.ts`: task/transport exit classification and exact-ID admission checks.
- `opportunities.md`: small gains, uncertainties and combined-candidate measurements.

No services were deployed or changed. Q4 confirmation passed 18 cases but regressed in three of four eight-thread timing groups; the two-thread opportunity is retained without a default change.

The [Q6 promoted implementation](q6-promoted-results.md) is pushed on `feat/xe-q6-integration` (`2f998c903`): normal CMake42case OFF/ON exactness and a trained repair/follow-up pass with exact predecessor work. The predecessor ABBA measured -1.20% whole/-1.57% warm time; the promoted run is a correctness check.

The [Vulkan large-tile probe](vulkan-large-results.md) passes numerical checks but has much slower O0 diagnostic samples. The [O1 untraced ABBA](vulkan-o1-results.md) confirms +250.36%/+225.80% time regressions; keep the default medium selector. Final combined trained measurements, master merge and progress charts are unfinished.
