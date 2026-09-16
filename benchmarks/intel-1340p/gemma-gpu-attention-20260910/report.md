# Iris Xe long-attention precision selection

> Historical deployment snapshot (10-11 September 2026). The [15 September in-process zero-copy service](../gemma-zero-copy-service-20260915/README.md) supersedes the service identity, ports, active flags and rollback targets below. Commands in this snapshot are not current operating procedures.

FP32 accumulation reduced 64K-tail prefill time by **8.10%** in eight counterbalanced runs. A fresh 64,663-token hybrid request completed in **691.385 seconds**, versus the retained 746.817-second control (**7.42% less time**). The latter is one temporal pair, not a balanced fresh-prefill series.

The original CPU service was restored unchanged as PID 612228. Configuration, argv, nine loaded-file hashes, health, two 131072-token slots, explicit tools and cached append passed verification. Process swap was zero. No experimental library or route was deployed.

## Exact scope

`patch/attention-select.patch` targets Intel PCI `8086:a7a0` without cooperative matrices. It requires F16 left/F32 right matrices, at least 64 query columns, and either a reduction axis or output axis of at least 32768 with the other at most 1024.

- `GGML_VK_EXPERIMENTAL_ATTN_MODE=f32` selects existing FP32-accumulation pipelines.
- `small` selects the existing 32x32 tile when available, including its aligned variant when needed.
- Unset or unrecognised modes retain normal dispatch.

No shader, quantisation or KV layout change is introduced by this selector. Existing alignment, allocation, split-K and 64-bit indexing paths are retained. The graph already requests FP32 for KQ scores; the main changed calculation is the long value reduction. Reduced FP16 accumulator conversion overhead is a possible explanation for the gain, but hardware counters have not isolated its cause. The shape gate can also match non-attention GEMMs; those workloads are unqualified.

The host source reconstructs exactly from `4e9740248` plus the selector patch. The measured runtime also retains the earlier large-softmax shader fix and bounded compact-SWA export. CPU handoff uses `b10579-abdbeadfb`, decode 8 / prefill 16, MTP3, batch/microbatch 1024/256, F16 KV, FA off and compact SWA. GPU microbatch is 256. Capacity is two CPU 128K streams and two GPU 72K streams; one long conversation was populated.

`runtime-provenance.json` captured both running trial processes, mapped-file SHA-256 hashes and allowlisted inference environment during full64K. The loaded Vulkan library was `3d679dce59a861095089582b5a870b19d97e44d65ad7e24e2a77b02a697475b8`. Timed requests did not enable dispatch tracing. The inherited build script still prints a split-K label; its command file compiles this campaign's attention selector, not the earlier split-K override. The inherited `full64.ts` metadata mentions microbatch1024, but saved argv confirms256; the metadata label does not describe the executed configuration.

## Screens and counterbalanced confirmation

Every tail request restores the same finite state, reuses 64658 tokens, evaluates 1022 and generates 21 tokens. All three positional keys are checked. All screens and confirmations passed these checks.

| Sequential screen, two runs each | Median prefill |
|---|---:|
| Normal selection | 30.179 s |
| Smaller 32x32 tile | 33.214 s |
| FP32 accumulation | 27.396 s |

The smaller tile was correct but slower. Keep the branch for shape-specific follow-up, without changing the tested default.

Eight ABBA/BAAB confirmations, four per mode:

| Median | Normal | FP32 | Time reduction |
|---|---:|---:|---:|
| 1022-token tail prefill | 29.8126 s | 27.3971 s | 8.10% |
| Request including GPU answer | 36.3883 s | 33.9733 s | 6.64% |

GPU answer generation took about 6.55 seconds. CPU owns decoding in the hybrid route; these GPU-tail answer timings do not establish a decode improvement.

## Native numerical controls and review

Six matrix cases cover long value reductions and long score output, with default and explicit FP32 precision. The original CPU reference and tolerance are unchanged.

