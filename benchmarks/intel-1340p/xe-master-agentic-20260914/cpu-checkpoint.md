# Current-master CPU caller compatibility checkpoint

The fresh build found and fixed a source compatibility gap introduced by the parallel merge: `common_speculative_draft_params.n_past` was removed in favour of `pos0`. The live in-memory tool still used the old field. Commit `1327069285c82ca298c53853023443fd01a6d1fe` fixes that one assignment and is pushed/remote-verified on the owner fork master. In this text-only caller, the next absolute position remains evaluated history length, matching the current speculative example.

A new report-only caller uses the same migration. The completed campaign's source, binaries and evidence remain unchanged.

- Fresh153-step CPU build plus report caller passes; uses current llama/common/chat/speculative code, not retained pre-merge libraries.
- Four CPU CTests pass: Q6 pair, KV handoff, plain context handoff and Gemma context handoff. Q6 OFF/ON5710floats retain exact hashc67cf188.
- Three vocabulary-only traces pass21prefix transitions and12append-mutation rejections. Token geometry matches all retained traces. No trained tensors/GPU loaded.
- Six binaries/libraries hash-verified; agenticb11ffa5e, in-memory4e8c513b, llama6737f376, commonfc788da1, CPUf2c43771, base9c6ad759. Full hashes in evidence/cpu-build-identity.sha256.
- Build peak393,322,496B; check peak130,502,656B. Swap/memory events zero;host reserve>27GiB. Quota throttling is recorded, so timings have no performance meaning.
- Test/compiler/vocabulary/container workers drained before each explicit peer release; services unchanged.

No trained MTP behaviour or complete fresh Vulkan runtime is qualified yet. The first Vulkan attempt failed during standalone CMake configuration because this fork lacks ggml.pc.in. Preserve its log/cache. A new parent-project retry uses the same pinned source and one-slot shader generation; no native launch without separate admission.
