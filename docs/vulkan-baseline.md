# Vulkan baseline contract

Baseline source commit: `87511aa7490469587ba8f53dd11532bb13c5aa5a`

## Development host

- GPU: NVIDIA GeForce RTX 3060, 12 GiB
- NVIDIA driver: 580.173.02
- Vulkan API: 1.4.312
- subgroup size: 32
- shader FP16/int8: yes
- shader integer dot product: yes
- KHR cooperative matrix: yes
- NVIDIA cooperative matrix2: yes
- 8/16-bit storage: yes

At snapshot time the host load was 0.61 / 0.54 / 0.54. The live CUDA Gemma4
server remained running and idle; total GPU allocation reported by `nvidia-smi`
was 428 MiB, utilization 0%, power 14.19 W, temperature 52 C.

Raw capability output is retained as
`/workspace/tmp/vulkan-baseline-capabilities.txt`.

## Software ICD rejection

The loader also exposes `llvmpipe (LLVM 20.1.2, 256 bits)` as device 1. Every
Vulkan test must:

1. enumerate devices;
2. require the selected name not to contain `llvmpipe`, `lavapipe`, or
   `software`;
3. pin the RTX 3060 using `GGML_VK_VISIBLE_DEVICES=0` and `--device Vulkan0`.

A run that selects a software ICD is invalid, not a CPU fallback result.

## Fixed model and benchmark parameters

Model:

```text
/workspace/models/gguf-misc/gemma-4-E2B-it-qat-UD-Q4_K_XL.gguf
```

The model is about 2.5 GiB, small enough for full offload while leaving room for
KV and backend allocations.

Bounded command pattern:

```bash
GGML_VK_VISIBLE_DEVICES=0 ./build-vulkan/bin/llama-bench \
  --device Vulkan0 \
  -m /workspace/models/gguf-misc/gemma-4-E2B-it-qat-UD-Q4_K_XL.gguf \
  -ngl 999 -t 6 -p 128 -n 32 -r 1 -o json
```

Additional matrix dimensions:

- context: 4K and 32K for server smoke tests;
- offload: CPU (`-ngl 0`), partial, and all layers that fit;
- batch/ubatch: identical across CPU/CUDA/Vulkan comparisons;
- one bounded repetition unless a suspicious result requires one low-load
  verification run.

## Existing comparison points

Bounded CPU evidence at the same model/settings family is in
`docs/simd-baseline.md`. The live CUDA binary reports version 188 / commit
`2af348225`; Vulkan comparisons must use a same-source-commit CUDA build before
making backend claims. Existing service metrics were zero at snapshot time, so
no historical CUDA throughput value is inferred from the idle service.

## Load and coexistence rules

- Keep the CUDA service running and do not change port 8090 or its model.
- Build with at most two jobs.
- Serialize GPU benchmarks.
- Record start/end host load, `nvidia-smi` memory/utilization/power/temperature,
  wall time, backend logs, selected device, and unsupported-op/fallback warnings.
- Defer tests when unrelated GPU compute is active or when one-minute CPU load
  exceeds the configured threshold.

## Workspace-local build toolchain

No system packages were changed. Debian packages were downloaded and extracted
to `/workspace/.local/vulkan-toolchain`; source
`tools/vulkan-toolchain-env.sh` before configuring.

Recorded versions:

- glslc/shaderc: 2023.8-1build1
- bundled glslang: 14.0.0-2
- glslc SPIR-V Tools: 2023.6~rc1-2
- standalone SPIR-V Tools: 2025.1
- vulkaninfo/loader headers: 1.3.275
- NVIDIA Vulkan driver: 580.173.02, device API 1.4.312

`vulkaninfo --summary` lists RTX 3060 as GPU0 and llvmpipe as GPU1. Device pinning
and software-ICD rejection remain mandatory.

## Vulkan build profiles

`tools/vulkan-build-profiles.sh` defines Release, validation/result-checking,
and CUDA+Vulkan multi-backend configurations. Release was built with one job
after exposing workspace-local SPIR-V headers; it completed in 410 seconds and
raised one-minute load from 0.99 to 1.68. The live CUDA service remained on its
original PID/configuration. Validation and multi profiles are configured and
reserved for focused use rather than built eagerly, to limit CPU/energy cost.

## Device enumeration findings

The built backend exposes only `Vulkan0: NVIDIA GeForce RTX 3060`; llvmpipe is
filtered from llama.cpp enumeration. Invalid `GGML_VK_VISIBLE_DEVICES` values
still make `llama-bench --list-devices` exit 0 with `(none)`, so
`tools/vulkan-require-device.sh` adds the required fail-closed output check.

llama.cpp reports `int dot: 0` on this RTX 3060 even though the raw feature bit
and extension are present. The backend additionally requires
`integerDotProduct4x8BitPackedSignedAccelerated`; this driver/device does not
report that acceleration property. Capability tiers must therefore use the
backend-qualified acceleration flag, not extension presence alone.

## Correctness and fixed-model smoke

A bounded common-op suite on Vulkan0 tested MUL_MAT, MUL_MAT_ID,
FLASH_ATTN_EXT, RMS_NORM, ROPE, SOFT_MAX, and CPY with one worker:

