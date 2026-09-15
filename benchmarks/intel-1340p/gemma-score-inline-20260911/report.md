# Inlined spill-free score kernel: no useful gain

> Historical deployment snapshot (10-11 September 2026). The [15 September in-process zero-copy service](../gemma-zero-copy-service-20260915/README.md) supersedes the service identity, ports, active flags and rollback targets below. Commands in this snapshot are not current operating procedures.

Inlining the explicit AVX2 score kernel removed the per-tile helper call but did not improve the saved64K workload. Generation changed from **9.2160 to 9.1371 tokens/s (-0.856%)**; request time increased **0.928%**. B0-score3 remains deployed.

## Four-run screen

| Order | Inline ASM | Generation tok/s | Decode request ms |
|---:|---|---:|---:|
| 0 | Off | 9.1735 | 15666.482 |
| 1 | On | 9.1498 | 15582.659 |
| 2 | On | 9.1244 | 15747.223 |
| 3 | Off | 9.2586 | 15375.274 |

Both candidate generation observations were below both controls, although the differences are small. Request times overlap. With two observations per arm, means and medians coincide. This is a near-neutral negative screen; it does not establish a precisely measured persistent slowdown. There was no useful candidate benefit to confirm, so no additional timing block, sustained-output qualification or deployment ran.

All four requests used64658 cached /25 evaluated /128 generated tokens, seed42, temperature0, top-k1, and90/110 accepted draft tokens. The three retrieval keys passed and output-token hashes matched. Token equality is diagnostic, supplemented by native numerical and bounds controls.

Each run started a fresh isolated worker, restored the same saved64K state and used the same candidate binary with only `GGML_CPU_EXPERIMENTAL_SCORE3_INLINE` changed. B0 smallbatch, ATTN4 and score3 remained enabled; CPU/draft8/16 threads, MTP3, F16 compact KV, FA off, batch/microbatch1024/256, two allocated131072-token slots and cacheRAM0 stayed fixed. Request time includes the25-token tail evaluation and128-token generation, excluding startup and restore. All timing traces were off.

## What changed

The prior explicit-register kernel was retained as `patch/sgemm-noinline.cpp`. The source delta is exactly `NOINLINE` to `__attribute__((always_inline)) inline`, plus experimental flag/trace names. The ASM arithmetic, operand/clobber constraints, numeric local loop label,3x4 tile,48-row jobs, output stores, horizontal sums and1/2-row tails are unchanged. The source delta has an exact offline test.

Generated disassembly verifies:

- the ASM reduction loop is inside `gemm_score3`, rather than a called helper;
- no call to `gemm_bloc_score_registers` remains;
- seven FP16-to-FP32 conversions and twelve FMAs run per eight-element iteration;
- twelve fixed YMM accumulators have no stack access or vector moves inside that loop.

The48-row job still has its prologue, scheduling, output stores and reductions. Removing the helper call did not remove those costs. The prior out-of-line screen lost2.515%; the current screen lost0.856%, each against its own control. These separate temporal blocks do not isolate the amount of time saved by inlining. No new noinline-versus-inline comparison was run.

The helper remains restricted by the existing long F16 score3 gate (`k=512`, `n=4`, `m>=32768`, normal divisibility controls), on x86_64 with AVX2/F16C/FMA. Value attention, Q4 projections and the production route are unchanged.

## Correctness and failure record

**19 native cases per mode passed** at unchanged tolerances, covering real long shapes, broadcast heads, padded source stride, job tails and excluded widths/query counts. **Nine standalone tests passed bit-exact intrinsic-reference comparisons and output canaries**, using the inlined helper with varied alignment and output offsets. A real-model probe emitted **2,072 override traces** and passed the frozen work/retrieval checks; its timing is excluded.

A delegated read-only review confirmed the intended source delta and noted the importance of local ASM labels and complete early-clobber/register constraints when inlining. The inherited ASM uses a numeric local label and declares offset early-clobber, memory, flags and all16 YMM registers. The review was limited to the supplied delta and generator; it was not performance validation.

One offline negative-control test initially changed the first FP16 conversion in the full job, which belongs to a fallback loop. The audit correctly ignored that unrelated loop, so the mutation test failed. It was corrected to mutate the ASM loop located by its own backedge. The first failure output is retained. No build, native, model or resource-guard failure occurred in this attempt.

## Production and evidence

Heavy stages ran sequentially in bounded systemd user units, with explicit stopped-speech checks, at least6GiB available memory, at most16MiB worker swap, owned-process cleanup and automatic restoration of current B0. Temperatures95C and above remained annotations. Timing runs recorded zero worker swap. No speech work, private media access, GPU experiment, near128K retry or production fault injection was performed.

Restoration at **14:29:47 UTC on11 September2026** verified B0 unit/config hashes, nine mapped CPU files, argv/flags, tools, tool-result continuation, cached append, idle slots and zero swap. Observed supervisor/CPU PIDs were772630/772648. Production remains `20260911-score3-stopped`, retaining the earlier confirmed +3.124% score3 gain; ATTN4 remains its operational fallback. No candidate was deployed.

The export retains source parents, exact patch, compiler/link recipes, compact disassembly, native/standalone/probe evidence, raw screen results, resource samples and restoration. Models, binaries, whole-library disassembly and multi-GB slot files stay local; hashes link the frozen inputs and actual mapped runtimes. `verify-offline.sh` reconstructs the source patch and runs **12 tests /28 assertions**, including negative controls for spills, helper calls, source drift, runtime identity, timing traces and stale restoration. It runs no inference or service actions.

The two explicit-register variants have now answered the immediate spill/call questions without producing a speed finalist. Further work on this kernel needs a different measured mechanism, such as reducing output/reduction overhead or improving data reuse; a fresh repeat of these variants is not justified by the present screen.
