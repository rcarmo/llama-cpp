# Four-query F16 attention tile

This patch is historical evidence for the file-mediated September CPU service. The active core source and zero-copy service environment do not contain or enable it; this file remains as a retained snapshot. A combined small-batch/ATTN4/SCORE3 transplant onto the newer branch reduced decode from 12.79 to 9.02 tok/s and was removed.

`attn4.patch` applies to retained `abdbeadfb` CPU `llamafile/sgemm.cpp`. Enable `GGML_CPU_EXPERIMENTAL_ATTN4=1` only in the pinned historical CPU worker. It selects the existing `gemm<2,4,8>` template for F16xF16 four-query attention-like shapes on AVX2/F16C/FMA, with width512 and the other axis at least32768. Reference execution is excluded; n1 and large-prefill paths are unchanged. The shape gate can match non-attention GEMMs; those workloads are not qualified.

The tile has2 output rows and4 query columns, processed in8 row blocks per job. `m%16==0`, `k%8==0`, and `n==4` give exact coverage without output tails. `BN=1` makes one query-tile group. Compared with the existing4x2 column tiling, all four queries can reuse each loaded row. This is a tile change, not a new accumulation format.

Eight native score/value reference cases (32K/64K,n1/n4) passed; traces confirm all four n4 shape families. Eight uninstrumented64K runs measured8.5536 to8.8020tok/s (+2.90%), with identical128-token output and90/110 accepted drafts. Candidate finite64K state, independent tool slot and long cached append pass. A4K prefill pair was66.653s off/66.890s on; the0.36% difference is not a performance gain or broad non-regression proof.

The historical ATTN4 release kept the small-target-batch `libllama`; this patch changed only the CPU backend. Do not combine it with the diagnostic shape profiler or negative paired-dot fallback experiment. Isolated backend SHA-256: `98c168824a2ee8e44115a3511de97ced820b1601b5d2e210fae2f589f24a12fa`. Any reuse requires an immutable release, pinned loaded-file hash and a current rollback target. Broader workloads remain unqualified.
