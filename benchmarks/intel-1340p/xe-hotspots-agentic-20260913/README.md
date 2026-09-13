# Xe handoff and agentic harness checkpoint

Allocation-level KV views are implemented in `6c39dbe5665e3e772109a0c02598283b4d0fc434`. Native synthetic continuation passes with two retained views. Trained latency savings for this change have not been measured.

The persistent agentic harness has no successful repair/follow-up result yet. Six attempts are retained: two early harness failures, two contention interruptions, one valid ten-round execution that failed the task budget, and a baseline output-budget failure additionally affected by a shutdown-sampling race. The narrow Gemma renderer-boundary correction passed both vocabulary-only regressions and that trained conversation.

## Evidence

| Check | Result |
|---|---|
| Native synthetic Gemma handoff | Exact copied-reference CPU continuation after source/model destruction; two views, 0.711ms acquisition diagnostic |
| Failed exclusive agentic pilot | Six completed rounds; 59.998s unit, 11.8GiB peak, zero swap, no sampled competitors; stopped on closing-turn delimiter guard |
| Corrected renderer | 21 prompt-prefix transitions across three traces, including a later user requirement; 12 message/tool mutation rejections |
| Tool tests | Four pass, 25 assertions; path/symlink/edit/test-integrity restrictions |
| Actual sandbox test (earlier checkpoint) | Buggy source rejected, fixed source independently graded successfully |
| Corrected trained pilot | Ten uninterrupted rounds, 1,400 generated tokens, 134.599s, zero swap; exhausted task budget |
| Trained task completion | Failed; independent post-run grading rejects the unchanged final source |

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
- `agentic-outcome.ts`: task/transport exit classification and exact-ID admission checks.
- `opportunities.md`: small gains, uncertainties and combined-candidate measurements.

No services were deployed or changed. The follow-on `q4-screen.md` records a compiled, bitwise-tested isolated Q4 tile candidate with exploratory two-thread timings and retained regressions. It has no trained or resource-monitored timing qualification. Q6_K and Vulkan FFN optimisation still need candidate implementations.
