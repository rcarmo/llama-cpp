# Baseline ledger

**Current deployed and general experimental reference: B0-score3.** The bounded plan closed without a useful qualified successor. The final qualification update below adds recovery coverage and dual64K restored-slot capacity; dual128K and full prompt-cache pressure remain unqualified. Earlier observations are retained by date. Each later baseline is append-only, scoped and linked to its comparison parent.

## B0-score3: adopted at the planning reset

Full machine-readable runtime/flags/hashes: [baselines/B0-score3.json](baselines/B0-score3.json). Live identity was rechecked at 06:47:05 UTC on 11 September 2026; no inference was run for this planning task.

| Field | Value |
|---|---|
| State | Deployed, safe starting reference within listed coverage |
| Live release | `20260911-score3-stopped` |
| CPU | Small-target-batch8; score3x4 / value2x4; decode8 / prefill16; draft8/16; MTP3 |
| GPU | IrisXe FP32 accumulation, microbatch256, eligible cold text4096..65536 |
| KV | F16, compact SWA, FA off; validated padded export/v3-to-v2 handoff |
| Slots | Two allocated131072-token CPU slots; full occupancy unqualified |
| Speech | Explicit stopped mode; both units inactive, no listeners/connections/native workers |
| Candidate CPU backend SHA-256 | `f288945950f823924282dc70f5d1b68ea8750f0b4ab29adb14e4db5016468ba1` |
| Last live supervisor/CPU | 689006 / 689029; PIDs are observations, not durable identities |
| Maintenance restore target for experiments starting now | **score3-stopped itself** |
| B0's operational fallback release | `20260911-attn4` (different from restoring B0 after an experiment) |
| Model identity coverage | Exact target/assistant paths in argv, named Q4_0 target/Q8_0 assistant; require file identity/hash evidence when a new model input is introduced, do not infer identity from alias alone |
| Code/evidence | score3 `f6db76c52`, stopped-speech guard `8863994d8`, rollout `a750ff990` |
| Known gaps | Broad long coding quality, populated dual128K, cancellation at every native phase, original ATTN4 startup-swap cause |

### Measurements inherited by B0

| Increment | Matched result | Scope/status |
|---|---|---|
| Small target batches use8-thread decode pool | 7.3035 -> 8.5099 tok/s, +16.52% | Deployed; eight saved64K observations, fixed work |
| ATTN4 2x4 tile | 8.5536 -> 8.8020 tok/s, +2.90% | Deployed; eight saved64K observations, ranges overlap |
| Score-only3x4 | 8.6634 -> 8.9341 tok/s, +3.124% | Deployed; eight saved64K observations, decode ranges separated in this block |
| Score3 resumed4K pair | 70.963 -> 69.296 s | One pair outside the tile gate; limited non-regression evidence |
| FP32 GPU long attention | Saved tail-8.10%; fresh64K691.385 s versus746.817 s | Repeated tail; full request comparison was one temporal pair |
| Current rollout | 92samples, zero CPU/GPU swap, minimum17.072GiB available | One coldSSE plus warm tools/cache and pinned identity |

These numbers are not additive and are not newly measured by the reset. The new experiment's baseline arm is measured alongside its candidate as specified in the plan.

## Append a baseline when it is validated

Use `B1-decode-<name>`, `B2-prefill-<name>` or the next unused ID; numeric order follows actual validation, not the order suggested here. A combined stack gets its own record and both parent IDs.

1. Save a new immutable JSON manifest and a short ledger entry before starting a dependent experiment. Include source/build/compiler/device/model identity, patch chain, runtime/config/argv/flags/hash identities and whether maps were captured live or only files hashed.
2. Name its **scope**: e.g. saved64K decode, whole cold4K..64K prefill, or 64K-tail-only. Set `reference_eligible_for` accordingly. A tail-only win cannot silently become the whole-prefill default.
3. Record `comparison_parent`, `production_at_test_start`, `maintenance_restore_target`, fixture/input/state hashes, exact work/cache/draft counts, per-run observations, medians/spread, primary and secondary outcomes, tests passed/failed/missing, resource envelope and unresolved findings. Mark unmeasured fields explicitly.
4. Link the raw evidence, numerical/task checks, source reconstruction and offline verification. Pin test definitions before results. A quality-fixture revision starts a new result series; it does not rewrite previous failures.
5. Append an event to [baselines/events.jsonl](baselines/events.jsonl): validated-for-scope, experimentally-adopted, deployed, held, restricted, reference-revoked or superseded. Include time, reason and new evidence. Do not delete earlier events.
6. Deployment needs owner approval and the applicable serving/resource/rollback gates. Record actual unit/release/maps/flags/health/cache checks and the previous operational release. A validated manifest alone is not deployment proof.
7. Refresh the next experiment's reference and restoration paths. Existing comparisons finish against their frozen parent; if changing that parent is necessary, close/amend the experiment and preserve its earlier results.
8. If later evidence exposes an affected integration or safety regression, append a held/restricted/reference-revoked event. New experiments in that scope return to the last safe parent; unaffected validated improvements remain enabled. Fixes get new candidate identities and rerun only the invalidated gates plus necessary integration checks.

