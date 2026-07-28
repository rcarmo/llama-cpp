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
