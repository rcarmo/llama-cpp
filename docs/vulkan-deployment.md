# Vulkan deployment and rollback

## Build

Source the local toolchain and choose a profile:

```bash
source tools/vulkan-toolchain-env.sh
tools/vulkan-build-profiles.sh release build
# focused diagnostics only
tools/vulkan-build-profiles.sh validation build
# expensive same-commit CUDA comparison
tools/vulkan-build-profiles.sh multi build
```

Builds default to two jobs. The CUDA+Vulkan profile is expensive; avoid routine
rebuilds.

## Select hardware explicitly

```bash
tools/vulkan-require-device.sh build-vulkan-release 0 'EXPECTED GPU NAME'
GGML_VK_VISIBLE_DEVICES=0 ./build-vulkan-release/bin/llama-server \
  --device Vulkan0 ...
```

Never accept llvmpipe/lavapipe. Note that invalid visible-device indices may
make llama tools exit zero with `(none)`; use the guard script.

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

- Partial Gemma4 offload can hit `GGML_SCHED_MAX_SPLIT_INPUTS`.
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
