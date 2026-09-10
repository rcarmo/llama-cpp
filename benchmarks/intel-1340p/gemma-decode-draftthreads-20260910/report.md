# Independent MTP draft threads: retain8

Reducing only the MTP assistant's decode threads from8 to4 made64K generation **4.10% slower**: median **8.505 to8.156 tok/s** across eight counterbalanced runs. Request wall time increased3.46%. Keep the deployed8-thread draft setting.

This is a new independent factor. Earlier thread screens changed target and draft settings together; this comparison held the deployed target small-batch rule and both prefill pools fixed. No new binary or production setting was installed.

## Fixed workload

- Same retained64K KV,64658 cached tokens,25 evaluated and128 generated per run.
- CPU Gemma target: decode8, large-prefill16; small target batches of at most four rows use the8-thread pool.
- Draft: decode8 or4, batch16 in both; MTP depth3.
- F16 KV, FA off, compact SWA and two128K slots.
- Same patched runtime and mapped `libllama` hash `35289adccdf6965d3d7eb7ade2271723b1169e65772bf849c8a5431288d0aec9`.
- Temperature0, fixed seed/prompt; no GPU, profiling or rebuild.

Each process recorded actual argv, allowlisted environment and library identity. Only `--spec-draft-threads` changed. CPU affinity was not changed or claimed to be newly enforced.

## ABBA/BAAB results

| Order | Draft threads | Decode | Request wall |
|---|---:|---:|---:|
|0 |8 |8.578 tok/s |16.585 s |
|1 |4 |8.249 tok/s |17.233 s |
|2 |4 |8.063 tok/s |17.722 s |
|3 |8 |8.501 tok/s |16.971 s |
|4 |4 |8.485 tok/s |16.977 s |
|5 |8 |8.420 tok/s |17.005 s |
|6 |8 |8.509 tok/s |16.816 s |
|7 |4 |7.932 tok/s |17.817 s |

| Median | Draft8 | Draft4 |
|---|---:|---:|
|Decode |8.5051 tok/s |8.1562 tok/s |
|Generation time |15.050 s |15.696 s |
|Request wall |16.894 s |17.478 s |

Request timing includes the25-token append and128-token generation, excluding startup and state restore. All eight recalled the three keys, accepted90 of110 drafts and generated identical token sequences. Exact equality was recorded diagnostically; recall and work counts were the hard checks.

The four-thread results vary more, and one observation overlaps the eight-thread range. This small screen is sufficient to retain8 as the default among these two settings. It does not establish that8 is optimal for every context, draft model or physical-core placement. The earlier profile attributed only1.72 seconds to drafting versus16.46 seconds to target verification before the small-batch optimisation, limiting the plausible payoff from reducing draft overhead alone.

## Restoration and safety

Fresh speech clearance at23:28:42UTC covered this CPU-only block. The supervised unit enforced an eight-minute cap, immediate and continuous speech job/native/socket checks,6GiB available-memory reserve and16MiB maximum swap per trial process. All trials had zero swap, at least22.68GiB available and at most76C. No STT configuration or private media/transcripts were touched.

The current `20260910-smallbatch` hybrid unit and configuration were restored byte-for-byte, not replaced with an older release. Final verification recorded supervisor648729 / CPU648747, zero swap, exact pinned maps/argv/flag, explicit tools under `none` and `auto`, cached append and two idle128K slots. The unit completed successfully and no trial remained active.

## Evidence and decision

Two offline tests/seven assertions reconstruct all eight raw results and reject an accidental coupled target-thread change. The export includes runtime identities, responses, samples, fixtures and restoration evidence. It excludes models, binaries, private baseline config and large slot files. Offline verification performs no inference.

Keep draft8 and the deployed target small-batch optimisation. Preserve draft4 as a measured negative result rather than rerunning it without a new placement/workload hypothesis. The next decode investigation should identify expensive target matrix shapes and activation packing with instrumentation separated from throughput comparisons. Long-context coding-contract failures documented in the preceding campaign remain unrelated open quality limits.
