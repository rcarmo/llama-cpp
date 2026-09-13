# Promote Q6 only after trained confirmation

The report-only dispatcher is not production code. Promotion after the completed trained ABBA comparison must preserve the existing public API and default route, with an explicit experimental opt-in initially.

- Place the pair implementation in the CPU backend's existing x86 quantisation code or a small guarded helper compiled per backend variant. Do not add AVX2 instructions to non-AVX2 variants.
- Use an internal bool-return capability wrapper with scalar fallback for unsupported builds. Keep Q6 width4/rank2/layout/precision checks in the caller; preserve original conversion and chunk ownership.
- Do not change the public `nrc=1` vec_dot contract; the pair helper is a separate internal interface.
- Keep input lookup-table initialisation in CPU startup. Preserve bit-level arithmetic verified by the diagnostic, vector, full-shape and backend tests.
- Negative cases: other widths/types, FP32 precision request, noncontiguous weights/output, noncontiguous query stride, batch dimensions, odd column-chunk tail, small/odd rows and backend-reference mode. Compare exact on/off results through the same conversion path.
- Add a focused native regression target and compile with/without AVX2/FMA. Inspect CMake backend-DL/all-variants wiring before merging. A single isolated shared library build is insufficient portability evidence.
- No trace output during performance runs. A separate diagnostic proves real dispatch.

Final merge and charts wait for the complete hotspot/agentic objective, including Vulkan and combined measurements. Existing experimental evidence is already on master; qualified implementation must be reviewed and tested before any final merge claim. No service deployment is authorised.
