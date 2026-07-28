# Vulkan cross-vendor evaluation

## Goal

Use the RTX 3060 as a development and correctness device for a portable
llama.cpp Vulkan path that can also run on Intel Xe and ARM/Qualcomm-class GPUs.
The goal is not to replace CUDA on NVIDIA where CUDA is fastest; it is to retain
one usable GPU backend across heterogeneous machines.

## Local capability check

A direct Vulkan API probe found two devices:

- NVIDIA GeForce RTX 3060: Vulkan 1.4, 12 GiB device-local memory, subgroup 32,
  shader FP16/int8, integer dot product, KHR cooperative matrix, and NVIDIA
  cooperative-matrix2.
- llvmpipe: software Vulkan, subgroup 8, no cooperative matrix.

The NVIDIA ICD is healthy and suitable for validation. Every command must set
`GGML_VK_VISIBLE_DEVICES=0` and/or `--device Vulkan0` so software llvmpipe is not
selected accidentally.

The host currently has `libvulkan-dev` and Vulkan ICDs but lacks `glslc`,
`vulkaninfo`, and packaged SPIR-V headers/tools. A source build needs at least:

```bash
sudo apt install glslc spirv-headers vulkan-tools
cmake -B build-vulkan -DGGML_VULKAN=ON
cmake --build build-vulkan --config Release -j2
```

## Backend maturity

The Vulkan backend has broad LLM coverage and specialized paths for quantized
matmul, integer dot product, cooperative matrices, flash attention, MoE
`MUL_MAT_ID`, normalization, ROPE, activations, and copies.

The checked Vulkan operation corpus contains 16,566 parameterized cases:

- supported: 13,770 (83.1%)
- unsupported: 2,796 (16.9%)

Common LLM operations with full coverage in that corpus include `MUL_MAT_ID`,
ROPE, RMSNorm, softmax, GET_ROWS, contiguous copies, add/multiply, SiLU, GELU,
and GEGLU. Important partial areas are:

- `MUL_MAT`: 1,120 / 1,408 cases (79.5%)
- `FLASH_ATTN_EXT`: 4,757 / 5,097 (93.3%)
- `CPY`: 254 / 541 (47.0%)

Unsupported shapes/types can cause CPU fallback and synchronization overhead.
Therefore “model loads” is not sufficient acceptance; per-op offload and
end-to-end throughput must be checked.

## Portable feature tiers

### Tier 0: compatibility

Required target properties:

- working Vulkan compute ICD
- storage buffers and 8/16-bit storage
- subgroup operations
- enough device-local or shared GPU-visible memory for useful layer offload

Use generic shaders, FP32 where FP16 is unreliable, and no cooperative-matrix
assumptions. This is the likely safety tier for older Mali/Adreno devices.

### Tier 1: practical quant inference

Add:

- shader FP16 and int8
- `VK_KHR_shader_integer_dot_product` or Vulkan 1.3 equivalent
- reliable subgroup size/control

This tier enables the important quantized matvec/matmul integer-dot paths. It is
the minimum target for a competitive Intel Xe or modern mobile GPU deployment.

### Tier 2: accelerated matrix/attention

Add:

- `VK_KHR_cooperative_matrix`, or a well-supported vendor equivalent
- enough shared memory and stable driver behavior for cooperative matmul/flash
  attention shaders

The RTX 3060 probe satisfies this tier. Modern Intel Xe may satisfy some or all
of it depending on driver generation. ARM/Qualcomm support varies substantially
by GPU and Mesa/vendor driver.

### Tier 3: vendor-enhanced

Examples include NVIDIA cooperative-matrix2/decode-vector paths and backend
vendor-specific tuning. These improve the development GPU but must remain
optional; portable shaders cannot depend on them.

## Vendor expectations

### NVIDIA RTX 3060

- Excellent correctness and shader-development target.
- Full 12 GiB VRAM and subgroup 32.
- Integer dot and cooperative matrix available.
- CUDA will probably remain faster and more mature on this specific GPU.
- Vulkan is valuable as the portability reference, not necessarily the default
  production backend on NVIDIA.

### Intel Xe / Arc / integrated Xe

- Strong candidate for Vulkan: Intel vendor-specific handling exists in the
  backend, including driver/workgroup/async workarounds.
- Expected to benefit from FP16, integer dot, and cooperative matrix where the
  installed Mesa/Intel driver exposes them.
- Integrated Xe has shared system memory: avoid treating reported heap size as
  dedicated VRAM, cap allocations, and test partial offload versus full offload.
- Driver version matters as much as hardware; Windows and Linux paths need
  separate qualification.

### ARM Mali

- Vulkan availability ranges from older vendor drivers to Mesa PanVK.
- Likely to rely more often on generic subgroup/FP16 shaders than cooperative
  matrices.
- Unified memory reduces explicit copy cost but bandwidth and thermal limits
  dominate sustained token generation.
- Start with small contexts, partial layer offload, and conservative allocation
  sizes; treat cooperative matrix as optional.

### Qualcomm Adreno

- Modern Adreno devices often expose strong FP16 and subgroup support, but
  extension/driver quality varies between Android vendor stacks and Mesa
  Turnip.
- Integer dot availability should be probed, not assumed.
- Use Android thermal and sustained-performance controls when benchmarking.
- The backend has Qualcomm driver recognition but much less explicit tuning than
  NVIDIA/AMD/Intel, so generic shader performance needs real-device validation.

### Other ARM GPUs

PowerVR, Immortalis, and vendor NPUs presented through nonstandard stacks should
start at Tier 0. Vulkan compute support alone does not imply efficient quantized
LLM inference.

## Device selection and safety

Always enumerate first:

```bash
./llama-bench --list-devices
```

Then pin the Vulkan device:

```bash
GGML_VK_VISIBLE_DEVICES=0 ./llama-bench --device Vulkan0 ...
```

Acceptance must fail if the selected device is llvmpipe/lavapipe or another
software ICD. Record device name, vendor/device IDs, driver/API versions,
subgroup size, heap sizes, FP16/int8, integer-dot, and cooperative-matrix flags.

## Bounded benchmark matrix

Use the same small Gemma4 E2B Q4 model already used for CPU gates. Keep CUDA
server/service untouched and serialize GPU tests.

1. Build Vulkan with two jobs and record build load/time.
2. Run `--list-devices`; require RTX 3060 selection and reject llvmpipe.
3. Run backend correctness tests with Vulkan result checking in a dedicated
   debug build if practical.
4. Run one repetition each:
   - prompt 128 tokens
   - generation 32 tokens
   - contexts 4K and 32K
   - GPU layers: 0, partial, all that fit
5. Capture throughput, wall time, host load, VRAM/device heap use, and CPU
   fallback/op-support warnings.
6. Compare Vulkan with CUDA and CPU, but use the same commit/model/settings.
7. Repeat the identical command set on Intel Xe and ARM targets.

Pause or reject a backend when:

- software Vulkan is selected
- correctness differs from CPU reference beyond tolerance
- unsupported-op fallback dominates
- allocation fails or shared-memory pressure causes system instability
- sustained performance collapses thermally

## Recommendation

Proceed with a bounded RTX 3060 Vulkan build and correctness/performance smoke
test after installing the missing shader tools. Keep CUDA as the NVIDIA default.
Use Vulkan as the cross-vendor deployment path, with runtime feature tiers and
explicit device selection. Intel Xe is the strongest next validation target;
ARM/Qualcomm should follow only on real hardware with driver and thermal data.
