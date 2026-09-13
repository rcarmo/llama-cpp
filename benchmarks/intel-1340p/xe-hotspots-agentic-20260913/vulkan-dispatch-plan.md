# Vulkan FFN dispatch: next evidence gap

The retained p0 profile reports 6,663,722us across 1,260 Q4_0 operations of m=10240,n=256,k=2560 and 3,609,165us across 630 operations of m=2560,n=256,k=10240. These are operation/shape labels, not exact shader-pipeline identities. Do not describe them as measured named shaders.

Device log: Intel Iris Xe RPL-P, subgroup32, 49,152-byte shared memory, integer dot enabled, no matrix cores. Source `ggml-vulkan.cpp`:

- `ggml_vk_mul_mat_q_f16` tries Q8_1 query quantisation when integer dot, contiguous F32 input and size alignment allow it. If that pipeline is unavailable, it falls back to F16/F32 dequant matmul.
- `ggml_vk_guess_matmul_pipeline` uses small tiles for m/n<=32, medium for <=64, otherwise large when available. Availability differs between integer-dot and floating paths.
- `ggml_vk_guess_split_k` uses shader-core count and workgroup grid occupancy for k>=2048, then limits/aligns splits. Shape labels alone do not establish the actual split.
- Non-coopmat large integer MMQ defaults to 128-thread/128x128 tiles; shared-memory constraints can disable those variants. Exact loaded pipeline must be recorded before changing tiling.

Next diagnostic-only change: log effective input quantisation type, selected pipeline name, workgroup denominators, split_k, alignment and dispatch dimensions for the two measured FFN shapes. Aggregate once per shape rather than per operation. Preserve the original plugin, keep profiling separate from timing, and require a short explicitly admitted synthetic GPU test before trained profiling.

Candidate selection follows that evidence. No broad shader rebuild or tile changes yet. Any small repeatable stage gain stays in the opportunity register and is measured in combination after native numerical and workload tests.
