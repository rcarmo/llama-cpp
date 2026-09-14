# Portable implementation shape

Promote the measured pair helper as an internal `ggml-cpu/q6-pair.h/.cpp` component, compiled per CPU backend variant. AVX2+FMA builds expose capability; other builds keep scalar two-dot fallback and report capability false. No public API change. Preserve the measured arithmetic first; inline fp16 conversion is a separate experiment.

The CPU chunk dispatcher remains opt-in (`GGML_CPU_Q6_PAIR=1`, read once at CPU init). Selection requires capability, Q6_K/Q8_K, width4, rank2, contiguous weights/output, ordinary precision, and non-reference mode. Other paths retain the original loop. Column-chunk tails call the original single-column dot product.

Repository regression: public GGML graph off/on subprocess comparisons, actual conversion and original reference, widths1-5 plus odd/small rows, direct Q8_K and strided F32 query, higher-rank broadcast, padded weights, explicit F32 precision, and multiple threads. Record dispatch proof for the selected case separately. Compile helper with and without AVX2/FMA; scalar build must contain no vector-only dependency.

Changes stay on an implementation branch until the full task is verified. Existing experimental evidence commits are already on master; no rewrite of those commits. Final branch merge and charts occur after Vulkan and combined verification, as requested. No deployment.
