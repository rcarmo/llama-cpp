# Gemma B1 release hold and CPU attribution

> Historical deployment snapshot (10-11 September 2026). The [15 September in-process zero-copy service](../gemma-zero-copy-service-20260915/README.md) supersedes the service identity, ports, active flags and rollback targets below. Commands in this snapshot are not current operating procedures.

**B0-score3 stays in production.** The CPU save/restore repair passes the exact failing sequence on B0 and B1, but combined-release staging exceeded the worker swap limit during GPU startup. No cutover occurred. The bounded 17-step plan closes with this hold and no new optimisation candidate.

## Save/restore cause and repair

The native CPU v2 writer pruned valid, masked sliding-window attention (SWA) cells needed for subsequent rollback. Both B0 and B1 reproduced prefix loss after the original restore, recall, save, self-restore, independent tool-slot round trip and long append. The HTTP guard stopped those appends after 515.4 and 525.5 ms; neither request completed a full 64K re-prefill.

| Check | Original B0/B1 | Repaired B0/B1 |
|---|---:|---:|
| Saved tokens / global cells | 64,684 / 64,684 | 64,684 / 64,684 |
| SWA cells | 512 | 766 |
| SWA position range | 64172..64683 | 63918..64683 |
| State bytes | 1,081,795,892 | 1,092,202,780 |
| Long append | Cache loss; guarded abort | 64,684 cached, 15 evaluated |
| Independent tool result | 23 | 23 |
| Long-append answer | Not qualified | MAPLE-726 |

`patch/cpu-save-padding.patch` adds the opt-in `LLAMA_EXPERIMENTAL_CPU_SWA_SAVE_PADDING` presence flag to full, standard-SWA sequence saves. It preserves existing owned, nonempty cells. Partial/checkpoint saves retain the old filtering, and native state format, KV arithmetic and rollback checks are unchanged. The flag is presence-based: unset disables it; setting it to `0` still enables it.

The extra history costs **10,406,888 bytes per observed saved slot**, with no new live KV allocation introduced by this save filter. This is a saved-state size measurement, not a capacity result. The source GPU state had 768 SWA cells; the later CPU state has 766 valid cells.

All four original/repaired states pass complete F16 NaN/Inf scans to exact EOF. All common KV cells are bit-exact within each arm in **96 tensor comparisons**, using explicit position/sequence mapping because physical ring order is not sorted. Token hashes match. Provenance confirms that only `libllama.so.0` changes between each failing and repaired replay; the B1-capable CPU backend is identical within those comparisons. Mode 0 disables query reuse, mode 1 enables it.

Evidence: `runs/{restore,repair}-append-mode{0,1}/`, `common-state-audit.json`, `patch/`, `build-inputs.json`. The two failed common-cell parser attempts are retained; neither produced a correctness pass.

## Stage ownership

The maintenance controller uses an atomic campaign lease, systemd invocation identity and a frozen current-production snapshot. A stage records stop intent only after admission. Rejected/non-owning or delayed stop hooks cannot restore another stage's service. The lease is released only after owned cleanup and verified restoration. Stale ownership has no automatic takeover.

Eleven fake-operation controller tests cover simultaneous admission, failed preflight, delayed stop hooks, stale tokens, crashes, cancellation and failed cleanup. Actual completed stages have invocation-specific restoration receipts. These controller tests do not replace native cancellation/crash tests of the repaired serving release.

## Combined release held

The immutable release `20260911-query-reuse-swapad` was prepared with the query-reuse CPU backend and save repair, retaining B0 as rollback. CPU context, two slots, batching and production cache/admission settings were retained; GPU libraries and flags were unchanged. Staging used separate ports and state paths.

Staging stopped before reaching restore-inflight cancellation:

- The first GPU-eligible fixture contained 6,206 tokens.
- No native staging check completed: `rows: []`.
- Sampled CPU swap reached **182,336 KiB**; the abort receipt captured **352,516 KiB (344.25 MiB)**. The limit was **16,384 KiB**.
- Minimum sampled `MemAvailable` was **19,116,044 KiB**, above the 12 GiB GPU-admission floor. Peak sampled temperature was 58 C.
- The proxy logged `GPU acceleration failed at startup: Worker startup exit`. The cancellation phase was never reached and its request returned 502.

The resource gate failed during concurrent GPU startup despite ample reported available memory. Native worker stderr was suppressed, and the GPU exit code/allocation trace was not retained. The evidence does not establish whether the initiating event was driver allocation, kernel reclaim or another startup condition. It does not isolate query reuse or the save repair as the cause. `guard-stop.json` is a later sample than the regular-sample peak, so those swap numbers are not interchangeable.

