# Prism #165 Qwen35 SiLU-gate fusion screen

This isolated screen evaluated the CPU-portable Qwen35 part of Prism commit `00e818761` (`#165`): replacing separate `SILU` and `MUL` nodes in the recurrent output gate with `ggml_swiglu_split`.

Two fresh CPU `256+64` runs reached 1.3632 and 1.3663 generation tok/s. The matched accepted-kernel baseline reached 1.3691 and 1.3668 tok/s. The candidate median was about 0.23% slower, so it did not provide a measured decode gain and was reverted.

The remainder of Prism #165 was not adopted:

- raw GDN gate fusion requires a new cross-backend op contract and changes CPU, CUDA, Metal, SYCL, OpenCL, WebGPU and Hexagon handling;
- the published commit has no Vulkan implementation for that raw-gate contract, so applying it to the Vulkan-prefill path would violate backend portability;
- the Q/K joint-normalization rewrite is primarily a graph-node reduction and was not needed to recover prefill, which already reached 25.34-25.40 tok/s;
- the source reports about 2.6% decode gain for a 27B Metal case, not Intel CPU generation or Vulkan.

All candidate runs produced finite logits at the expected position with zero cgroup swap/OOM and automatic primary Gemma restoration. `results.tsv` contains both observations. Source evidence is Prism commit `00e8187618590ca52e6737f97d38173087458ebf` and HN review comments `49747390`, `49752113`, `49755122` and `49755246`; none claims an Intel Vulkan/CPU #165 gain.
