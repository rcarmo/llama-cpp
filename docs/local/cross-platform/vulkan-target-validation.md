# Vulkan target validation: Intel Xe and ARM GPUs

See [Portable feature tiers](vulkan-cross-vendor-evaluation.md#portable-feature-tiers)
for Tier 0–3 requirements and [Vulkan deployment](vulkan-deployment.md) for
canonical build/device-selection commands.

No Intel Xe, Mali, Adreno, or other ARM GPU is exposed to the current host.
These targets are prepared but remain unmeasured; no performance is inferred
from the RTX 3060.

## Common capture

Provision the local Vulkan toolchain or equivalent packages, build Release
Vulkan, and run:

```bash
tools/vulkan-target-report.sh target-report.txt
./build-vulkan-release/bin/test-backend-ops test \
  -b Vulkan0 -o MUL_MAT,MUL_MAT_ID,FLASH_ATTN_EXT,RMS_NORM,ROPE,SOFT_MAX,CPY -j 1
```

Then repeat the committed bounded model commands with 4K/32K context, CPU,
partial, and full practical offload. Record selected tier, supported/unsupported
cases, throughput, heap budget/usage, host load, temperature, power, and driver
logs. Space heavy operations by at least five minutes.

## Intel Xe

Validate Linux Mesa/ANV and Windows separately. Required record:

- exact GPU/device ID and driver build;
- UMA/dedicated status and Vulkan heap budget, not just heap size;
- subgroup size/control, FP16/int8, backend-qualified accelerated integer dot,
  KHR cooperative matrix;
- runtime tier and shader path;
- full versus partial offload stability.

Use generic shaders first. Add Intel-specific tuning only when a supported,
correct generic path is measurably slower. Existing backend Intel workarounds
for async execution and workgroup behavior must remain intact.

## Mali / Immortalis

Test vendor driver and PanVK separately when possible. Begin at Tier 0 generic,
small context, and partial offload. Cooperative matrix and integer dot are
optional. Record unified-memory pressure and sustained thermal behavior; reject
a configuration that destabilizes system memory even if Vulkan reports a large
heap.

## Adreno / Turnip

Test Android vendor Vulkan and Mesa Turnip separately. Capture Android sustained
performance/thermal mode. Probe accelerated integer dot rather than assuming it
from extension presence. Begin with generic FP16/subgroup shaders, then compare
integer-dot paths if backend-qualified.

## Acceptance

A target is accepted only when:

- hardware Vulkan is selected, never llvmpipe/lavapipe;
- focused supported-op correctness passes without mismatch;
- fixed-model output is valid;
- no dominant CPU fallback or scheduler assertion occurs;
- memory/thermal behavior is stable for repeated short requests;
- performance is reported only for that exact device/driver.

Power and thermal capture is platform-specific. `tools/run-gpu-telemetry.sh` is
NVIDIA-only; Intel Xe and ARM targets must record a native telemetry source or
mark those fields unavailable rather than substituting NVIDIA tooling.
