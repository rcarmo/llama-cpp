# Qwen A3B steady-state copy profile

Date: 20 July 2026  
Branch baseline: `85f170a65`

Five identical 64-token native-MTP requests were run with `GGML_RISCV64_SPACEMIT_COPY_PROFILE=1`. The profiler counts only explicit RVV copies used by SpaceMIT dense and MoE TCM staging; it does not instrument the copy loop itself.

| Copy category | Calls | Bytes | Share |
|---|---:|---:|---:|
| Dense TCM-B weights | 4,783,984 | 339,151,290,368 | 95.6% |
| MoE TCM weights | 90,576 | 7,595,196,416 | 2.1% |
| MoE TCM activations | 3,008,832 | 5,488,109,568 | 1.5% |
| Dense TCM-B activations | 208,984 | 2,027,096,320 | 0.6% |
| Dense TCM-A activations | 0 | 0 | 0% |

The requests averaged 10.0214 tokens/s and accepted 230/245 drafts. Profiling overhead versus the 10.1683 tokens/s baseline was 1.4%, below the 2% noise threshold.

A steady-state `perf` sample of a 256-token request attributed 20.36% of cycles to the RVV `memcpy1d` main loop. Dense weight-panel staging therefore outranks the proposed MoE m4 kernel by measured wall-time leverage.

Next gate: measure direct/no-pack against TCM-B by exact shape. Do not remove TCM staging globally: earlier scheduler sweeps showed that it improves larger matrix cases. Apply a crossover only where copy setup costs more than the locality it buys.
