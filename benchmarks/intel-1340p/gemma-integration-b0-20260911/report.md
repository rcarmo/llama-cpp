# Gemma plan closeout: retain B0-score3

> Historical deployment snapshot (10-11 September 2026). The [15 September in-process zero-copy service](../gemma-zero-copy-service-20260915/README.md) supersedes the service identity, ports, active flags and rollback targets below. Commands in this snapshot are not current operating procedures.

The bounded optimisation plan is closed. **B0-score3 remains deployed; no B1 or B2 qualified.** The new decode and prefill candidates did not demonstrate a useful confirmed improvement. Recovery coverage increased, and two CPU slots passed real state reuse at 16K, 32K and 64,663 tokens each. The near-128K attempt timed out and remains unqualified.

## Optimisation decisions

| Work | Result | Decision |
|---|---|---|
| Two value-attention 3x4 variants | 21 native cases per mode passed; independent no-unroll confirmation was +0.08765% decode, with request wall 0.94525% slower | Retain patches and negative evidence; no finalist |
| Active GPU microbatch 1024 versus 256, fixed max1024 allocation | 16K suffix 1.17% slower; 32K 13.26% slower; 48K 0.39% faster | No useful crossover or phase selector |
| Iris Xe FP32 score tile 128x128 | Six native cases per mode passed after correcting availability; 48K ABBA 94.521 s versus 22.838 s, 313.881% slower | Reject performance adoption |
| Combined candidate and deployment gates | Neither track produced a useful qualified successor | Conditional full-prefill, sustained-decode and combined-candidate tests were not run |

The deployed smallbatch, ATTN4 and score3 gains remain enabled. Their historical matched gains were +16.52%, +2.90% and +3.124% respectively; they are separate experiments and are not additive. There was no matched original-versus-final cumulative comparison in this closeout.

Earlier short quality controls passed `normaliseTags`, `chunk`, retrieval and tool rounds. The original `mergeIntervals` export failures remain failures. Broad long-context coding quality has not been established.

## Current native recovery coverage

Tests used the copied B0 `Workers` and `HybridProxy` code with real native workers on isolated ports 18791/18792. `Request` objects entered the proxy directly; this stage did not launch another wire HTTP supervisor. Production was stopped only for authorised, supervised maintenance and restored after each stage. No production worker was fault-injected.

| Check | Evidence and outcome |
|---|---|
| GPU startup | Cancellation during `start()` health wait, live owned GPU PID recorded; 499 response, 5.18 s whole test |
| GPU ready / prefill in flight | Both passed; no retained owner or GPU after drain |
| GPU save request | Cancellation while native save HTTP request was pending; 499 response, 46.30 s including fixture prefill |
| After save / after conversion | Both boundaries passed |
| CPU restore request | Corrected run returned 499, no fatal or guard error, no owner |
| Queued and native CPU-stream cancellation | Queue drained; active native CPU generation cancelled |
| Two-owner alternation and eviction | A/B/A/C sequence passed; A reused its established CPU owner; owner table remained bounded at two |
| Abandoned transfer files | Recognised transfer files removed on startup; unrelated `user-owned.keep` sentinel preserved |
| CPU worker SIGKILL | Exit detected; explicit new controller created another CPU worker and served a new request |

Save/restore cancellation observes pending HTTP calls; internal serialization progress was not instrumented. Startup observes the health-wait phase, not an exact model-load instruction. Conversion is synchronous and was tested only at its boundaries. A completed boundary check does not make mid-conversion cancellation interruptible.

Historical native GPU-kill fallback and CPU-generation/systemd restart tests from 10 September are retained separately in `support/historical-recovery-results.json`. Main, proxy, policy, stream and state source hashes match B0. The worker-code difference is the explicit stopped-speech guard; the exact diff is retained. The current controller-recreation test does not replace the historical supervisor test. Exactly-once external tool execution is outside this adapter's scope.

### Preserved recovery failures

1. The first fixture was too short for GPU routing; `gpu-ready` was never reached. No phase passed in that attempt. The corrected fixture was checked with the actual template/tokeniser and contained 6,206 tokens.
2. Four phases passed in the sized attempt, then restore cancellation returned 502. The outer monitor recorded `Error: Missing counter VmRSS` while observing a deliberately stopping GPU. The harness detached only explicitly stopping workers before awaiting their owned stop; the worker's own GPU guard remained active. Only the failed phase and missing checks were resumed. The corrected restore phase passed with 499.
3. An offline negative-control test initially selected an empty startup sample. It was fixed to select an actual worker sample. The failed test output is retained.

