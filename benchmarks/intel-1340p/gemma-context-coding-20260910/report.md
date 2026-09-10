# Compact-SWA handoff:64K on the retained CPU decoder

The aligned GPU-prefill path passed a64,663-token recall and cached follow-up on the retained CPU binary. The saved state was finite, trial swap stayed zero and available RAM never fell below16.1GiB. Eight counterbalanced coding runs passed: whole workflows were28.8% faster, while warm rounds were3.4% slower than CPU-only. No deployment has occurred.

## Alignment changes

- An isolated sequence-export patch retains the existing768-cell compact-SWA padding instead of exporting only512 sliding cells. It does not weaken the native restore coverage check or alter partial checkpoint saves.
- A restricted converter aligns candidate sequencev3/new server-wrapped text tokens with the retained CPU'sv2/plain-token input. It validates the full Gemma E4B F16 schema, unwraps text-only tokens and checks that token IDs and KV payload bytes are unchanged. Unsupported media, extensions and layouts are rejected.
- The CPU uses the original `b10579-abdbeadfb` binary, compact SWA, F16/FA-off,16 prefill threads,8 decode threads and MTP3. The candidate GPU includes the previously verified large-softmax fix.

See `handoff-alignment.md` for format details and `patch/compact-swa-padding.patch` for the isolated source change.

## Completed controls

| Check | Result |
|---|---|
|4K compact CPU save/restore, old export | Correct answer, but all4,348 tokens re-evaluated |
| Same CPU check, padded export |4,347 cached /1 evaluated; recall and append correct |
| Padded GPU to matching candidate CPU |4,347 cached /1 evaluated; finite state, recall/append correct |
| Candidatev3 directly to retained CPU | Rejected by version guard; original failure preserved |
| Validated converted state to retained CPU |4,347 cached /1 evaluated; MTP recall and append correct |
| Offline padding/converter/route tests |11 pass,34 assertions |

The new wrapper was identified before native conversion testing. No header-only bypass was used: the token envelope is converted explicitly and the compatible KV payload is parsed to its exact end and hash-checked.

##64K result

| Metric | Result |
|---|---:|
| Actual input |64,663 tokens |
| GPU / CPU stream capacity |73,728 /131,072 tokens |
| Provisioned stream count |2 on each backend |
| Tested long conversations |1 |
| GPU prefill |734.66s,88.03 tokens/s |
| GPU save |4.58s |
| CPU restore |0.52s |
| CPU answer |3.39s |
| Whole request including format conversion |746.82s |
| First CPU cache / evaluated |64,662 /1 |
| Follow-up cache / evaluated |64,684 /15 |
| Follow-up request |2.56s |
| Serializedv3 state |1,091,923,940 bytes |
| NaN / Inf |0 /0 |
| Minimum available RAM |16,881,840KiB (16.10GiB) |
| Peak trial swap |0KiB |

The beginning/middle/end answer was `CEDAR-481,MAPLE-726,BIRCH-953`; the follow-up correctly returned `MAPLE-726`. Startup is excluded from the whole-request figure; save, format conversion and restore are included. The finite scan follows timing. This single observation establishes capacity and task correctness beyond32K. It is not a repeated quality gate, a CPU64K speed comparison or a fully loaded two128K-service test.

The two-slot retained CPU and two73,728-token GPU contexts were resident during the trial, using compact SWA. Only one long slot was populated. This supersedes the earlier assumption that handoff requires full-SWA contexts; the old full-SWA memory estimates remain valid for that older design.

## Coding-round work

The previous baseline/hybrid warm runs each evaluated531 tokens and generated573 tokens. The aggregate hybrid overhead was7.80s:6.14s decoding and1.42s prompt evaluation. Build, full-SWA layout and resident GPU effects were confounded; the earlier16.1% median warm regression cannot be assigned solely to routing.

The new counterbalanced ABBA/BAAB run uses the same retained CPU binary and compact two128K geometry on both paths. Hybrid cold requests use GPU prefill and the validated state conversion, then unload the GPU before CPU decode. Warm coding rounds stay on the CPU owner. Cold time includes GPU startup/conversion/unload; it is not the earlier resident-GPU timing metric. Independent median-code tests and tool-result histories are retained for all runs.

All eight ABBA/BAAB runs passed independent code tests (four per profile). Each warm sequence evaluated178 tokens and generated191, avoiding a different-output-length explanation.

| Median | CPU baseline | Aligned hybrid | Change |
|---|---:|---:|---:|
| Whole coding workflow |67.762s |48.251s |28.79% faster |
| Warm coding rounds |14.151s |14.635s |3.42% slower |

The warm comparison is within the prior10% regression limit. It is not a warm speedup. The earlier full-SWA/candidate-decoder campaign had16.1% median warm regression; the new route removes that large penalty, but the changed design does not isolate whether decoder build, SWA geometry or idle GPU residency contributed most. This stage used real tool loops with matched aggregate token counts; a separate teacher-forced-history ablation was not run and causal attribution remains open.

Four repetitions of one median task do not establish broad coding quality equivalence. Original retrieval and arithmetic failures in the prior campaign remain valid; neither was rerun or erased here.

## Safety and remaining scope

Fresh speech clearance was received at16:21:14UTC. Continuous metadata/native/socket checks protected speech work, with6GiB reserve and16MiB per-process swap limits. Temperature is annotation-only. Every maintenance unit has automatic unchanged-service restoration. Final PID571686 is active with zero swap, two idle131072-token slots and exact baseline argv/env/unit/library hashes. Explicit tool round trips under none/auto and cached append pass; the earlier implicit-answer failure was retained without rerunning it. No STT settings or private media were read or changed.

The converter and export patch are experimental. Independent delegated review timed out; current evidence is local source review, offline tests and native checks. Model identity is supplied by the supervised launcher; state files do not authenticate their origin. Arbitrary external files, mixed models, media, native crash recovery and multi-controller concurrency are unqualified. No repository source, installed library, service configuration, commit or push was changed.

Original ccache-permission, missing copied libomp, version-rejection and undersized-fixture failures are preserved with corrected follow-up runs. `results.json` and `audit-results.ts` track the current machine-readable status.
