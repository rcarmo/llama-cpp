# Bounded Vulkan performance report

## Outcome

Vulkan is viable on the RTX 3060 and suitable as the portable llama.cpp backend
for future Intel Xe and ARM GPU validation. CUDA remains the NVIDIA default.

## Correctness and support

A bounded common-op test passed 7,421/7,421 supported cases with no mismatches.
1,152 parameter cases were explicitly unsupported: MUL_MAT 504,
FLASH_ATTN_EXT 340, CPY 308. Fixed-model full offload runs correctly.

## Performance

Same-commit, same-model, identical bounded settings:

| Backend | Prompt tok/s | Generation tok/s | Peak VRAM | Peak power |
|---|---:|---:|---:|---:|
| Vulkan | 3,070.42 | 132.81 | 1,831 MiB | 65.91 W |
| CUDA | 3,522.81 | 153.38 | 1,836 MiB | 62.50 W |

CUDA leads by 14.7% prompt and 15.5% generation. Vulkan is still fast enough to
justify cross-vendor deployment work.

## Profile

Prompt passes are 46–47.5 ms and approximately 81% MUL_MAT. Decode passes are
about 9 ms and 56–65% MUL_MAT_VEC; RMS_NORM_MUL is second. Sampled cooperative-
matrix prompt kernels reach about 21.5 TFLOP/s. Decode matvec latency is the
most useful portable optimization target.

## Tunney-style experiment

The generic quantized matvec shader already uses register-blocked outputs,
cached input blocks, manual 4x/2x unrolling, deferred reduction, and subgroup
variants. Increasing K-loop unroll from 4 to 8 was gated and tested:

- q4 n=1 correctness: 15/15 supported cases pass;
- prompt: +0.01% (noise);
- generation: -3.28%;
- peak power increased to 70.94 W.

The experiment was reverted. Higher register pressure/instruction footprint
outweighed added ILP. CPU-style deeper unrolling is not automatically beneficial
in Vulkan shaders.

## Capability and memory

The RTX 3060 is Tier 2: FP16 plus usable KHR cooperative matrix. The backend-
qualified accelerated integer-dot flag is false despite extension presence.
Full offload peaks near 1.8–2.0 GiB for 4K/32K context. Partial offload is
rejected because of scheduler split-input limits, not memory exhaustion.

## Cross-vendor status

Intel Xe, Mali/Immortalis, and Adreno/Turnip remain unmeasured because matching
hardware is unavailable. Capability/report tooling and exact validation criteria
are committed. No performance is extrapolated from NVIDIA.

## Resource bounds

- heavy operations were serialized with five-minute cooldowns;
- builds used one or two jobs;
- Release Vulkan build: 410 s with one job after incremental recovery;
- CUDA+Vulkan multi build: 1,823 s with one job;
- performance runs lasted seconds;
- the live CUDA service remained running and unchanged.
