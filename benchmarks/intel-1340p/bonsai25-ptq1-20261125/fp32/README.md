# Bonsai 2.5 PTQ1: FP32 bulk accumulation on Iris Xe

`GGML_VK_INTEL_PTQ1_F32_ACC=1` cut trained 512+64 replay time from 81.408 s to 61.545 s (-24.4%) at a 128-token microbatch. The flag selects the existing FP32 accumulator pipeline for contiguous two-dimensional PTQ1 x F32 bulk matmuls on Intel UMA devices with FP16 and without cooperative matrices. Explicit accumulator requests, matvec, indexed and oversized output-split paths are unchanged. Leave the variable unset to keep the default path. The trained Vulkan library came from `60df98bf7`; the other replay libraries came from `b944fca33`.

## Trained replay

| Median | Flag unset | Flag set |
| --- | ---: | ---: |
| Prefill | 66.631 s / 7.684 tok/s | 46.635 s / 10.979 tok/s |
| Decode | 14.714 s / 4.350 tok/s | 14.848 s / 4.310 tok/s |
| Wall time | 81.408 s | 61.545 s |

Four independent processes ran in ABBA order with profiling off, one full warmup and one measured replay each. The runs used the pinned Bonsai 2.5 27B PTQ1 MTP GGUF without MTP decoding, full Iris Xe offload, the separate `GGML_VK_INTEL_PTQ1_MMVQ=1` matvec flag, 8192 context, 512/128 batch/microbatch, F16 KV, flash attention off, and 12/16 threads on masks `0xff55/0xffff`. Use the parent [replay source](../replay.cpp) and reproduce with `FLINT_REPS=1`, `FLINT_PROMPT=512` and `FLINT_DECODE=64`. Unset `BONSAI_NO_WARMUP`, Vulkan profiling flags and graph debug flags in timing arms.

Each setting repeated its full 64-step logits hash and its first eight saved vocabulary rows exactly. The flag-off hash matched the retained GPU result. Across settings, all 64 argmaxes agreed; the distributions changed. Normalised squared logit error against the retained Bonsai CPU reference decreased in all eight sampled frames. Median error fell from 0.002133 to 0.000716. Both settings matched the reference argmax on 63/64 positions.

In a separate flag-off profile, PTQ1 matmuls accounted for 64.509 of 67.375 s (95.7%) of prefill GPU timestamps. FFN gate/up and down accounted for 44.518 s. Peak native accounting across the timing and diagnostic runs was 13.798 GB, including the model backing and driver residency; there was no swap or OOM. The exact Inkling service was restored. The FP32 replay is still 2.12x the retained 29.084 s Inkling fixed-work reference, which uses a different tokeniser. No 2048-token, practical text/tool, cache, cancellation or deployment qualification ran.

## Operator gates

| PTQ1 shape (M x N x K) | Default median | FP32 median | Default NMSE | FP32 NMSE |
| --- | ---: | ---: | ---: | ---: |
| 17408 x 128 x 5120 | 59.820 ms | 39.838 ms | 6.224e-5 | 2.672e-11 |
| 5120 x 128 x 17408 | 60.994 ms | 42.349 ms | 5.829e-2 (fail) | 6.352e-12 |

[The probe](prefill-probe.cpp) uses synthetic PTQ1 rows and a dequantised double-precision reference. The NMSE tolerance is unchanged at `5e-4`. On the original library, `BONSAI_PROBE_ACC_F32=1` explicitly requests FP32. On the candidate library, leave that variable unset and use `GGML_VK_INTEL_PTQ1_F32_ACC=1`. Compile with the repository's GGML headers and link `ggml` and `ggml-base`. A separate `GGML_VK_PIPELINE_STATS=matmul` run verified `_f16acc` default dispatch and FP32 opt-in dispatch. The candidate kept the default numerical result with the flag unset; with it set, both bulk shapes, the full-size 248320-row signed-dot head and 34/34 PTQ1 matvec cases passed.

## Rejected microbatch 512

An API-only run and an LM-head-only callback both produced zero nonzero logits at the end of prefill and four of 248,320 at the first continuation. In the callback run the Vulkan producer and API rows were bit-identical. FP32 did not restore the missing values. Adding intermediate layer and norm checkpoints made both rows dense. Since those callbacks split and synchronise graph execution, the dense result is diagnostic only.

Retrospective i915 logs reported fence expiration during all three sparse runs and at the end of one dense 512-token checkpoint run. No such warnings were recorded during the four timed 128-token arms. The warning does not identify the first failing operation or establish causality. Keep microbatch 512 disabled for this candidate.

The [packed-radix follow-up](../packed/README.md) reduces synthetic bulk matmul time further. It has no trained replay result yet.

Evidence: [native ABBA](native-abba.csv), [operator ABBA](operator-abba.csv), [native metrics](native-results.json), [checksums](evidence.sha256).
