# CPU exact-shape candidate

Read-only dispatch found Q4_0 verification width4 reaches llamafile_sgemm -> tinyBLAS_Q0_AVX. On AVX2 (16vectorregisters), mnpack case0x44 intentionally falls through4x2 gemm4xN<2>, rereading weights across the two output-column groups. AVX512 uses4x4 but is unavailable on Sigma. A4x4 accumulator tile may spill on16registers, so do not simply enable it globally.

Experiment candidates, offline native shapes first:
- 2x4 path gemmMx4<2> for Q4_0/Q8_0 width4:8accumulators like4x2 but reuses one unpacked weight row across all four query rows; changes sharing of weight/query loads, leaves per-dot arithmetic/reduction order unchanged.
- Keep original4x2 as baseline; optional4x4 only as diagnostic if assembly shows no harmful spilling. No static thread scheduling changes.
- Inputs quantizedQ4_0 weights,Q8_0 queries, actual shapes weights10240x2560 and2560x10240, querywidth4 plus1/2/3/5 tails. Compare exact outputs vs current optimized SGEMM; reference GGML tolerance separately. Verify runtime branch, codegen/instruction profile, allocatedscratch, thread placement.
- Synthetic matrix-only measurements not enough: accepted candidate needs real agentic MTP verification workloads and no end-task regressions. Baseline output/token parity diagnostic unless arithmetic explicitly bit-preserving; independent task tests remain final quality gate.

Q6_K vocab262144x4 is genericvecdot route and about1.15s diagnostic; pursue separately only after narrowQ4tile result. Quantized attentionQ8/F16 and sharedK queryreuse earlier winners/losers must not be invalidated. VulkanFFN exactshape work separate with native tests; don't conflate CPUcandidate and GPUkernel changes in one causal A/B.
