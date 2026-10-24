# Hardware navigation

**Sigma status,24 October2026:** ThinkingCap64k/8P-SMT is the user-authorised live service. Other Sigma deployment statements below describe historical profiles. The [dated operating status](../intel-i5-1340p/model-serving-status-20261023.md) supersedes their startup and rollback instructions; other hosts are unchanged.

The local work spans three main machines plus a few cross-cutting notes that apply to more than one backend. Start with the machine, then drill into reports and raw evidence.

## Platforms

* [SpaceMIT K3](../spacemit-k3/README.md) -- RISC-V build notes, dense fallback experiments, K3 matmul reports and later compact-IQ follow-ups.
* [LattePanda Sigma / Intel Core i5-1340P](../intel-i5-1340p/README.md) -- ThinkingCap64k operations and historical Gemma zero-copy work, static Huihui and Bonsai PQ2 profiles, pending PTQ1 work, and dated Qwen, Ornith, Gemma, Maple and Intel Xe evidence on `sigma`.
* [RTX 3060 12 GB](../rtx3060/README.md) -- Qwen3.6 service tuning, CUDA graph recovery, Qwen3.8 dense experiments and the latest GSQ report.
* [Cross-platform notes](../cross-platform/README.md) -- async scheduling, SIMD, Vulkan, shared VRAM staging and branch-audit material that is not tied to one host.
