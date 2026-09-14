# In-memory KV handoff implementation - 13 September 2026

The opt-in same-process Gemma Vulkan-to-CPU KV handoff is implemented, including copied fallback and CPU MTP continuation. Trained E4B runs transferred 19,922,944 KV bytes through retained CPU views with zero payload copies. The corrected MTP run generated the requested counting sequence up to its 16-token limit.

The qualification used an uncommitted working tree on base `61edd155ea699863879c10c5d66fe110c03c4a04`, now recorded as implementation commit `d2028882bd6bfb6d967f0538761639ca8c75599c`. The original runtime manifests retain those historical identities. Publication does not deploy the feature. The existing TypeScript hybrid proxy/file handoff and production service configuration are unchanged. Full implementation here means the explicitly scoped one-way, whole-context API and native caller; it does not mean automatic migration inside the existing server.

## Implemented surfaces

| Surface | Behaviour |
| --- | --- |
| `llama_context_params.kv_cpu_shared` | Requests cached/coherent Vulkan KV buffers before graph creation. Unsupported allocations keep normal buffers. Default false. |
| Vulkan registry procedures | Export the tested shared allocator and retained CPU-view primitive without a hard Vulkan link from llama. |
| `llama_kv_handoff_cpu` | Prepare/commit a quiescent context's entire KV state into an empty CPU context. Consume source on success. |
| Plain/ISWA cache transaction | Prepare all views/copies and metadata before replacing either full or sliding cache. Copy fallback uses at most 1 MiB scratch. |
| Metadata | Preserve positions, sequence membership, extension token/spatial data, stream mappings and heads. Match tensor types/shapes/strides and ring geometry. |
| Scheduler/lifetime | Drain/invalidate graphs, bind CPU tensor buffers, force destination reservation. Views retain Vulkan allocations after source context/model destruction. |
| Borrowers | Reject transfer with active borrowers. Creating a new assistant validates existing shared cells instead of resetting them. |
| `llama-gemma-in-memory` | Keep history/sampler in RAM; prefill, hand off, free GPU owner, reevaluate last token, continue on CPU. Optional `--mtp ASSISTANT.gguf` uses existing MTP3 drafting and target verification. |

The API is synchronous. The caller must serialise both contexts and all memory handles, and may only destroy the consumed source afterward. There is no asynchronous transfer queue, cross-process import or shared scheduler alias registration. Destination tensors already have CPU buffer types, so normal CPU scheduling applies.

Independent model loads require the same immutable local file snapshot and matching metadata/geometry. File identity uses device/inode/size/timestamps, not a content hash. Independent loads with metadata overrides reject; unsupported platforms fail closed for independent-file identity. The same model object remains eligible where the other checks pass. The caller must not change weights or files in place.

Read [the API and caller documentation](../../../../docs/in-memory-kv-handoff.md) for restrictions and commands. Compact SWA transfer requires equal source/destination microbatch and ring geometry. This implementation does not resize, transpose or requantise KV.

## Verification

### Fresh build and CPU tests

The initial library was built from fresh CPU-side objects, avoiding stale context/model layouts. Debug build: Clang 22.1.8, `-O0 -g0`, Vulkan disabled in the base build, CPU backend enabled. Normal CMake targets then linked the tests and caller. Final evidence: `evidence/final-offline-ctest.log`.

| Test | Result |
| --- | --- |
| `test-kv-handoff` | PASS: plain/ISWA payload and metadata; retained aliases; fallback; independent sequences; source destruction; pending-shift/layout/occupied/borrower rejection; exception and abandoned prepare; post-transfer null buffer handling; assistant construction preserves populated cells |
| `test-context-handoff` | PASS: public cancellation/no-copy/borrower gates; source consumption; exact same-backend continuation; independent file snapshots; metadata-overridden load rejection |
| `test-context-handoff-gemma` | PASS: synthetic Gemma4 with full512/SWA256 rings, source destruction and exact CPU logits/state continuation |

Final result: 3/3 CTests passed. The native caller target links through CMake, with optional MTP support using `llama-common`. No test was skipped. The final offline verifier also checks retained GPU/trained logs, outputs, guard samples and cleanup.

### Physical Iris Xe synthetic integration

A separate O1 Vulkan plugin contains the registry procedures and shared-buffer implementation. It uses retained shader objects; this was not a fresh release-mode shader/backend build. Original primitive binaries are preserved separately.

A tiny untrained Gemma4 fixture loaded separately on Vulkan and CPU, with one 512-cell full-context layer and four 256-cell sliding layers. The handoff reported:

- shared bytes: **196,608**;
- copied bytes: **0**;
- source context/model freed before four CPU continuation steps;
- destination logits/state exactly matched a CPU context restored from the same source state through the explicit copied control.

This comparison isolates storage/ownership. It does not require independent CPU and Vulkan prefill token equality. The copied control uses RAM serialization in the test only; the actual handoff and native caller do not serialize KV or create state files.

Evidence: `handoff-gpu-run/`, `evidence/handoff-gpu-unit6.log`. Unit runtime 365 ms, peak 81.4 MiB, zero swap. Earlier successful equal-ring test and all preceding failures are retained separately.

### Trained target-only E4B smoke

Read-only weights: `projects/models/gemma-4-e4b-qat-mtp/gemma-4-E4B_q4_0-it.gguf`.

