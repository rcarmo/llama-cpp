# Vulkan deployment and rollback

Last validated: 2026-07-30 on NVIDIA driver 580.173.02. Refresh bounded
baselines after material compiler, driver, backend, or model changes.

## Build

Source the workspace-local toolchain and choose a profile. On another checkout,
set `VULKAN_LOCAL_PREFIX`; when system `glslc`/SPIR-V packages are installed,
you may skip the helper entirely:

```bash
source tools/vulkan-toolchain-env.sh
tools/vulkan-build-profiles.sh release build
# focused diagnostics only
tools/vulkan-build-profiles.sh validation build
# expensive same-commit CUDA comparison
tools/vulkan-build-profiles.sh multi build
```

Builds default to two jobs. The CUDA+Vulkan profile is expensive; avoid routine
rebuilds. It discovers `nvcc` from `CUDACXX` or `PATH` and fails cleanly when no
CUDA compiler is available.

## Select hardware explicitly

```bash
tools/vulkan-require-device.sh build-vulkan-release 0 'EXPECTED GPU NAME'
GGML_VK_VISIBLE_DEVICES=0 ./build-vulkan-release/bin/llama-server \
  --device Vulkan0 ...
```

Never accept llvmpipe/lavapipe. Note that invalid visible-device indices may
make llama tools exit zero with `(none)`; use the guard script.

## Profiling and telemetry

`tools/run-gpu-telemetry.sh` samples at 0.25-second intervals and reports peak
memory, utilization, power, and temperature. It is NVIDIA-only and fails
explicitly when `nvidia-smi` is unavailable; Intel/ARM targets need their native
telemetry or manual capture.

`GGML_VK_PERF_LOGGER=1` emits `Vulkan Timings:` blocks. Parse them with:

```bash
tools/vulkan-parse-perf-log.py --prompt-size 128 PERF_LOG
```

The prompt/decode classification is a benchmark-specific N-dimension heuristic;
pass `--prompt-size 0` when classification is not meaningful.

## Debugging

Useful variables:

```text
GGML_VK_PERF_LOGGER=1
GGML_VK_PERF_LOGGER_FREQUENCY=1
GGML_VK_DEBUG_MARKERS=1
GGML_VK_DISABLE_COOPMAT=1
GGML_VK_DISABLE_INTEGER_DOT_PRODUCT=1
GGML_VK_FORCE_MAX_ALLOCATION_SIZE=...
GGML_VK_FORCE_MAX_BUFFER_SIZE=...
```

Use validation/result-checking builds only for focused tests; they are slower.

## Known limitations

- Partial Gemma4 offload can exceed the scheduler's fixed split-input capacity
  (`GGML_SCHED_MAX_SPLIT_INPUTS`) when many host/device boundaries feed one
  split. Use full Vulkan offload for the measured E2B model or reduce model/
  partition complexity; this failure is not OOM.
- Support gaps are shape/type-specific, especially MUL_MAT, FLASH_ATTN_EXT, and
  CPY; check logs for fallback/synchronization.
- Extension presence does not imply accelerated integer dot. Use the backend-
  qualified startup flag/tier.
- Unified-memory heaps on Intel/ARM are not dedicated VRAM.
- First requests may include shader/pipeline compilation and are not steady-
  state benchmarks.

## Coexistence and rollback

CUDA and Vulkan can be built together and selected with `--device`. On NVIDIA,
keep CUDA as the production default. Vulkan services should use separate ports
and must not replace the existing CUDA service until correctness and sustained
performance are accepted.

Rollback is operational: stop the Vulkan process and resume the unchanged CUDA
service or CPU profile. The rejected deeper matvec-unroll experiment was reverted;
the default shader unroll remains 4.
