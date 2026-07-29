# Branch audit — 2026-07-29

Protected branches: `main`, `master`.

## Integrated and deleted

| Branch | Unique commits at audit | Decision |
|---|---:|---|
| `exp/dense-fallback-profile` | 0 | Useful benchmark documentation already in main; deleted. |
| `feature/gemma4-qat-mtp-ime2-spacemit` | 0 | Config/launch documentation already in main; deleted. |
| `merge-upstream-thecodacus-20260706` | 0 | Upstream merge and profiles already in main; deleted. |
| `perf/compact-iq-ime2-cache-20260722` | 12 | Merged compact-IQ tile cache, shared cache ceiling, evidence, and whole-token profiler; validated; deleted. |
| `perf/k3-rvv-ime2-matmul-20260719` | 0 | K3 kernels/tests/benchmarks already in main; deleted. |
| `perf/qwen-a3b-tunney-matmul-20260720` | 0 | Tunney-style kernels/tests/benchmarks already in main; deleted. |
| `perf/qwen-recurrent-20260721` | 0 | Recurrent-state prototype and report already in main; deleted. |
| `update-upstream-20260630` | 0 | Compact-IQ upstream work already in main; deleted. |

No additional non-protected remote branches remained after pruning.

## Trunk handling

`master` had no unique commits and was 134 commits behind `main`. The repository
default branch is still `master`, so it was retained for compatibility and
advanced to the consolidated `main` tip rather than deleted.

After consolidation:

```text
main   = c90afe80f9502967f426b277c0e5abfa52b45eb2
master = c90afe80f9502967f426b277c0e5abfa52b45eb2
```

## Validation

The final branch integration preserved current serialization-facing GGML type
IDs (`Q2_0=42`, TurboQuant 43–47, count 48). The focused
`test-x86-quant-dot` target built and passed after the Nanbeige/SIMD/Vulkan
merge and again after compact-IQ integration.
