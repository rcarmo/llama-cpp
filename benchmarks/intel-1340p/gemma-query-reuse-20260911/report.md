# Query reuse: a small qualified experimental gain, B0 still live

> Historical deployment snapshot (10-11 September 2026). The [15 September in-process zero-copy service](../gemma-zero-copy-service-20260915/README.md) supersedes the service identity, ports, active flags and rollback targets below. Commands in this snapshot are not current operating procedures.

Reusing rounded attention queries improved the independent saved64K confirmation by **0.70% in median generation speed** and **1.03% in request time**. A separate512-token screen improved generation by **1.36%**. The candidate is recorded as **B1-query-reuse, qualified for a bounded experimental decode scope**. It has not been deployed; production remains B0-score3.

The 18-step attention plan is closed through the measured query-reuse branch and explicit conditional decisions. Two hardware-counter profiles did not attribute a shared-KV or intermediate-buffer bottleneck. Head-sharing and fused-attention prototypes were not opened. Their requirements and the reasons are retained in `branch-decisions.md`.

## Matched results

| Workload | Runs | Baseline tok/s | Query reuse tok/s | Generation change | Request time change |
|---|---:|---:|---:|---:|---:|
| Saved64K,128 generated: initial screen | 4 ABBA | 9.1581 | 9.3669 | +2.28% | -2.44% |
| Saved64K,128 generated: independent confirmation | 8 ABBA/BAAB | 9.2087 | 9.2734 | **+0.70%** | **-1.03%** |
| Saved64K,512 generated: sustained screen | 4 ABBA | 9.8572 | 9.9912 | +1.36% | -1.44% |

Confirmation ranges overlap. The smaller independent result supersedes the screen as the primary gain estimate; it is not proof of a precise population-wide0.70% benefit. Both confirmation blocks were modestly positive. No extra repeat-until-win block was run.

Each request used a fresh isolated CPU worker and the same saved state and candidate binary, with only `GGML_CPU_EXPERIMENTAL_SCORE_QUERY_REUSE` changed. B0's smallbatch, ATTN4 and score3 remained enabled. CPU/draft threads8/16, MTP3, F16 compact KV, FA off,1024/256 batching, two allocated131072-token slots and cacheRAM0 stayed fixed. The128-token work contract was64658 cached /25 evaluated /128 generated, seed42, temperature0, top-k1, and90/110 accepted draft tokens. The512-token screen retained374/408 accepted drafts. Output hashes matched within each comparison; native, state and task checks supplement that diagnostic.

Request time includes query preparation,25-token tail evaluation and generation. Startup, state restore and external tool execution are excluded. Timing traces were off. All completed timing observations recorded zero worker swap.

The4K and32K restored-context controls each used two observations per arm and passed exact reuse/output checks. Their apparent generation changes were+6.06% and+14.99%, but controls varied substantially. The4K path is outside the optimisation gate, and one32K baseline was notably slower than the other. These larger changes are not attributed to the patch or included in its qualified speed scope. Full cold prefill was not benchmarked.

## Implementation and data ownership

The actual CPU matmul path first attempts F16-key/F32-query SGEMM, then uses the existing conversion to round queries into F16 work data and retries after its worker barrier. The candidate begins after that rounding. It expands the same four rounded512-element query rows into FP32 once per worker/head call, outside the key-tile jobs.

Scratch is `alignas(64) float query[2048]`: **8KiB per worker/head call, at most64KiB across the eight-worker team**. Each call overwrites all values; no pointer or query cache persists. Packed scratch uses `ldb=512` elements regardless of the original source stride. Workers remain in the local helper until the existing final barrier returns. This duplicates a small amount of preparation across workers but avoids a new shared producer barrier; all preparation cost is included in timings.

The prepared F16-key/F32-query `tinyBLAS` instantiation reuses B0's3x4 tile,48-row job scheduler, FMA order and1/2-row tails. Keys, KV layout, value products, Q4 kernels and thread counts do not change. The reference bypass and existing long-score/n4 gate remain intact.

Disassembly of the unrolled-two prepared score loop shows **six FP16 key conversions, eight FP32 query loads and24 FMAs**. That is three key conversions and four scratch loads per original eight-element iteration, instead of converting both operands repeatedly. It does not prove lower DRAM traffic. The real-model probe recorded16,576 balanced preparation entries/exits,2,072 per worker and2,072 head groups; the trace-heavy probe is excluded from timing.

## Numerical, state and task qualification

