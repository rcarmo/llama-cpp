# Hybrid performance above 32K: retained candidates and measured limits

The aligned compact-SWA GPU-prefill/CPU-MTP path remains the best validated whole-workflow configuration from these campaigns. This follow-up found useful conditional and numerical improvements, but no additional general-purpose speedup suitable for changing the default.

Keep CPU decode 8 threads, prefill 16, MTP3, FA off and GPU microbatch 256 as the experimental baseline. Preserve GPU microbatch 1024 for long-tail workloads and split-K4 for further numerical work. Production is unchanged; source and evidence are checkpointed in the owner's fork, separately from deployment.

## Baseline and controls

- Intel i5-1340P / Iris Xe, PCI `8086:a7a0`, shared memory, about 31 GiB usable RAM.
- Retained CPU `b10579-abdbeadfb`: Gemma E4B QAT Q4_0 target, Q8_0 MTP3, decode 8 / prefill 16 threads, batch/microbatch 1024/256, compact SWA, F16/FA-off and two 131072-token slots.
- Experimental GPU `4e9740248` plus the previously tested large-softmax fix and isolated compact-SWA export patch. Handoff uses the validated Gemma text-only v3/wrapped-token to v2/plain-token converter.
- The saved 64K state comes from the earlier finite, correct 64663-token positional recall run. Reuse avoids repeating its full prefill during screens.
- Speech coordination and continuous job/native/socket checks remained active. Minimum available-memory limit was 6 GiB, swap limit 16 MiB per trial process, temperature annotation only. No speech settings, services or private media were touched.
- Every maintenance unit restored the original service. The final restored PID is 589674, zero process swap, two idle 128K slots, unchanged argv/environment/unit/library hashes, health and explicit tool/cache smoke passing.

The previous aligned campaign remains separate: eight real coding workflows passed, whole median 67.762 -> 48.251 s (-28.79%), warm median 14.151 -> 14.635 s (+3.42%). Those gains are not new measurements from this follow-up.

## CPU decode screen at retained 64K

Each profile ran two 128-output-token requests from the same saved state, evaluated 25 prompt tokens and reused 64658. All key-recall and coverage checks passed. These are sequential screens, not an exhaustive optimum search.

| Profile | Median decode tokens/s |
|---|---:|
| Existing 8 threads / MTP3 | 7.244 |
| Four P-core threads | 7.112 |
| 16 logical threads | 7.013 |
| Explicit OpenMP binding to CPUs 0-7 | 5.412 |
| MTP1 | 5.473 |
| MTP5 | 6.148 |

Explicit OpenMP binding was observed in worker masks, unlike assuming that requested placement took effect. It was slower here. The default remains preferable for this workload; these results do not rule out other context, task or ISA-specific opportunities.

## GPU attention profile

The bounded profile restored the finite GPU state and evaluated a 1022-token tail at approximately 64K. F16 matrix-operation labels accounted for 68.5% of the sampled GPU operator time; softmax accounted for 9.0%. Large attention value reductions were prominent.

The profiler serialises dispatch and changes performance. Its operator timings locate candidates; they are not wall-time speedup evidence. Instrumented and uninstrumented runs remain separate.

### Flash Attention diagnostic

A restricted layout converter transposes only F16 V data. Unit tests and an exact round-trip of the native 1.09 GB state verified preservation of bytes, including NaN bit patterns if present. Native layout checks remain intact.

FA-on restored successfully, but the tail prefill took 146.09 s versus approximately 29.80 s with FA off, and generated repeated `<unused2154>` tokens instead of the keys. The trial stopped at the task gate. The saved result is a failed native FA candidate; the exact cause was not isolated, and no scan established newly corrupted KV. The round-trip check alone does not prove that the native FA path is correct.

Keep this as a diagnostic branch requiring native masked-shape/precision investigation before additional performance claims.

## Microbatch 1024: conditional benefit

A small FA-off screen tested 128, 256, 512 and 1024 microbatches. The promising 1024 result was confirmed in eight ABBA/BAAB tail runs, four per size, all with correct recall and identical cache/evaluated/output counts.

| 1022-token tail prefill median | Time |
|---|---:|
| GPU microbatch 256 | 29.9166 s |
| GPU microbatch 1024 | 28.2651 s |
| Reduction | 5.52% |

Fresh long prefill did not preserve that gain:

| Same 64663-token fixture | Earlier 256 | New 1024 |
|---|---:|---:|
| GPU prefill | 734.558 s | 757.654 s |
| Whole cold request | 746.817 s | 771.706 s |
| Correct recall/append | Pass | Pass |
| NaN / Inf | 0 / 0 | 0 / 0 |

The new full request was 3.33% slower (prefill 3.14% slower). This is one temporal full-request comparison, not a balanced fresh64K series. It does not erase the repeated tail benefit or prove that 1024 is intrinsically worse. Retain the candidate for context-phase-specific batching and combined attention work; leave 256 as the default for now.

