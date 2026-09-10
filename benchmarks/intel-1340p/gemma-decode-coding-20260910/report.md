# Longer64K coding output: faster decode, task failures retained

The deployed small-batch CPU change improves throughput on longer code output, but these fixtures did not pass the exact coding contracts. Two separate ABBA blocks produced matched output in both modes:

| Fixture | Flag off | Flag on | Decode gain | Exact task passes |
|---|---:|---:|---:|---:|
| Three-export module,640-token cap |6.379 tok/s |7.867 tok/s |23.34% |0/4, all truncated |
| Compact one-export repair,321 tokens |6.277 tok/s |7.780 tok/s |23.95% |0/4, wrong export name |

The current `20260910-smallbatch` hybrid release was restored unchanged. Its unit/config, mapped CPU library hashes, enabled flag, tools/cache, two idle slots and zero swap passed verification. No new production settings were introduced.

## Workload and controls

Each request restored the previously validated64662-token KV file. The original recall exchange was completed in the request history, then followed by a TypeScript task. No full prefill was repeated and no GPU ran. This measures generation at about65K accumulated context, not fresh hybrid routing latency.

The same patched retained-ABI runtime was used for both profiles, with `LLAMA_EXPERIMENTAL_SMALL_TARGET_BATCH` absent/present. CPU decode8, large-prefill16, draft8/batch16, MTP3, F16 KV, FA off, two128K slots and every sampling parameter were fixed. No profiler was enabled. Every process recorded mapped `libllama` hash `35289adccdf6965d3d7eb7ade2271723b1169e65772bf849c8a5431288d0aec9`, argv and allowlisted environment.

Independent process order in each block was off/on/on/off. Two observations per profile are a bounded generality screen. They do not establish a global maximum or broad coding-quality equivalence.

## Original module task

The prompt requested three exports: `mergeIntervals`, `totalLength` and `containsPoint`. Requirements covered validation, reversed endpoints, overlap/touching merges, non-mutation and half-open point containment. The independent reference passed six tests/43 assertions in the sandbox before inference.

Every request contained64912 tokens:64662 cached and250 evaluated. Each generated640 tokens and offered590 drafts, of which442 were accepted.

| Order | Flag | Decode | Request wall |
|---|---|---:|---:|
|0 |off |6.335 tok/s |112.564 s |
|1 |on |7.836 tok/s |93.184 s |
|2 |on |7.899 tok/s |92.368 s |
|3 |off |6.422 tok/s |111.149 s |

Median request wall fell17.06%; decode rose23.34%. Request wall includes the250-token instruction append and generation, excluding worker startup, restore and external code tests.

All responses had `finish_reason: length`. They were identical across the four runs and did not contain a complete module. Extraction preserved unusable text and the independent test failed at parsing. The bounded timing comparison is valid for the640 generated tokens, but task success is0/4. The code was not repaired or relabelled to obtain a passing benchmark.

## Compact repair supplement

After the original block, a separately declared and speech-cleared supplement reduced the task to one function. It supplied a broken `mergeIntervals` implementation and requested only a corrected module, without comments/helpers and under30 lines. The new reference passed six tests/16 assertions. This was a changed fixture, not an increased output budget for the original task.

Every request contained64910 tokens:64662 cached and248 evaluated. Each completed normally after321 generated tokens, with303 offered drafts and219 accepted.

| Order | Flag | Decode | Request wall |
|---|---|---:|---:|
|0 |off |6.355 tok/s |61.833 s |
|1 |on |7.789 tok/s |52.693 s |
|2 |on |7.771 tok/s |52.739 s |
|3 |off |6.198 tok/s |63.326 s |

Median request wall fell15.76%; decode rose23.95%. The generated code was byte-identical across all four observations. However, it exported `mergeIntervalInterval` rather than the required `mergeIntervals`. All original tests therefore fail the import contract:0/4 exact task passes.

### Post-hoc alias diagnostic

The four repair outputs had one unique code hash:

```
01af943ecc88eb44577c824f8b25d8f4671aa933258e70508ddece3156eb4a62
```

A single separate diagnostic imported that function under its actual returned name, with no change to generated code bytes. All16 behavioural assertions passed. This isolates the observed export-name failure for the tested cases. It does not satisfy the original API contract, prove all possible interval behaviour, or change any task status. The diagnostic, changed test import and original failed tests are all retained.

## Safe executable tests

Generated code ran only after its native model worker stopped. The sandbox used a networkless read-only container, a read-only case directory, no injected credentials, no Linux capabilities,512MiB memory,64 PIDs and a20-second timeout. Only the benchmark case and Bun executable were mounted; the workspace and private files were not mounted.

Normal per-run cleanup removed each container. A post-run review corrected the restoration hook's supplementary container-name pattern; no container remained and no resource failure occurred. The previous cleanup pattern and correction are documented in `amendments.json`. Generated-code tests are not re-executed by the offline evidence verifier; it checks their retained hashes/results.

Five offline tests/27 assertions verify code extraction, fixed test semantics, timing rollups, preservation of failed tasks and the alias-only diagnostic. A deliberate mutation test proves that setting `task_pass=true` over a failed sandbox record is rejected. A delegated task/audit review timed out; it supplied no independent approval.

## Resources and restoration

Fresh speech clearance at23:04:37UTC covered the original block and23:17:07UTC covered the repair supplement. Both used supervised maintenance with a hard deadline and automatic restoration of the current small-batch hybrid, never the older CPU-only or `sse1` release.

Continuous guards checked speech job metadata, native CPU activity, CLI presence, queued socket bytes,6GiB available-memory reserve and16MiB maximum swap per trial process. Minimum available memory was22.05GiB in the original block and22.01GiB in the repair block. Trial swap remained zero. Peak temperatures were87C and89C respectively. Speech services, settings, media and transcripts were untouched.

The final restoration check verifies the saved unit/config hashes, exact CPU argv, candidate library mapping, enabled small-batch flag, zero swap, explicit tool call/result under `none` and `auto`, cached append and two idle128K slots. Final supervisor PID646135 is a dated observation; the check records its CPU child. No native trial or sandbox container remains active.

## Decision

Retain the deployed small-batch optimisation. The speed benefit generalises to matched321- and640-token code outputs, and neither comparison introduced output drift. Successful coding-task qualification remains unestablished for these long-context fixtures because both control and candidate failed the contracts. The earlier successful tool/recall/state checks remain valid within their own scope.

Do not extend this into another performance claim by repairing generated outputs or repeatedly changing fixtures until one passes. The next speed experiment should use the current small-batch baseline and isolate remaining target matrix/packing or independent draft-worker costs. Model instruction-following and output-budget limitations should be investigated separately from kernel timing.
