# Cross-vendor Vulkan results matrix

| Target | Driver / tier | Correctness | Prompt tok/s | Generation tok/s | Peak memory | Thermal/power | Status |
|---|---|---:|---:|---:|---:|---|---|
| RTX 3060 Vulkan | NVIDIA 580.173.02 / Tier 2 KHR cooperative matrix | 7,421/7,421 supported common-op cases | 3,070.42 | 132.81 | 1,831 MiB | 65.91 W, 60 C | Measured, accepted full offload |
| RTX 3060 CUDA | NVIDIA 580.173.02 / CUDA | fixed-model gate | 3,522.81 | 153.38 | 1,836 MiB | 62.50 W, 62 C | Measured, preferred NVIDIA backend |
| Intel Xe | unmeasured | not run | — | — | — | — | Procedure prepared; hardware unavailable |
| Mali / Immortalis | unmeasured | not run | — | — | — | — | Procedure prepared; hardware unavailable |
| Adreno / Turnip | unmeasured | not run | — | — | — | — | Procedure prepared; hardware unavailable |

Settings for measured throughput: same source/model, Gemma4 E2B Q4_0, full
offload, 6 CPU threads, 128 prompt tokens, 32 generated tokens, one bounded
repetition. CUDA is 14.7% faster for prompt and 15.5% faster for generation on
the RTX 3060. Vulkan remains the portable backend candidate.

Vulkan 4K and 32K contexts both started and served requests. Peak memory was
1,799 MiB and 1,981 MiB respectively. Partial offload is rejected for this model
because it triggers `GGML_SCHED_MAX_SPLIT_INPUTS`, not because of OOM.

No values are extrapolated to untested vendors.
