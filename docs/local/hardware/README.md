# Hardware navigation

The local work spans three main machines plus a few cross-cutting notes that apply to more than one backend. Start with the machine, then drill into reports and raw evidence.

## Platforms

* [SpaceMIT K3](../spacemit-k3/README.md) -- RISC-V build notes, dense fallback experiments, K3 matmul reports and later compact-IQ follow-ups.
* [LattePanda Sigma / Intel Core i5-1340P](../intel-i5-1340p/README.md) -- current Gemma zero-copy operations, static Huihui and Bonsai PQ2 profiles, pending PTQ1 work, and dated Qwen, Ornith, Gemma, Maple and Intel Xe evidence on `sigma`.
* [RTX 3060 12 GB](../rtx3060/README.md) -- Qwen3.6 service tuning, CUDA graph recovery, Qwen3.8 dense experiments and the latest GSQ report.
* [Cross-platform notes](../cross-platform/README.md) -- async scheduling, SIMD, Vulkan, shared VRAM staging and branch-audit material that is not tied to one host.
