# Corrected pilot: valid execution, failed task

`clamp-candidate-boundary` completed ten persistent model/tool rounds without prefix, native-process or resource errors. It failed the task budget. Independent post-run grading rejects the retained final source with `Unexpected export`; the original artifact hash did not change.

| Measurement | Result |
|---|---:|
| Unit wall time | 134.599s |
| Peak unit memory | 11.8GiB |
| Worker/unit swap | 0 |
| Minimum sampled available memory | 16,400,804KiB |
| Sampled competing processes | 0 |
| Generated tokens | 1,400 |
| Maximum prompt tokens | 2,115 |
| Warm evaluated prompt tokens | 1,682 |
| Warm replayed history tokens | 1,177 |
| Initial handoff | 62.186ms |
| Independent phases completed | 0/2 |

The model read the source and tests, inserted a nested function declaration, and ran tests once. It then repeatedly issued no-op or stale replacements. One later edit corrected the inner clamping formula but left the invalid outer wrapper. Seven edit calls produced two accepted changes and five tool rejections. The harness did not repair the file or extend the ten-round limit.

The unit exited 0 because the native process closed normally. The original `result.json` already records `success:false`. An explicit outcome classifier now returns exit 2 with `round_budget_exhausted`, distinct from exit 1 for harness/resource failures. `evidence/boundary-outcome.json` is a retrospective classification; the original result is preserved. Future runs also independently grade the final artifact at exhaustion and reject stale/malformed run-ID admissions.

The outcome and tool tests pass (eight tests, 42 assertions), including the real retained ten-round failure, missing tools/grades, truncation and admission-ID rejection. The hidden post-run grader failed as expected in an admitted 1CPU/256MiB container and was drained. All native/tool workers and containers are gone; services did not change. Exact-ID releases were sent to both held peers.

Next controls are one baseline-library clamp workflow and one CPU-only clamp workflow with unchanged task and limits. These distinguish a general model/tool-use failure from batching or handoff effects. They need fresh resource admission. Trained batching speedup, successful repair/follow-up qualification, the three-fixture matrix and combined-kernel performance are still unmeasured.
