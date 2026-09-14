# B0 test foundation and refreshed decode profile

B0-score3 remains deployed unchanged. The test harness now has strict resource and case-file preflight, reviewed quality fixtures have native baseline outcomes, and one saved64K profile identifies the next decode target. No new performance baseline was validated in this stage.

## T01: inputs and guarded execution

`frozen-inputs.json` hashes the target Q4_0 GGUF, Q8_0 MTP assistant, retained64K state and counting fixture. It pins CPU/GPU argv/environment/hash profiles and the current score3-stopped restoration target. The tokeniser is embedded in the hashed target GGUF. The primary decode contract stays64658 cached /25 evaluated /128 generated, temperature0/top-k1/seed42.

The shared runner now rejects missing resource counters and failed socket-status commands, parses all11 numeric native records to exact EOF, and refuses to steal retained locks. Guard failures cancel the request then stop only captured owned subprocess handles. A lightweight native child that ignores TERM tests escalation. Model workers receive an allowlisted environment rather than inherited credentials. Stopped-speech checks remain active; no speech services were started.

The initial idle production worker had110448KiB swap before profiling. This observation followed offline fixture/hash work; its cause is unassigned. It is not a candidate failure or additional free trial capacity. The approved maintenance stage stopped production before allocating trial state. After each maintenance stage, the same B0 release was restored and exact maps/flags/argv, tools, cache and zero swap were checked. The earlier unexplained ATTN4 startup event remains separate evidence.

The first diagnostic build pointed at a missing local header tree and failed before inference. Its log is retained; correcting the path to the pinned source tree allowed the build. All validated CPU kernels stayed enabled.

## D01: one current profile

The isolated backend rebuilt the three existing diagnostic objects plus the exact retained score3 SGEMM source. It retained smallbatch libllama. The single MTP3 run used the frozen saved64K fixture, recalled all three keys, produced the expected128 tokens and accepted90 of110 drafts. It recorded3579 shape groups with zero overflow. Shape node-wall sums reconcile exactly to the whole-token matrix family.

| Instrumented category | Node wall |
|---|---:|
| Long F16 n4 scores |4.675 s |
| Long F16 n4 values |3.004 s |
| Q4 n4 projections |2.890 s |
| Q6 n4 vocabulary projection |0.778 s |
| Long F16 n1 values |0.503 s |

Total recorded node wall was15.874s. Speculative phase records report12.758s target decode and1.593s draft work across37 cycles. Packing counters sum worker time and are not wall time; generic idle/sync includes instrumentation/barriers and cannot isolate one scheduler cost.

These numbers are diagnostic, not an improvement comparison. No throughput gain is inferred against the historical profile. Source/build hashes and runtime logs/config identify the diagnostic build; its short worker's live maps were not captured. A later uninstrumented quality worker has separate actual-map provenance. The evidence does not invent a retroactive map capture.

## T02: real baseline quality outcomes

See `../gemma-optimization-t02-20260911/` for frozen definitions, sandbox and results.

- `normaliseTags`:2/2 seeds pass exact export and independent behavioural tests,259 generated tokens each.
- Original `mergeIntervals`:0/2; output exports `mergeIntervalInterval`. The failure remains recorded, without alias correction.
- New separately versioned `chunk`:2/2 pass exact export and behavioural tests,154 generated tokens each. Added after the old failure, reference/negative-tested and frozen before its native runs; not used to relabel the old fixture.
- Source-grounded retrieval:2/2 pass. The delegate originally inferred a shipped release from a candidate note; review corrected the expected answer to `not in source` before native execution.
- Four-round tool workflow:8/8 rounds pass over seeds42/43, including reuse of prior tool results and positive prompt-cache reuse on follow-ups.

These are short CPU baseline tasks, not long-context coding-quality qualification. Seeds42/43 at temperature0 are two baseline observations, not independent sampling coverage. Future candidate comparisons use the frozen task definitions, with long-context preparation and non-regression checks as planned.

Generated coding outputs ran only in a no-network, read-only container with256MiB memory/no extra swap,32PID limit, bounded output and a two-second in-container timeout. Preflight checked references, incorrect code, wrong exports, network/workspace isolation, read-only case files, memory.max and an infinite-loop timeout. Direct timeout-as-PID1 returned125 without useful diagnostics; a fixed shell parent worked without loosening limits. Failed attempts remain saved.

## D02 inspection and next step

A read-only disassembly of the retained `tinyBLAS<...unsigned short...>::gemm<2,4,8>` was captured. The main reduction loop uses eight accumulators with F16 conversions and FMAs; it shows no vector stack spills in that inspected loop. Outer scheduling code uses stack slots for scalar state. This supports investigating greater query-vector reuse, not claiming that current throughput is limited by spilling.

Value attention is still a substantial cost. Next: at most two value-specific variants, holding score3/thread/MTP settings fixed. Native long/short/tail/reference coverage and actual dispatch must pass before a four-run screen. A3x4 variant may reuse the existing proven row-tail scheduler, but its long-K code generation and numerical cases need independent checks; the prior score gain does not establish a value gain.

## Tests and checkpoint limits

T01/D01 offline tests:13 pass,49 assertions. T02 reference tests:9 pass; sandbox and native results are separate. Two delegate requests timed out: the fixture delegate left useful files which were reviewed and corrected; the P01 read-only delegate supplied no usable conclusion. P01 stays pending.

Current production and its validated kernels were retained through all minor build/fixture setbacks. No B1 record was created because there is no new candidate performance result. The B0 ledger should receive a qualification/profile event, not a fabricated improvement. Full dual128K capacity and all-phase native recovery remain unqualified.