### Export-cap repair

A GPU microbatch of 1024 expands the SWA ring beyond the retained CPU's 768-cell capacity. `patch/bounded-swa-export.patch` caps the experimental standard-SWA sequence export to the current window plus 256 existing valid padding positions. It preserves empty/foreign-cell filtering and partial-checkpoint behaviour, and leaves the CPU loader and rollback checks unchanged.

Fresh 4K and 64K GPU-to-retained-CPU checks passed. The 64K export held at most 768 SWA cells, reused 64662 tokens and evaluated one; append reused 64684 and evaluated 15. Minimum available RAM was 14360152 KiB (13.70 GiB), with zero trial swap. This is a useful compatibility fix even though the associated full-prefill timing did not win.

The cap is target-profile-specific: 512-window plus 256 padding. It is not a generic destination-capacity negotiation protocol.

## Split-K: numerical opportunity with neutral timing

The current device-ID lookup returns zero shader cores for this Iris Xe, so its automatic occupancy-based split-K heuristic does not split the long reductions. An isolated environment-gated host-dispatch patch exercises splits 2, 4 and 8 for non-cooperative-matrix Intel F16 products with K >= 32768, M <= 1024 and N >= 64. The existing split-disable condition, allocation and aligned reduction path remain in use.

Native synthetic tests compare two long F16 shapes against CPU, each with default and F32 accumulation:

| Split | Native cases passing |
|---|---:|
| Existing heuristic / split 1 | 2 / 4 |
| Split 2 | 3 / 4 |
| Split 4 | 4 / 4 |
| Split 8 | 4 / 4 |

The two baseline failures use default accumulation. F32 accumulation passes for every split. At K=65536 the reported baseline default error is 0.001388645 against the test's 0.0005 threshold; split 2 reduces it to 0.000698300, and splits 4/8 pass. The initial failed control and the subsequent precision-labelled diagnostic are both retained. No tolerance was relaxed.

All saved64K tail recall/cache screens passed. Eight counterbalanced split1/split4 confirmation runs found essentially unchanged prefill time: split4 was 0.056% slower by median. This is not a demonstrated speedup. The native numerical changes also establish that the override executes; a set environment variable alone would not establish that.

Retain split-K4 as an opt-in numerical candidate. A focused delegated review found no obvious aligned-tail arithmetic issue, but flagged the broad Intel/shape gate and weak source-only tests. Local full-heuristic inspection and native controls address the tested path; another device, arbitrary matching GEMM, fresh full64K state and real coding loops remain unqualified. Narrow the scope and revalidate before any default change. Review notes are in `splitk/review.json`.

## Decision and next useful experiments

Minor regressions are costs to understand, not automatic dead ends. `opportunities.json` records each branch's benefit, cost, uncertainty and next discriminating test.

1. Retain the aligned compact hybrid and the target-bounded SWA export fix as tested experimental code.
2. Keep microbatch 1024 available for long tails; investigate context-phase selection before changing the full-prefill default.
3. Keep split-K4 available for numerical improvement; test composition with batching/precision and narrow native dispatch scope before promotion.
4. Investigate actual FA masked-shape correctness separately from timing; do not repeat a long failing FA run without a new mechanism.
5. Preserve CPU8/MTP3 as the best measured decode profile. Wider task or context coverage can change the ranking.

No global maximum, general quality equivalence, fully populated dual128K service, native crash recovery or deployment is claimed. The earlier retrieval/arithmetic task failures remain in the prior quality campaign. Current tests establish specific mechanisms and workload-dependent outcomes.

## Evidence and repository checkpoints

- `results.json`, `audit-results.ts`: machine rollup with failed runs preserved and completion assertions.
- `validation-plan.json`, `amendments.json`, `opportunities.json`: prespecified stages, amendments and retained research directions.
- `gpu-profile.json`, `splitk64-dispatch-profile-profile.json`: instrumented operator diagnostics.
- `runs/decode64-*`, `runs/attention64-*`, `runs/batch64-*`, `runs/confirm64-*`, `runs/full64-1024`: raw manifests, requests, timings and telemetry.
- `runs/splitk-kernel-*`, `runs/splitk64-*`, `runs/splitkconfirm64-*`: original failure, precision controls, task screens and neutral timing confirmation.
- `patch/bounded-swa-export.patch`, `splitk/attention-split-k.patch`: separate opt-in experimental source changes; not installed.
- `offline-tests.txt`: 15 tests / 65 assertions, including converter round trips, padding bounds and override preconditions. Native controls are separate.
- `final-verification.txt`, `restoration-tool-smoke/`: unchanged production identity, zero process swap, explicit tool round trips and cached append.

The owner-directed fork policy and optimisation skill were committed and pushed in separate checkpoints. Remote updates were merged without rebase. These documentation/Git changes did not replace any loaded service library. Model weights, slot-state binaries and build products remain local and are excluded from the version-controlled evidence export.