| Mode | Passing cases |
|---|---:|
| Normal | 4/6 |
| Smaller tile | 4/6 |
| FP32 selector | 6/6 |

The same two default-precision failures occur in normal and small modes: errors 0.000692352 and 0.001388645 versus a 0.0005 tolerance. Explicit-FP32 cases already pass. All failures remain in the raw logs. Separate native diagnostic traces show 32x32 tiles for `small` and 64x64 for `f32`; tracing was disabled for timings.

A delegated diff review raised a possible MMQ-selection interaction. Full-source inspection found no F16 x Q8_1 MMQ registration in this build. The empty getter falls back to F16/F32, and the Q8_1 getter already uses FP32 independently of the precision argument. Revisit this assumption if F16 MMQ support changes. Traces describe tiles before a possible 64-bit wrapper, rather than the final pipeline identity. This focused review does not qualify the complete backend or serving lifecycle.

## Fresh 64K hybrid request

| Measure | Prior control | FP32 selector |
|---|---:|---:|
| GPU prefill, 64662 tokens | 734.558 s | 679.833 s |
| Prefill throughput | 88.03 tok/s | 95.11 tok/s |
| Prefill through first CPU answer | 746.817 s | 691.385 s |

The prefill reduction was 7.45%. Total includes GPU prefill, save, validated v3-to-v2 conversion, CPU restore and first answer. Worker startup, subsequent append and the offline finite-value scan are excluded from both totals. The GPU remained resident for this matched full64K comparison.

Validation passed:

- Exact 64663-token fixture; CPU reused 64662 and evaluated one token.
- Beginning, middle and end key recall; subsequent middle-key append.
- Append reused 64684 tokens and evaluated 15.
- Saved 1091923940 bytes; converted native CPU file retained KV bytes and token IDs with the validated token-envelope conversion.
- All saved KV values finite, parser consumed the complete file, SWA export at most 768 cells.
- MTP-enabled retained CPU completed answer and append.

This is a memory-safe long handoff, not proof of fully populated dual128K or full128K fallback. Broad task-quality equivalence and native worker crash/respawn remain unqualified.

## Resources and restoration

The minimum available memory in the full run was 17323412 KiB (16.52 GiB). Peak summed process RSS was 16.28 GiB; PSS was 11.51 GiB. Shared GPU allocations are not fully represented by those process sums. All recorded trial-process swap was zero. The CPU package reached 100 C; temperatures at or above 95 C were annotations under the approved policy, with hardware protection left active.

Fresh speech clearance preceded the supervised stages. Guards checked job states, native speech CPU activity, CLI presence, queued socket bytes, 6 GiB available memory and 16 MiB maximum swap per trial process. The final unit completed successfully and restored production via `ExecStopPost`. Speech services, private media and production settings were untouched.

`restoration-identity.json` records unchanged service config and library hashes. Four final requests exercised an uninterrupted explicit tool call/result under `none` and `auto`, followed by cached append; answers were `23` and `RESTORED`. The earlier implicit-answer empty response remains preserved in the quality campaign. Passing this explicit fixture does not erase that failure.

## Next discriminating test

The earlier median coding fixture was about 3.2K tokens and never exercised the selector's long-axis gate. The next bounded test is the same executable coding/tool task at about 36K, comparing normal and FP32 selection in one ABBA block. Keep CPU8/MTP3, GPU256, FA off and state layout fixed. Combining microbatch1024 or split-K now would confound the selector's practical effect.

Retain the FP32 branch for its measured timing and numerical benefits. The smaller tile, microbatch1024, split-K4 and CPU fused-FA branches retain their recorded costs and conditional uses. A global performance maximum and deployment readiness have not been established.

## Evidence

The export contains the plan and amendments, selector patch, build commands, runtime provenance, native failures/traces, raw request and resource records, audit/tests and restoration evidence. `verify-offline.sh` reconstructs excluded source from the pinned revision, checks hashes and reruns offline tests without model inference. Model weights, runtimes and multi-GB slot files remain local.
