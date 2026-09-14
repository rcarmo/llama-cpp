# Register-assigned score kernel: spill-free, 2.52% slower

The explicit AVX2 score3 kernel removed inner-loop spills but reduced saved64K generation speed from **9.2872 to 9.0536 tokens/s (-2.52%)**. Request time increased **2.25%**. Both candidate runs were slower than both controls. B0-score3 remains deployed, including its previously confirmed +3.124% improvement.

## Matched screen

| Order | Register-assigned kernel | Generation tok/s | Decode request ms |
|---:|---|---:|---:|
| 0 | Off | 9.2345 | 15411.086 |
| 1 | On | 9.0685 | 15661.905 |
| 2 | On | 9.0386 | 15738.960 |
| 3 | Off | 9.3398 | 15298.487 |

Both arms used the same candidate library, with only `GGML_CPU_EXPERIMENTAL_SCORE3_REGISTERS` changed. Each run started a fresh native worker and restored the same saved64K state. All retained64658 cached /25 evaluated /128 generated tokens, seed42, temperature0, top-k1, and90/110 accepted draft tokens. All three retrieval keys passed and the output-token hash was identical. Output parity is diagnostic; it is not the sole correctness gate.

The B0 smallbatch, ATTN4 and score3 flags stayed enabled. CPU/draft threads remained8/16, MTP3, F16 compact KV, FA off, batch/microbatch1024/256, two allocated131072-token slots, cacheRAM0. Request time includes the25-token prompt tail and128-token generation; worker startup and state restore are excluded. No performance trace ran during the screen.

This four-run screen did not produce a finalist. No independent confirmation, sustained512-token run, broad quality expansion or deployment was performed. Small repeatable gains remain eligible; this candidate lost on both generation and request latency.

## Exact assembly change

The parent score3 kernel uses twelve FP32 vector accumulators for a3x4 tile. Previous generated assembly spilled two accumulators; disabling compiler unrolling did not help. This separate attempt assigns registers explicitly:

- `ymm0`–`ymm11`: twelve accumulators;
- `ymm12`–`ymm14`: three FP16-to-FP32 A vectors;
- `ymm15`: one FP16-to-FP32 B vector, reused across three FMAs.

Disassembly confirms **seven conversions and twelve `vfmadd231ps` instructions per eight-element iteration**, with no stack access or vector moves inside the reduction loop. The helper stores accumulators only after the loop, then uses the parent's horizontal reduction. Floating-point accumulation order is unchanged. The existing48-row job scheduler,1/2-row tails, value products and Q4 kernels remain intact.

The implementation is enabled only for the existing long F16 score3 path (`k=512`, `n=4`, `m>=32768`, with its divisibility gates), on x86_64 with AVX2/F16C/FMA and GNU-style inline assembly support. The helper itself assumes positive K divisible by eight; the caller's fixed512 gate supplies that precondition.

The helper is not inlined. Function calls, accumulator stores, prologue/epilogue and reduction overhead remain. They could explain why removing spills did not improve speed, but this experiment does not isolate their individual costs. The result does not establish that spilling is beneficial or that every hand-written score kernel would lose.

## Correctness and actual execution

- **19 native cases per mode** passed at unchanged tolerances. Cases include long score/value controls, broadcast heads, padded source strides, legal score-job tails, below-gate/odd-output widths,3/5-query exclusions and a non512 reduction control.
- **Nine standalone tests** passed bit-exact comparison against the same ordered intrinsic FMAs and reduction. They cover unaligned/padded source rows and several output offsets, with output canaries outside the3x4 tile.
- A real-model probe recorded **2,072 override traces** and passed the same work/retrieval checks. Its timing is diagnostic and excluded from the screen.
- A delegated assembly-constraint review found no correctness defect under the stated preconditions. It checked the early-clobber offset, all16 YMM clobbers, memory/condition-code clobbers, byte offsets and output mapping. This narrow review does not establish speed or broad model quality.

This attempt had no failed build, native case or resource-guard stop. The previous no-unroll and Q4 failures remain in their separate archived campaign; none was rerun here.

## Restoration and verification

Build, native tests, probe and screen ran sequentially in bounded user-systemd stages with automatic restoration of `20260911-score3-stopped`. Explicit stopped-speech checks stayed active. The6GiB available-memory floor,16MiB worker-swap limit and temperature-annotation policy were unchanged. Every timing run recorded zero worker swap. No GPU load, new capacity attempt, private speech input or production fault injection occurred.

Final restoration at **14:06:06 UTC on11 September2026** passed exact unit/config hashes, nine mapped CPU files, argv/flags, tool calling, tool-result continuation, cached append, two idle slots and zero swap. Observed supervisor/CPU PIDs were768321/768339. The operational fallback remains ATTN4; experimental maintenance restores B0 itself. No experimental code was deployed.

The export includes source, exact patch, compiler/link recipes, compact assembly, standalone/native evidence, raw probe/screen results, resource traces and offline checks. It excludes runtime binaries, whole-library disassembly, model weights and multi-GB state files. Model/state hashes are inherited from the frozen T01 manifest; the screen fixture and built objects are hashed separately.

Run `bash verify-offline.sh` in the export to reconstruct the candidate from the included parent, verify manifest hashes, audit actual instructions and results, and run **10 tests /26 assertions**. It performs no inference, service actions or state regeneration.