No future B1/B2 baseline is marked validated yet. The machine ledger records B0 adoption and its later profile/short-quality qualification event; no new optimisation baseline is implied.

## Retained opportunities and negative controls

| Candidate/result | Keep | Reopen only for |
|---|---|---|
| GPU1024 tail gain7.11%, full64K3.45% slower | Scoped tail evidence and state/layout notes | Context crossover and a feasible fixed-allocation/scheduling implementation |
| Split-K4 better native reductions, neutral timing | Numerical candidate | A changed workload/kernel interaction with an explicit comparison |
| CPUFA fused branch faster than FA baseline, still slower than FAoff | Experimental patch and tests | A new FA-specific bottleneck fix, not another global on/off screen |
| Generic paired F16 helper0.84% slower; n1 only | Negative evidence | New n1 implementation/geometry, not reuse as an n4 optimisation |
| Draft4 slower4.10% than8 | Keep draft8 default and saved runs | A newly measured draft bottleneck after a changed target kernel |
| Q8 KV slower in retained comparisons | Capacity/latency trade-off evidence | A demonstrated capacity need or new quantisation kernel; harmless token drift is not a rejection reason |
| Longer coding speed gains with shared contract failures | Timing evidence plus original failing tasks | The separately frozen successful coding fixtures; never retroactively relabel old tasks |

## Evidence links

- [Smallbatch](../gemma-decode-smallbatch-20260910/report.md)
- [ATTN4](../gemma-decode-attn4-20260911/report.md)
- [Score3 native/timing and failed qualification](../gemma-decode-score3-20260911/report.md)
- [Current production rollout](../gemma-score3-rollout-20260911/report.md)
- [FP32 GPU attention](../gemma-gpu-attention-20260910/report.md)
- [GPU batch-size trade-off](../gemma-f32-batch-20260910/report.md)

## B0 qualification update, 11 September07:25UTC

T01/D01 currentprofile and guardedharness evidence: [report](../gemma-optimization-t01-d01-20260911/report.md). Short baseline tasks now include passing normaliseTags/chunk, retrieval and four toolrounds perseed; originalmergeIntervals export failure retained. Oneprofile records longn4score4.675s/value3.004s/Q4n4 2.890s, without throughputclaim. IdleCPU110448KiBswapwasobservedbeforemaintenance;causeunknown,exactB0restoredzeroSwapafterwork. No B1 was created.

## No adoption after value and batch screens

Value3no-unroll screen did not confirm: independent8runs+0.088%decode,request0.945%slower. Bothnative21case variants retained in69bb102de. Fixedallocation prefill1024 versus256:16K1.17%slower,32K13.26%slower,48K0.39%faster(neutral); no threshold,4e1523fde. NoB1/B2manufactured; B0 still currentreference. P05 scorelarge was subsequently rejected after actual-tile native tests and a 313.881% slower screen; see the final update below.

## Final qualification update, 11 September 2026

[Closeout manifest](baselines/B0-closeout.json) and [integration report](../gemma-integration-b0-20260911/report.md) record current native startup/prefill/save-request/restore/CPU-stream/queued cancellation, owner/partial cleanup and source-matched historical native restart coverage. Synchronous conversion is tested at its boundaries only; current tests use directRequest. The original failed fixture and stopping-PID monitor race remain in the evidence.

Two CPU slots at16,384/32,768/64,663 tokens each passed slot0/1/0 reuse with one evaluated token and zero swap, with cacheRAM0. The near130,000-token attempt hit the20-minute request deadline after57,344 newly evaluated tokens of progress; no completed finite state, dualnear128 occupancy or fallback timing qualified. Production12GiB prompt-cache pressure and broad long quality remain unqualified.

The actual128scoretile passed native tests but was313.881%slower at48K; [negative result](../gemma-gpu-scorelarge-20260911/report.md), d52dbc6a4. No new B1/B2 was created. Final B0 identity/tools/cache/zero-swap verification was09:33:52UTC; lightweight idle/no-orphan/stopped-speech observation09:38:24UTC. Supervisor/CPU746174/746192 are dated observations. Restore target remains B0 itself; operational fallback remains ATTN4. No safety finding revoked an unaffected B0 speed scope.

## Authorised SIMD follow-up, 11 September13:18UTC

[Score and packed-Q4 report](../gemma-simd-followup-20260911/report.md): score3 no-unroll passed11nativecases/mode but lost4runABBA1.65%decode,request2.02%slower. ActualpackedQ4stream passed16generic-referencecases/mode and realmodeldispatch;4runABBA4.15%slower,request4.56%slower. TinyBLASQ4 initialcandidate passednative19/mode but realmodel bypassed it; no timingclaim. No finalist/confirmation/deployment. B0 restored13:18:29UTC with exactidentity/tools/cache/zeroSwap. Small gains remain eligible when confirmed; these candidates lost.