No GPU retry, security change, production fault injection or cutover followed. Native repaired-release cancellation, eviction, crash recovery and production-cache-pressure qualification remain open gates for any future release. D03/D04 close as **not run**, not passed. The prepared files are not installed in the live service.

## Two CPU-only operator profiles

The frozen B0-score3 runtime was instrumented at graph operator boundaries, preserving its small-target-batch and score3 object. Query reuse and the save repair were not enabled in this diagnostic parent. Sparse 1/32 samples covered n4 long F16 score, long F16 value and Q4 projection operators; separate P-core/E-core user PMU groups recorded cycles, instructions, cache references/misses and enabled/running times. No per-tile syscalls or privilege changes were used.

The first source generator failed because its graph-loop comment anchor did not match the pinned source. That failure and the untested first header are retained. The corrected profiler built successfully. Eight no-model ABBA controls on CPU0 and CPU8 verified equal instruction work, correct active/inactive PMU residency, unchanged result and disabled-hook negative controls. Observed synthetic instrumentation overhead was **+2.474% on CPU0 / +0.020% on CPU8**. This does not calibrate overhead for all model operator shapes.

Both model profiles passed the frozen contract: **64,658 cached / 25 evaluated / 128 generated**, seed 42, three retrieval keys and **90 accepted of 110 drafted tokens**. They used sampling offsets 0 and 16, with zero worker swap and peak temperatures 62/68 C. Actual worker placement, sampled CPU migration, clock snapshots and separate PMU residency are retained.

| Profile | Score samples | Value samples | Q4 samples | Combined PMU running/enabled ratio |
|---|---:|---:|---:|---:|
| Offset 0 | 72 | 72 | 3,168 | Score/value about 1.000; Q4 0.995 |
| Offset 16 | 64 | 64 | 3,160 | Score/value about 1.000; Q4 0.994 |

Score and value samples ran almost entirely on P cores; Q4 samples included both core types. Zero running time for the inactive PMU is expected residency, not loss of counter access. The per-family raw summaries retain both groups separately.

The sampled thread-wall totals split about 45% score, 29% value and 26% Q4 **within these selected samples only**. They exclude other operations, non-n4 work and short SWA shapes. Boundaries include preparation and internal barriers; systematic sampling can correlate with layer order. The instrumented request throughput is diagnostic and is not a new speed comparison. LLC events do not identify KV traffic or DRAM bytes.

**No additional mechanism is selected.** These samples locate cost but do not distinguish repeated KV loads, conversion work or fusion savings. The earlier negative kernel experiments and B1 query reuse remain the relevant measured alternatives. P04/P05 close as not run; no speculative implementation or repeated speed sweep was added. A useful future measurement would count repeated KV/preparation work directly with an overhead control. Privileged IMC access would need separate permission and would still not identify tensor ownership by itself.

## Retained gains and exclusions

B1's earlier independent eight-run result remains **+0.703% median saved-64K decode** (9.2087 to 9.2734 tok/s), request time -1.027%, with overlapping ranges. The earlier 512-token screen observed +1.359%. This campaign did not repeat or replace those measurements. B0's deployed +3.124% score3 result is unchanged. There is no measured cumulative gain.

No new cold-prefill, near128K, dual128K, long-coding quality, production cache-pressure or broad numerical noninferiority result is established. Prior backend numerical/task tests cover the unchanged arithmetic; they do not qualify the new combined serving release.

## Verification and publication

- **22 tests / 146 assertions passed** across controller and closeout suites. Original failed test expectations are retained separately.
- Offline checks reconstruct both source patches, verify exported SHA-256 manifests and replay artifact/provenance/guard assertions. Large states, models, binaries and mutable runtime state are excluded. Full binary rebuilds and fresh inference are not part of archive verification.
- `build-inputs.json` records the 198 build/input object identities used by the isolated relinks.
- `final-restoration.json`, verified at **2026-09-11T16:20:21.425Z**, confirms B0 supervisor/worker **796086/796103**, original unit/config/argv/mapped hashes, four CPU tool/cache checks, two idle 131072-token slots, stopped speech and zero swap. Stage leases are clear.
- Version-controlled export: `benchmarks/intel-1340p/gemma-b1-release-20260911/` in the owner's fork. Publication commit and Git-archive verification receipt are supplied separately after verification.
