# Intel FFN tile candidate

The trace confirms64x64 medium Q4_0/Q8_1 integer-dot matmul for both FFN shapes. Source `ggml-vulkan.cpp:7089` disables large matmul on all Intel devices without cooperative matrices, then copies that decision into integer-dot availability. This is a policy inherited across paths, not a measured shared-memory rejection on this device.

For Q4 integer MMQ, the existing128x128 configuration uses4*(128*20+128*36)=28,672 shared-memory bytes, below Iris Xe's49,152-byte limit. Keep the native shmem check; do not bypass it. This permits a narrow hypothesis: opt in to large integer-dot Q4 tiles only on Intel0xa7a0/no-coopmat, without enabling large FP matmul or other quant types.

Prepare one isolated plugin with `GGML_XE_Q4_LARGE=1` fixed at device initialisation. Default remains off. Set only mul_mat_l_int[Q4_0] before existing shared-memory checks; keep MUL_MAT_ID unchanged. The standard selector uses the available large tile only above medium crossover; record exact pipeline choice. Shader objects already contain specialised variants, so no shader regeneration is required.

Correctness first: both FFN shapes with CPU-reference finite/NMSE<=existing5e-4; compare off/on output error and preserve baseline. Then paired repeated GPU evaluation under identical plugin host optimisation and shader binary, no diagnostic tracing during timing. An O0 host screen can identify shader throughput, but promoted performance requires matched optimised plugin and trained initial-prefill checks.

Fix shutdown sampling by explicit caller completion protocol: after printing results and freeing all GPU/CPU owners, emit a separate marker, wait for controller close, then exit. The controller stops sampling before deliberate process exit, while deadline/cgroup remain armed. Do not ignore missing VmSwap for a live workload or retroactively clear the first probe's abort.

Final implementation requires resource/driver guards, preserved default, tests and measured combined Q6+Vulkan agentic work. No universal Intel tuning claim.