Peak swap in the corrected recovery sequence was 2,616 KiB per worker, below the 16 MiB limit. A 97 C peak is retained as the agreed thermal annotation; it did not trigger a new abort rule.

## Populated capacity

CPU capacity used the B0 binary, F16 compact SWA, MTP, two configured 131,072-token slots and **cache RAM disabled**. Each finite retained state was restored into both independent slot buffers. Requests ran in slot order 0, 1, 0; all nine requests reused the full prefix except for the expected final-token reevaluation.

| Tokens per slot | Cached / evaluated per request | Resident RSS snapshot | Available RAM snapshot | Swap |
|---:|---:|---:|---:|---:|
| 16,384 | 16,383 / 1 | 11.36 GiB | 23.25 GiB | 0 |
| 32,768 | 32,767 / 1 | 11.36 GiB | 23.11 GiB | 0 |
| 64,663 | 64,662 / 1 | 11.39 GiB | 23.04 GiB | 0 |

The samples record a minimum 23.01 GiB available and zero worker swap across this capacity stage. Raw restore byte counts, requests, timing/cache responses, conversion metadata, finite-state scans and mapped-library identities are retained. Both slots received the same validated text state; distinct live conversations were covered separately by the smaller owner test. Large independent conversations with the production 12 GiB prompt-cache budget have not been stress-tested.

### Near-128K attempt

The projection permitted one bounded attempt: restore the retained 64,663-token GPU prefix, append genuine input tokens toward 130,000, then—only on completion—scan the state and restore it into both CPU slots. KV positions were not fabricated or duplicated.

The request hit its existing **20-minute deadline** at 09:29:07 UTC. Last logged progress was **57,344 newly evaluated tokens at 1,197.96 s**, reported progress 0.94. The server cancelled the task. No completed near-128K response, saved state, finite scan, CPU transfer or two-slot reuse exists. It was not retried.

This was a timeout, with no resource-guard event: minimum available RAM was 20.96 GiB and worker swap stayed at zero. Partial progress is not a validated populated-capacity result. The safe measured envelope from this stage is two restored CPU slots at 64,663 tokens each with cache RAM disabled. Dual near-128K occupancy and fallback latency remain unqualified. Production's GPU admission range is unchanged at 4,096–65,536 tokens.

## Final production state

`20260911-score3-stopped` was restored after the final recovery stage. At 09:33:52 UTC, verification passed exact unit/config hashes, nine mapped CPU files, argv and all three CPU optimisation flags, tool calling, tool-result continuation, cached append, two idle slots and zero CPU swap. The final lightweight check at 09:38:24 UTC found the same supervisor/CPU, no trial-native orphan, an empty request queue and stopped speech. Observed supervisor/CPU PIDs were 746174/746192; PIDs are observations, not deployment identities.

No new release or kernel was deployed. B0's operational fallback remains `20260911-attn4`; experiment restoration targets B0 itself. Historical cold-SSE rollout checks remain in the score3 rollout evidence; no redundant cold GPU smoke was run merely to close the paperwork.

During maintenance, the harness's production PID fields are zero placeholders because production is deliberately stopped. Final live restoration checks, not those placeholders, establish production swap and identity. Recovery workers hash pinned runtime files before spawning; CPU maps were captured, but recovery GPU maps were not. The capacity GPU run has its own mapped-file capture. Model hashes are inherited from the frozen T01 manifest.

## Reproduction and verification

Run `bash verify-offline.sh` from the exported directory. It checks the complete export manifest, 34 tests / 99 assertions, raw native phase results, cache counts, library/code identities, resource samples, the preserved timeout and final restoration. Negative controls reject fabricated success, changed cache counts, excessive swap, incorrect cancellation status, changed libraries and stale restoration. It performs no inference, service action or state regeneration.

The export excludes model weights, runtimes, multi-GB KV files and mutable private state. `input-identities.json` binds the locally retained state bytes and the original near-128K input prefix; the raw fixture and compact finite/layout metadata are included. Live scripts retain local paths and are not portable launchers. Historical GPU-kill/systemd outcomes are supported by retained source and results, not freshly rerun at closeout.

Related fork evidence: value variants `69bb102de`, crossover `4e1523fde`, rejected score tile `d52dbc6a4`. The plan's append-only ledger records these outcomes and the capacity limit without inventing B1/B2 or revoking unaffected B0 gains.
