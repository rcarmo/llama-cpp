# Hardware navigation

**Sigma status, 25 November 2026:** Inkling 2 Mini is the active CPU service. Bonsai 2.5 PTQ1 is experimental and undeployed. See [current operating status](../intel-i5-1340p/sigma-model-serving.md) and [Bonsai 2.5 CPU/Iris Xe evidence](../../../benchmarks/intel-1340p/bonsai25-ptq1-20261125/README.md).

The local work spans three main machines plus a few cross-cutting notes that apply to more than one backend. Start with the machine, then drill into reports and raw evidence.

## Platforms

* [SpaceMIT K3](../spacemit-k3/README.md) -- RISC-V build notes, dense fallback experiments, K3 matmul reports and later compact-IQ follow-ups.
* [LattePanda Sigma / Intel Core i5-1340P](../intel-i5-1340p/README.md) -- Inkling CPU operations, Bonsai 2.5 PTQ1 research, historical Gemma zero-copy work, and retained Huihui and Bonsai PQ2 profiles, and dated Qwen, Ornith, Gemma, Maple and Intel Xe evidence on `sigma`.
* [RTX 3060 12 GB](../rtx3060/README.md) -- Qwen3.6 service tuning, CUDA graph recovery, Qwen3.8 dense experiments and the latest GSQ report.
* [Cross-platform notes](../cross-platform/README.md) -- async scheduling, SIMD, Vulkan, shared VRAM staging and branch-audit material that is not tied to one host.
