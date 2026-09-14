# GPU prefill crossover: no useful threshold established

The fixed-allocation screens do not support a new256-early/1024-late policy. Active1024 was **1.17% slower at16K**, **13.26% slower at32K**, and only **0.39% faster at48K**. B0 keeps its validated FP32/256 prefill profile. The earlier64K tail gain remains a scoped historical result, not evidence for a32K threshold.

## P01: separate allocation from active batch size

The retained GPU server was built from4e9740248. `llama-context.cpp` fixes n_ubatch at context creation; compact-SWA sizing includes n_ubatch. No public runtime setter exists. The scratch patch leaves max1024 allocation fixed, but chooses active256 or1024 at `memory->init_batch` for causal Gemma4 text batches larger than four tokens. It does not yet implement a context-dependent threshold.

A4K trace verified actual256 microbatches inside a max1024 context. The saved state was finite. The restrictedv3/v2 converter preserved state/token identity, and B0CPU restored4095 cached tokens with only one evaluated token. Parser/launcher fixes reused this saved state instead of repeating the completed GPU work.

Four-runABBA allocation control, same scratch library and active256 in both arms:

| Maximum allocation | Median4K prefill |
|---|---:|
| Real256 |27.442 s |
| Max1024, active256 |27.307 s |

The difference was-0.49%, with two observations/profile. This limited4K result justified testing longer positions; it did not establish long-context allocation equivalence.

## P02: identical-prefix position screens

One GPU process at active256 created16K,32K and48K checkpoints by extending the same retained token-prefix chain. Each state was scanned for finite values and hashed. All exported SWA histories contained768 cells. No fresh64K prefix was generated. Model workers were restarted and the identical checkpoint restored for each timing observation.

Each position used ABBA256/1024/1024/256, max1024 allocation fixed,1022 evaluated suffix tokens and one predicted token. Source inspection and the prefix-extension observations confirmed that an appended prompt retains all prefix tokens; fully cached prompts alone require one-token reevaluation. This cache expectation was corrected before any position timing. Traces were off; live worker maps and flags were captured per run. Final state from each arm at every position was scanned finite.

| Cached prefix | Active256 median | Active1024 median |1024 prefill reduction |
|---:|---:|---:|---:|
|16384 |16.806 s |17.003 s |-1.170% |
|32768 |19.781 s |22.404 s |-13.261% |
|49152 |22.658 s |22.570 s |+0.391% |

Request-wall reductions are recorded separately in `position-results.json`. These are suffix comparisons with two observations/profile, not full-request confirmations or independent task-quality tests. They cannot justify a threshold or a whole-prefill baseline. Old64K tail measurements use different retained work and are not pooled into these medians.

The planned single48K active256 operator profile completed with matched counts. Its raw Vulkan timings remain diagnostic; no throughput claim uses the instrumented run. It identifies long attention matrix products as substantial remaining GPU work. A distinct score-tile experiment is recorded separately under `gemma-gpu-scorelarge-20260911`.

## Decisions

- Preserve B0-score3 and its GPU256 profile.
- Keep static-cap implementation, finite handoff and position evidence for future scheduling work.
- Do not invent a crossover threshold from a neutral48K result and an older64K tail gain.
- P03 phase-selector and P04 full64K confirmation are conditional on a useful candidate; this batch hypothesis has not produced one. No unnecessary full64K sweep is launched for it.
- Continue the separately scoped P05 GPU-kernel investigation. Its results must be judged independently.

## Failures and safety

Retained failures include: ccache launcher permission; an identifier mismatch against the pinned source; suppressed INFO-level trace; finite-scanner JSON schema mismatch; missing handoff destination directory. Fixes were tested and failed runs kept. The direct microbatch trace, finite scan and resumed CPU handoff establish the successful probe without promoting earlier failed records.

All completed probes, allocation controls, checkpoint creation and position screens met the6GiB available-memory/16MiB per-worker swap rules, with zero recorded trial swap. GPU startup also required12GiB. Speech remained deliberately stopped, with explicit fail-closed unit/socket/native checks. Production was stopped only inside bounded supervised maintenance; the then-current B0 release was restored and identity/tools/cache/zero swap verified after each stage.

Source/build/library hashes are in `source-provenance.json`; live hashes are in each run's `runtime-provenance.json`. No production library or baseline manifest was changed. Candidate validity is limited to the stated Gemma geometry, pinned runtime and these workloads. Fully populated dual128K capacity and all-phase native recovery remain separate tasks.
