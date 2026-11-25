# PTQ1 packed decode for Iris Xe bulk matmul

`704514a37` cuts synthetic full-size 128-column Bonsai FFN matmul time by 23-25% on Iris Xe, on top of [FP32 accumulation](../fp32/README.md). Each eight-element PTQ1 group stays in one packing region. The shader decodes pairs from that region with a shared power-of-three factor instead of separate byte recurrences. The index and trit mappings agree for all 32,768 byte/element combinations. The patch changes no accumulator selection, scaling, graph scheduling or matvec code.

| Order | M x N x K | Previous shader | Packed decode | Time reduction |
| --- | --- | ---: | ---: | ---: |
| ABBA | 17408 x 128 x 5120 | 39.781 ms | 30.542 ms | 23.22% |
| ABBA | 5120 x 128 x 17408 | 42.380 ms | 31.938 ms | 24.64% |
| BAAB | 17408 x 128 x 5120 | 39.697 ms | 30.041 ms | 24.32% |
| BAAB | 5120 x 128 x 17408 | 42.543 ms | 32.565 ms | 23.46% |

Each process ran one warm-up and three timed dispatches per shape with profiling off. BAAB changed only `libggml-vulkan`. The complete output hashes matched the previous shader for both shapes at 128, 256 and 512 columns; each process also repeated its output bytes exactly. The unchanged `5e-4` NMSE limit passed against the dequantised double-precision reference. The candidate passed the five [bulk fixtures](../ptq1-prefill-shapes.txt) and 34/34 PTQ1 matvec cases on physical Iris Xe. The build and tests used a 4 GiB, zero-swap, two-CPU guard; no OOM or swap was observed. Inkling stayed live.

The separate FP32 geometry screen on the previous shader passed both shapes at all three widths. At equal work, 256 and 512 columns reduced time per column by 5.25% and 7.04% across the two shapes versus 128. These are isolated operators. The trained 512-token microbatch remains rejected, and the packed shader has no trained speed or task-quality result yet.

Build the [probe](probe.cpp) with `-std=c++17 -O2`, the repository's `ggml/include` and `-lggml -lggml-base`. Run it against each build's shared libraries with `GGML_VK_INTEL_PTQ1_F32_ACC=1` and argument `128`, `256` or `512`. Leave `BONSAI_PROBE_ACC_F32` and all profiling flags unset to exercise the opt-in routing and unprofiled timing. See [shader samples](samples.csv), [FP32 geometry samples](fp32-geometry.csv) and [checksums](evidence.sha256).