Prompt requested the word Hello; output was `Hello.`. The caller reported **19,922,944 shared bytes / 0 copied bytes**. Four-token output budget; generation may stop early on EOG. Native exit 0, wall 16.285 s. Evidence: `trained-smoke/`, `evidence/trained-unit.log`.

- 163 resource samples; minimum host available memory 16,701,480 KiB.
- Maximum sampled worker swap 14,384 KiB, below the 16 MiB guard; max sampled temperature 71 C.
- Unit peak reached the 14 GiB cap, aggregate swap 15.9 MiB. This is a capacity warning: simultaneous weight allocations and driver/page-cache residency cost much more than the 19 MiB KV payload.
- Services unchanged; owned process gone and unit collected after run.

### Corrected trained MTP smoke

Assistant: `projects/models/gemma-4-e4b-qat-mtp/gemma-4-E4B-it-qat-assistant-MTP-Q8_0.gguf`.

GPU/source context and model were freed before CPU assistant construction. The new assistant shared the CPU-owned target KV without clearing its cells. Re-evaluating the last target token primed the assistant hidden state, then the existing speculative engine drafted up to three tokens per iteration. Target greedy logits determined acceptance; rejected tails were removed.

Output at the 16-token cap:

```text
One, two, three, four, five, six, seven, eight,
```

- KV handoff: **19,922,944 shared bytes / 0 copied bytes**.
- MTP: **12 drafted / 10 accepted / 16 output tokens**. Both acceptance and rejection paths ran.
- Native exit 0, wall 23.355 s; unit runtime 23.491 s.
- Unit peak 12.4 GiB, aggregate and sampled worker swap 0.
- 233 samples; minimum available memory 16,876,628 KiB; max sampled temperature 76 C.
- Services unchanged. No owned model/test/container process remained; transient unit collected with MainPID=0.

Evidence: `mtp-corrected/`, `evidence/mtp-corrected-unit.log`, `evidence/in-memory-cleanup.txt`. The corresponding window was explicitly admitted by @whisper and released immediately after cleanup.

This is a short functional continuation check. It does not establish MTP throughput, broad task quality or long-context capacity.

## Failure history and fixes

Retained failures are part of the evidence:

1. Cache fixture passed ISWA constructor booleans/integers in the wrong order, causing FPE. Corrected the fixture.
2. Synthetic tensor initialisation put zeros into optional RoPE factors, causing NaNs in source prefill before any handoff. Diagnostic callbacks isolated RoPE; fixture uses valid positive factors.
3. Existing Gemma model saver omitted required SWA/per-layer metadata and a projection tensor. The test-local fixture writer supplies original geometry and enumerates all model tensors; exporter/defaults were not changed.
4. CPU/Vulkan model tensors enumerate in different buffer-allocation orders. The original identity check falsely rejected a valid transfer; it now compares by name/type/shape.
5. Initial MTP run returned whitespace despite exit 0 and draft activity. It failed the quality gate. Creating the assistant called `resize()` on shared target cells, which reset their contents. Borrower construction now validates existing dimensions without resetting, with a regression test asserting state preservation. Corrected MTP run produced the counting sequence. Original whitespace output is retained in `mtp-smoke/`; its process success is not a quality pass.
6. Compile-only field/name mismatches during implementation were fixed before passing builds. Logs remain under `evidence/`.
7. An earlier delegated review identified post-transfer null-buffer handling and missing view-lifetime documentation. Both were fixed. Later broad/direct-file reviews timed out; they are not counted as completed reviews. Final scope was manually reviewed and tested.

The original zero-copy primitive build/skip history and access-cost experiment remain in the earlier reports and sealed archives. Their completed tests were not repeated without a new integration question.

## Runtime identity and final source

The corrected MTP manifest records the precise executable/library hashes used for that run. After it passed, two rejection-only guards were added:

- independent file identity is withheld when model metadata overrides are supplied;
- CLI `--mtp` requires Gemma4 target and Gemma4 assistant architectures.

The first has an offline independent-file regression test. The second matches the architecture metadata captured in the passing trained run; the rebuilt caller links, while no extra trained run was performed merely to repeat the accepted scenario. Transfer and decoding arithmetic are unchanged. Final source/binary identities are recorded separately from the measured manifests; do not substitute final hashes for historical runtime hashes.

The original workspace evidence archive contains the complete patch against `61edd155e`, source snapshots and full failure history. This repository publication stores selected raw qualification/performance evidence, the implementation commit and runnable offline performance analysis. Build recipes are historical transcripts referencing retained workspace paths; they are not a portable offline toolchain distribution. See [the publication guide](../PUBLICATION.md).

## Boundaries

- No long-context/near128K or dual-slot capacity qualification, release-performance claim, benchmark promotion or service deployment.
- One-way whole-context move into a fresh empty CPU context; no live selected-slot alias migration, automatic fallback on malformed layouts or CPU-to-GPU return path.
- Default allocation/scheduler behaviour remains unchanged. `kv_cpu_shared` explicitly opts in. Public context structure additions require rebuilding consumers against the updated header.
- Implementation is recorded in `d2028882b`; this document preserves the measured state and limitations. Unrelated `benchmarks/intel-1340p/gemma-ornith-agentic-20260822/` remains untouched.
- B0 `20260911-score3-stopped`, B1 serving hold, speech state and production policies are unchanged.
