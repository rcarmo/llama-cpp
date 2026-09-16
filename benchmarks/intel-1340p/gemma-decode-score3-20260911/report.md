# Score-only 3x4 tile: 3.12% faster decode, not deployed

> Historical deployment snapshot (10-11 September 2026). The [15 September in-process zero-copy service](../gemma-zero-copy-service-20260915/README.md) supersedes the service identity, ports, active flags and rollback targets below. Commands in this snapshot are not current operating procedures.

Eight counterbalanced 64K runs measured **8.6634 to 8.9341 tok/s (+3.12%)** for a score-only 3-row/4-query tile over the deployed ATTN4 decoder. Median request wall time fell **2.99%**, from 16.560 to 16.066 seconds. Qualification was interrupted by queued speech traffic during the baseline 4K prefill. Production remains `20260911-attn4`; no cutover was attempted.

## Candidate and saved profile

The earlier small-batch shape profile attributed 5.041 seconds to long n4 score products and 3.568 seconds to long n4 value products. Long n1 attention totalled 0.897 seconds. These historical instrumented node-wall sums include an appended prompt tail; they are not fresh profiling of the deployed ATTN4 decoder.

The candidate reuses `gemm_bloc<3,4>` for F16 score products with `k=512`, `m>=32768`, `n=4`, `m%16=0`, within the existing non-reference AVX2/F16C/FMA ATTN4 gate. It uses 48-row work-queue jobs and 1-row or 2-row final tails. The deployed 2x4 value-product path is unchanged. Activation requires both `GGML_CPU_EXPERIMENTAL_ATTN4=1` and `GGML_CPU_EXPERIMENTAL_SCORE4_3ROW=1`.

The mechanism could reduce query-vector loads by sharing them across three rows. Twelve accumulators, three input vectors and one query vector consume the 16 AVX2 vector registers. No assembly/spill analysis was performed, so the measured gain is not assigned to a specific instruction change. Tile and job geometry changed together.

Target small-batch dispatch stays enabled, CPU decode/prefill threads are 8/16, draft threads 8/16, MTP3, F16 KV, FA off, batch/microbatch 1024/256 and two 131072-token slots. No GPU or new long prefill was used for native/timing work.

## Native tests and timings

Eleven native reference cases pass in each mode. The original eight cover score/value products at 32K/64K with query counts 1 and 4. Three additional score cases use `m=32784,64768,65024`. Traces confirm the five score shapes and row remainders 0, 1 and 2. The value and reference paths remain unchanged. A delegated review found the job partition, tails and barriers sound within the outer gates.

Each timing worker independently restored the same state, reused 64658 tokens, evaluated 25 and generated 128. All runs recalled the three fixture keys, with identical output hashes and 90 of 110 proposed draft tokens accepted. Timing traces were off. A candidate worker's actual maps, argv and flags were captured in `runtime-provenance.json`.

| Order | Score3 flag | Decode tok/s | Request seconds |
|---:|---|---:|---:|
| 0 | Off | 8.8041 | 16.112 |
| 1 | On | 8.8428 | 16.240 |
| 2 | On | 9.0175 | 15.883 |
| 3 | Off | 8.6838 | 16.570 |
| 4 | On | 8.8507 | 16.221 |
| 5 | Off | 8.6431 | 16.551 |
| 6 | Off | 8.5964 | 16.590 |
| 7 | On | 9.0394 | 15.911 |

The decode ranges did not overlap in this block; request-wall ranges did. Four observations per mode and one fixture do not establish broad quality or non-regression. Worker swap was zero, available memory stayed above 22.638 GiB, and the maximum recorded temperature was 78 C.

## Qualification abort and restoration

Fresh speech clearance at 00:58:24 UTC allowed CPU qualification and one conditional cutover. At **00:59:54 UTC**, the receive-queue guard fired during the baseline 4K prefill, before candidate qualification. `guard-stop.json` records queued speech bytes and trial CPU PID 665545 with zero swap. No candidate finite-state/tool-slot check or production smoke ran.

The guard sent SIGTERM, but the native process remained waiting and the harness HTTP request did not finish. Inspection detected the stalled stop; the supervised qualification unit was stopped and SIGKILL was sent only after confirming PID 665545 still belonged to this trial. The restoration hook brought back the unchanged ATTN4 release. No qualification or cutover retry followed.

Read-only live identity, exact libraries, two idle slots, zero swap and unchanged GPU/adapter checks passed. Fresh speech clearance permitted only a short restoration smoke; at 01:03:05 UTC, tools and cached append passed on supervisor/CPU **666271/666288**. No trial units or GPU worker remain. The candidate release directory was prepared but never activated. It must not be mistaken for deployment.

The earlier ATTN4 campaign's unexplained GPU-startup swap event remains separate evidence. This qualification abort was a speech receive-queue event with zero recorded trial swap; no GPU ran.

## Harness corrections and retained failures

- The first two native passes loaded only eight cases because the three added cases were human-readable descriptions, while `--test-file` accepts numeric graph-export records. The initial blank-line diagnosis was wrong. The parser was inspected, cases regenerated with exact tensor strides, and eleven cases then passed in both modes. The original files/logs remain.
- One native-only launcher accidentally retained a build command. Its unique-run guard refused to overwrite the saved build before doing work; production was restored. No backend rebuild was needed.
- An early post-confirmation verifier ran before the restoration hook completed and saw stale process identity. Waiting for the supervised unit and then verifying the actual supervisor succeeded. The audit now requires restoration after the last timing run.
- The measured harness contains an inherited stale `livePid=648747`. Maintenance required production to be inactive, and trial resource admission used actual trial PIDs. Zero-valued dead-PID counters are not measurements of production; restoration uses the actual supervisor metadata.
- `campaign-measured.ts` preserves the exact harness used for these results. The later `campaign.ts` and `guard-safety.ts` cancel pending HTTP work on a guard failure, then TERM/KILL only captured owned subprocess handles after 1.5 seconds. Non-maintenance production PID lookup now uses supervisor metadata. These changes were tested offline, including a real lightweight child that ignores SIGTERM; they have not been used in a subsequent inference trial.

Offline tests: **6 pass, 26 assertions**, covering saved timings, exact tile/tail coverage and owned-process cancellation. The failed qualification has no fabricated completed result or timing; its native log and guard snapshot are retained.

## Source and status

- Base source: `abdbeadfb`, plus the deployed `tools/gemma-hybrid/patches/attn4.patch`.
- Incremental candidate: `patch/score3.patch`, only `ggml/src/ggml-cpu/llamafile/sgemm.cpp`.
- Source SHA-256: `18f785c33c61fe8a4e93b890c60d5f5e9556ee018ed3274383ebd08e70d3ccca`.
- CPU backend SHA-256: `f288945950f823924282dc70f5d1b68ea8750f0b4ab29adb14e4db5016468ba1`.
- Deployed release: `20260911-attn4`; prepared, inactive candidate: `20260911-score3`.
- Next candidate gates: resume the incomplete 4K pair and finite64K/tools/cache qualification only after fresh clearance, then a separately guarded single cutover if all gates pass. Do not repeat the eight completed decode comparisons without a new question.

The safe versioned export excludes runtimes, models, multi-GB states and private baseline config. Its offline verifier reconstructs the candidate from the pinned base plus both patches, checks hashes and audits saved evidence. Historical stage scripts require current local inputs and fresh maintenance clearance; they are not automatic retry instructions.
