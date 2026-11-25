# Bonsai PTQ1 integer dot on Sigma's Iris Xe

The port makes single-column PTQ1 matrix multiplication 10.78-11.40x faster than the existing Vulkan dequant path on Sigma. Five synthetic Bonsai shapes improved 4.31-11.40x. Model generation, model quality and service performance have not been measured with this port.

## Physical Iris Xe results

| Output rows x input columns x inner dimension | Existing Vulkan path, ms | Integer dot, ms | Speedup |
|---|---:|---:|---:|
| 17408 x 1 x 5120 | 6.947 | 0.644 | 10.78x |
| 17408 x 2 x 5120 | 11.455 | 1.492 | 7.68x |
| 17408 x 4 x 5120 | 11.563 | 2.684 | 4.31x |
| 17408 x 8 x 5120 | 63.310 | 6.375 | 9.93x |
| 5120 x 1 x 17408 | 7.265 | 0.638 | 11.40x |

24 November 2026, i5-1340P, Raptor Lake-P Iris Xe (`8086:a7a0`), Mesa ANV/i915. Deterministic semantic graph replay, A1/B1/B2/A2, fresh process per arm, same binary and shape order. A omits the PTQ1 opt-in; B sets `GGML_VK_INTEL_PTQ1_MMVQ=1`. The numbers are medians of two observations per path after warmup. Pipeline diagnostics were disabled for timing. Repeating one projection differs from streaming the full model. This benchmark does not include attention, the recurrent state, sampling, cache reuse, tool calls or a CPU baseline.

The linked backend and CPU regression built under 4 GiB/no-swap/2 CPUs. The existing x86 suite passed, including 2,555,904 exact raw basis checks and 384 raw random dots. Physical Vulkan operator tests passed 34/34 supported cases each with the flag off, on, and overridden by `GGML_VK_DISABLE_MMVQ`. Unsupported layouts were excluded by the existing test runner; the deliberately non-contiguous test was among them. Separate diagnostic logs confirm four PTQ1 signed-dot pipeline specialisations were requested only with the flag on. The three compiled reduction variants contain `OpSDot`. Peak cgroup charge for the operator test and timing was 0.854 GB and 1.041 GB respectively, with zero swap/OOM. Sensor snapshots at arm completion were 60-68 C; there was no continuous thermal trace.

## Source and chipset limits

The experiment uses base `d7edd02b738863fac727ded639530d453064d82a`, the previously verified CPU register decoder, and Prism's dense PTQ1 shader from `910442b0ce1128ef85d7730cbcae835cce60cdd4` (`3ae4f51087d8`, `46d253262e82`; Intel precedent `924a8ef58f`). It wires the shader into our generated arrays and x4 Q8_1 activation layout. The opt-in is limited to Intel integrated GPUs with accelerated signed integer dot, contiguous inputs and the existing activation precision gate. The original float-input path remains the default. No indexed matvec or bulk prefill kernel was added. The primary checkout and running Inkling container were unchanged.

- CPU: four SMT P-cores, eight E-cores, AVX2, AVX-VNNI, FMA and F16C. No AVX-512 or AMX. Stock repacking has no PTQ1 layout. Next CPU tests are explicit worker placement, reuse of integer activation sums across weight rows, and tiled reuse across prompt columns, with the original FP accumulation order retained. Affinity must be verified on actual workers.
- iGPU: unified memory, FP16, and signed packed integer dot are usable. The current device exposes no cooperative matrix engines. Workgroup/subgroup size and rows per group, bulk prefill, host-visible allocation vs device-preferred allocation, and CPU/GPU overlap remain separate experiments. CPU and GPU share bandwidth and package power; keep full-device and hybrid measurements distinct.
- Memory and power: retained STREAM-style measurements were about 52-58 GB/s depending on worker placement and operation. That is a reference for bandwidth analysis, not a model rate. GPU clock, package temperature and throttle counters can be sampled. Memory PMU event definitions exist but access is unverified; unprivileged RAPL reads are denied. No power, governor or BIOS settings were changed.
- Other backends: OpenCL, SYCL/Level Zero and OpenVINO have no installed, qualified PTQ1 route on this machine. Past OpenCL/SYCL trials on other quants do not qualify Bonsai. No discrete GPU or NPU is exposed. No driver change or model download was made.

## Native gate

In an approved maintenance window, compare serial fresh runs of the retained CPU candidate, the new full-GPU path and, if informative, its disabled control. Use identical in-model teacher-forced 512+64 and then 2048+64 inputs. Check all logits for finiteness, compare repeated same-placement results and confirm actual shader dispatch. Keep the CPU path if GPU stability fails or if latency loses. Then compare Bonsai and Inkling on the same cold and warm text/tool work with independently checked outputs and exact Inkling restoration. Do not compare this synthetic kernel ratio with the 2.194 tok/s Bonsai CPU rate or Inkling's approximately 7.7 tok/s rate.

See [operator timings](vulkan-matvec.csv), the [synthetic shape fixture](ptq1-shapes.txt) and the [native replay report](README.md). The first build stopped after a review found missing generated declarations. The first timing invocation selected zero fixtures and produced no measurements.
