# Retained CPU small-batch dispatch

This patch is historical evidence for the file-mediated September CPU service. The active core source and zero-copy service environment do not contain or enable it; this file remains as a retained snapshot. A combined small-batch/ATTN4/SCORE3 transplant onto the newer branch reduced decode from 12.79 to 9.02 tok/s and was removed.

`small-target-batch.patch` applies to `src/llama-context.cpp` at `abdbeadfb`, the retained CPU ABI. It is not a patch for arbitrary newer source.

Opt in with `LLAMA_EXPERIMENTAL_SMALL_TARGET_BATCH=1` at process startup. CPU-only Gemma4 target batches of at most four tokens use the decode thread count and pool; all larger batches keep the batch thread count and pool. The assistant architecture is excluded. The flag is process-static and cannot be toggled after the first call.

With decode8/prefill16, MTP3 and unchanged draft8/16, eight counterbalanced64K runs improved median generation7.3035 to8.5099tok/s (+16.52%). All generated128 tokens and accepted90/110 drafts; recall/cache passed. A single4K prefill pair was66.832s off /66.403s on; this is a non-regression check, not a claimed prefill gain. Finite64K state, independent tool slot and cached long append passed.

The scope includes small prompt/append batches, not only speculative verification. A different model, GPU placement, thread topology or MTP depth needs separate qualification. Keep FA off and the large-prefill16-thread setting.

Build the pinned source with matching headers and relink only `libllama` against the retained objects; never overwrite the production library in place. Record the mapped library hash in the hybrid release profile. The isolated measured library SHA-256 is `35289adccdf6965d3d7eb7ade2271723b1169e65772bf849c8a5431288d0aec9`.