- supported cases passed: 7,421 / 7,421
- correctness mismatches: 0
- unsupported parameter cases: 1,152
  - MUL_MAT: 504
  - FLASH_ATTN_EXT: 340
  - CPY: 308

Unsupported cases are explicit rather than silent correctness failures, but a
model can still incur CPU fallback/synchronization when it uses one of those
shape/type combinations.

The fixed Gemma4 E2B Q4_0 model loaded and ran with full Vulkan offload. One
bounded sample measured 3,049.73 prompt tok/s and 131.35 generation tok/s. The
run took 7 seconds. Start/end telemetry was 428 MiB idle allocation, 14.77/57 W,
54/57 C; point snapshots missed peak benchmark VRAM, so subsequent performance
runs use an interval sampler.

## Bounded RTX 3060 performance baseline

All runs use the same Vulkan Release build and Gemma4 E2B Q4_0 model.

| Mode | Prompt tok/s | Generation tok/s | Peak VRAM | Peak GPU | Peak power | Peak temp |
|---|---:|---:|---:|---:|---:|---:|
| CPU control (`-ngl 0`) | 44.11 | 9.59 | 439 MiB | 3% | 41.88 W | 54 C |
| Partial (`-ngl 20`) | aborted | aborted | 1,342 MiB | 0% | 41.96 W | 54 C |
| Full Vulkan (`-ngl 999`) | 3,070.42 | 132.81 | 1,831 MiB | 96% | 65.91 W | 60 C |

Partial offload aborts in `GGML_SCHED_MAX_SPLIT_INPUTS`; it is a scheduler
partitioning limitation for this Gemma4 graph, not an OOM condition. Full
offload is the valid Vulkan mode for this model on the RTX 3060.

Short-lived server smoke tests also succeeded:

| Context | Prompt tok/s | Generation tok/s | Peak VRAM | Peak power | Peak temp |
|---:|---:|---:|---:|---:|---:|
| 4K | 18.48 | 51.02 | 1,799 MiB | 42.58 W | 53 C |
| 32K | 346.02 | 126.39 | 1,981 MiB | 64.00 W | 57 C |

The 4K request includes first-use shader/pipeline compilation and is not
comparable as steady-state throughput. The 32K request reused the compiled
pipeline. Both contexts are viable; the useful result is memory/stability, not
a claim that 32K is intrinsically faster than 4K.

## Same-commit CUDA versus Vulkan

A CUDA+Vulkan multi-backend build at the same source revision used identical
model and benchmark settings.

| Backend | Prompt tok/s | Generation tok/s | Peak VRAM | Peak GPU | Peak power | Peak temp |
|---|---:|---:|---:|---:|---:|---:|
| Vulkan0 | 3,070.42 | 132.81 | 1,831 MiB | 96% | 65.91 W | 60 C |
| CUDA0 | 3,522.81 | 153.38 | 1,836 MiB | 98% | 62.50 W | 62 C |

CUDA is 14.7% faster for prompt processing and 15.5% faster for generation,
with essentially identical memory use and power. CUDA remains the preferred
NVIDIA backend. Vulkan is nevertheless viable and fast enough to serve as the
portable Intel/ARM path.

The multi-backend build itself took 1,823 seconds (30.4 minutes) with one build
job, so it should not be rebuilt routinely.

## Pipeline profile

`GGML_VK_PERF_LOGGER=1` shows two distinct regimes:

- prompt passes: about 46–47.5 ms, dominated by large q4_0 MUL_MAT cooperative-
  matrix kernels plus FLASH_ATTN_EXT;
- decode passes: about 8.9 ms, dominated by q4_0 MUL_MAT_VEC (~1.65 ms for the
  largest sampled kernel) and fused RMS_NORM_MUL (~0.9 ms).

The first portable Tunney-style target should therefore be q4_0 matvec/decode,
not prompt GEMM: prompt already reaches roughly 21.5 TFLOP/s in sampled q4_0
cooperative-matrix kernels, while decode remains latency-bound by matvec and
normalization. Copy operations are a support/fallback concern but were not a
leading steady-state timing cost in this profile.

The corrected parser found 35 timing blocks. Prompt blocks are 46–47.5 ms and
spend about 81% in MUL_MAT. Decode blocks are roughly 8.9–9.1 ms and spend
about 56–65% in MUL_MAT_VEC; RMS_NORM_MUL is the next visible cost. This makes
quantized matvec the portable latency target and prompt cooperative-matrix GEMM
a lower-priority target. Full-model logs showed no steady-state fallback
warnings; unsupported cases remain shape/type-specific correctness inventory.

## Tunney-style unroll experiment result

An isolated compile-time q4 matvec K-loop unroll experiment increased the
existing factor from 4 to 8. It passed 15/15 supported q4_0 n=1 correctness
cases, but bounded end-to-end results rejected it:

- prompt: 3,070.42 -> 3,070.81 tok/s (+0.01%, noise)
- generation: 132.81 -> 128.45 tok/s (-3.28%)
- peak VRAM: unchanged at 1,831 MiB
- peak power: 65.91 -> 70.94 W

The likely cause is higher register pressure/instruction footprint outweighing
additional loop-level parallelism. The experiment was reverted; the default
4-way unroll remains. This demonstrates that CPU-style deeper unrolling does
not transfer automatically to Vulkan shaders.