- **19 native cases per mode** passed unchanged tolerances: long score/value controls, padded stride, grouped-head broadcast, row/job tails, n1/3/4/5 and below-gate/reference exclusions.
- **18 standalone rounds across six groups** passed exact rounded-query and tile-output comparisons, scratch/output canaries, changed queries and concurrent group isolation. Tests use the extracted candidate conversion and parent tile loops.
- A saved64K state scanned finite, parsed to exact EOF and restored natively. Normal long recall and an independent short tool slot passed. Returning to the long slot reused64,684 cached tokens and evaluated15, returning `MAPLE-726`.
- **28 frozen short task results passed** across baseline and candidate: normaliseTags/chunk coding tasks, grounded retrieval and four-round tool/cache workflows, each at seeds42/43. Generated code ran only after native workers stopped, in networkless, read-only256MiB/2-second containers. Exact exports and original validators were retained.

These checks qualify the stated experimental decode scope. They do not establish broad long-context coding noninferiority, dual128K capacity, production12GiB prompt-cache pressure or every lifecycle sequence. Original mergeIntervals export failures remain in earlier evidence and were not repaired or relabelled.

## Interrupted lifecycle sequence and recovery

The original lifecycle attempt completed finite save, native self-restore and short tool checks. Its subsequent long append unexpectedly began reevaluating the prompt. Before that attempt finished, I incorrectly started the quality unit. It failed preflight and its restoration hook restarted production; the active lifecycle guard then aborted with `Production service must be inactive during maintenance`.

The premature restoration verifier rejected the temporary identity state. Both failures, the original partial results and the guard event are retained. Completed performance measurements were not rerun. Production was restored and verified before resumption.

The resumed stage ran normal long append before the separate self-restore, then ran both quality arms sequentially in one supervised unit. Those checks passed. **The original self-restore-then-append sequence remains unqualified.** Reordering the checks did not resolve or erase its unexpected reevaluation. The B1 manifest explicitly retains this limitation; any affected deployment gate must address it before rollout.

Two exact-source authoring mismatches also failed before building. The source was reread and corrected; neither supplied a native or timing result. No numerical tolerance or resource limit was relaxed.

## Hardware counters and conditional branches

A no-load permission probe found user-space core/atom PMUs available. The first IMC probe used unsupported exclusion filters and returned EINVAL; the corrected unfiltered probe returned EACCES. No security policy or sysctl changed.

Two bounded saved64K profiles captured four grouped events per PMU for all34 native threads: cycles, instructions, cache references and cache misses. Separate core/atom groups produced68 groups per run, with enabled/running times and unchanged thread inventories. These are whole-request user-space diagnostics, including the prompt tail and HTTP roundtrip. Hybrid PMU residence affects running/enabled ratios; blindly scaling both PMUs to full wall time would be misleading. Cache events do not identify which tensors caused misses. **There is no measured DRAM bandwidth or KV-specific saturation result.**

A read-only counter/source review found insufficient attribution to justify the conditional shared-KV prototype. Actual head-sharing would require caller-level grouping of four query heads per KV head and a new synchronisation/lifetime design; retaining a key pointer in the local scratch helper would be unsafe. G01/G02 close as conditional-not-run.

F01 quantified one FP32 score tensor at64768x4x8 as8,290,304 bytes (7.90625MiB), versus253MiB for the corresponding F16 keys plus values. These are logical sizes. The old profile's0.856s attention-family wall is not a measurement of score-buffer memory cost. A four-query online-softmax/value design, scratch bounds and mask/scaling/layout requirements are recorded. Prior active-query/fused-value CPU FA attempts were substantially slower than FA-off. No competitive, evidence-backed new fusion mechanism was established in this bounded campaign, so F02/F03 were not implemented or timed. This is not a global rejection of head reuse or fusion.

## Baseline, restoration and archive

`baselines/B1-query-reuse.json` was appended immediately after qualification, with parent B0, exact candidate hash, measurements and limits. **Qualified experimental status is separate from deployment.** B0 remains `20260911-score3-stopped`, retaining its previously deployed gains and ATTN4 operational fallback. No new release or kernel was installed.

The immutable B1 manifest records the earlier post-qualification restoration at15:11:19UTC. The subsequent final restoration after the PMU stage at **15:13:57 UTC on11 September2026** verified exact config/unit hashes, nine mapped CPU files, argv/flags, tools/cache, idle slots and zero swap. Observed supervisor/CPU PIDs were788138/788156. All stages used bounded supervision, explicit stopped-speech checks,6GiB reserve and16MiB worker-swap ceilings; temperatures>=95C remained annotations. Apart from the documented sequencing mistake, heavy stages were sequential. Speech was not restarted, no private speech files were read, and no production worker was fault-injected.

`verify-offline.sh` checks the export manifest, reconstructs the patch, audits native/assembly/dispatch/timing/qualification/PMU evidence and runs **18 tests /74 assertions**. Negative controls reject changed work, nonfinite state, failed sandbox results, altered runtime/trace flags and stale restoration. The archive excludes model weights, runtime binaries, large KV files and whole-library disassembly. Fresh model/state/fixture hashes, raw requests, compact assembly and compiler/link recipes are retained. Live scripts contain local paths; offline verification requires no inference or service actions.
