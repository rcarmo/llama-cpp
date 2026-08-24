# Qwen3.6 35B-A3B Vulkan MTP and exact-row results

The tested exact-row kernels and deferred MTP catch-up did not meet the 2% promotion gate. Both source prototypes were archived and reverted. The retained source changes add opt-in timing and focused backend fixtures only.

## Test system

- CPU: Intel Core i5-1340P
- GPU: Intel Iris Xe Graphics (RPL-P), Mesa Vulkan, integer dot support
- RAM: 31 GiB plus 8 GiB swap
- Models:
  - `Qwen3.6-35B-A3B-UD-Q2_K_XL.gguf`, 12,574,128,416 bytes
  - `Qwen3.6-35B-A3B-UD-Q4_K_XL.gguf`, 22,853,663,008 bytes
- Build: GCC release build with CPU and Vulkan backends
- Model workers: 8 threads on logical CPUs 0-7
- Server process mask: logical CPUs 0-15
- Vulkan device: `Vulkan0`, selected with `GGML_VK_VISIBLE_DEVICES=0`
- Server: one slot, 8192-token context, batch 512, ubatch 128, q8_0 KV cache, flash attention enabled

## Generic Vulkan correctness

`deferred-catchup/backend-correctness.csv` contains 48 successful `MUL_MAT` cases:

- weights: Q2_K and Q4_K;
- output widths: 2048, 5120 and 11008;
- input widths: 2048 and 5120;
- rows: N=1, N=2, N=3 and N=4.

All 48 rows report `supported=1`. N=1 and N=3 cover odd-row fallback. N=2 and N=4 cover the multi-row paths. The source was rebuilt after both rejected prototypes were removed.

The early `baseline/q2-d0` attempt is invalid: it hit a server assertion followed by Vulkan device loss. It is retained as failure evidence and excluded from all performance results. Later target-only and MTP runs completed without device loss.

## MTP depth sweep

These are one-run smoke measurements for the 210-token `implementation-debug` prompt and 320 generated tokens. Prompt time is a TTFT proxy; the client did not stream, so first-byte TTFT was not measured.

| Quant | Mode | Prompt ms | Prompt tok/s | Generation tok/s | Draft accepted | Acceptance |
|---|---:|---:|---:|---:|---:|---:|
| Q2_K_XL | target only | 22,040.688 | 9.528 | 2.598 | - | - |
| Q2_K_XL | MTP depth 1 | 22,473.263 | 9.344 | 3.728 | 139/179 | 77.7% |
| Q2_K_XL | MTP depth 2 | 22,061.554 | 9.519 | 5.681 | 200/235 | 85.1% |
| Q2_K_XL | MTP depth 3 | 21,952.365 | 9.566 | 6.022 | 225/279 | 80.6% |
| Q4_K_XL | target only, cached mean of runs 2-3 | 165.341 | 24.192 | 12.391 | - | - |
| Q4_K_XL | MTP depth 1 | 19,218.153 | 10.927 | 6.374 | 152/167 | 91.0% |
| Q4_K_XL | MTP depth 2 | 18,287.231 | 11.483 | 7.942 | 200/235 | 85.1% |
| Q4_K_XL | MTP depth 3 | 18,576.236 | 11.305 | 8.927 | 229/267 | 85.8% |

The Q4 target-only rows use a short cached prompt and are not directly comparable with the 210-token depth sweep. The earlier CPU-oriented Q4 MTP draft-1 profile reached 14.946 tok/s on the short prompt. These figures document separate operating points rather than a single controlled depth comparison.

Model file size leaves about 8.2 GiB for Q4 and 18.5 GiB for Q2 before runtime allocations on a 31 GiB host. The measured A/B runs recorded 29 GiB available before model load and returned to about 29 GiB after exit. They did not sample peak RSS at high frequency.

## Exact-row Q2_K prototype

The Q2_K source-order prototype passed backend correctness and improved the two N=4, K=5120 microbenchmarks by 5.9% and 9.8%. N=2 was neutral and N=3 often regressed by 1-4%.

The end-to-end agentic A/B did not reproduce a stable gain: one case regressed 2.8% and another improved 0.7%, with unchanged acceptance. The patch is stored under `rejected-q2-exact-row-v1/` and is not present in production source.

## Exact-row Q4_K prototype

The Q4_K N=4 prototype passed all six Qwen projection correctness cases. The paired microbenchmark geometric mean was -0.140%; K=5120 cases regressed by 0.5-1.1%. It failed before an end-to-end A/B was warranted.

The patch is stored as `q4-exact-row-rejected.patch` and under `rejected-q4-exact-row-v1/`. The generic Vulkan pipeline is the only source path left.

## Deferred MTP catch-up prototype

The prototype delayed draft-context decoding until sampling exposed the accepted prefix. It committed the sampled token plus accepted draft rows and skipped rejected rows.

The activated Q2 depth-3 A/B used two deterministic 128-token repetitions. Output hashes, 114 drafted tokens and 88 accepted tokens matched the baseline in both repetitions.

| Repetition | Generation speedup | Wall speedup |
|---:|---:|---:|
| 1 | +3.323% | +1.317% |
| 2 | -9.003% | -8.254% |
| Geometric mean | -3.036% | -3.587% |

The profile reduced total draft catch-up from 3,606 ms to 621 ms across the run, but deferred commit and synchronisation variability erased the saving. The patch is stored as `deferred-catchup/rejected-deferred-catchup-v1.patch` and is not present in production source.

## Rollback, context and fallback status

- Deterministic output and acceptance matched for the deferred-catch-up off/on A/B.
- Partial draft acceptance ran repeatedly at depths 1-3 on Q2 and Q4 without KV or recurrent-state failure.
- The server checkpoint-restore branch was instrumented, but these one-slot runs used removable KV paths and did not force a full checkpoint restore.
- Context size 8192 loaded and completed long generations of 320-384 tokens. Near-capacity context fill was not tested.
- Generic Vulkan fallback passed all 48 Q2/Q4 row and shape fixtures after prototype reversion.
- The invalid early device-loss run is excluded; successful later Vulkan runs prove recovery through process restart, not in-process device-loss recovery.

## E-core placement

The profiled server had 28 threads. Every helper thread inherited affinity 0-15, while GGML model workers were separately constrained to 0-7. The available thread names did not expose a stable MTP bookkeeping or sampling role. Pinning a transient TID could move target decode or Vulkan submission work and would not survive thread recreation.

No E-core pin was applied. A safe implementation needs a source-level worker role or dedicated executor before affinity can be bounded to CPUs 8-15.

## Retained changes and delivery

Retained source changes:

- `common/speculative.cpp`: opt-in speculative timings; `GGML_SPECULATIVE_PROFILE` is the architecture-neutral control and `GGML_QWEN35MOE_MTP_PROFILE` remains a compatibility alias;
- `tools/server/server-context.cpp`: target decode, sampling and checkpoint timing;
- `tests/test-backend-ops.cpp`: Q2_K/Q4_K Qwen projection fixtures for N=1-4.

No optimisation was promoted. The branch, local `master` and `origin/master` all started at `603f26c86`, so no merge was required. Repository policy prohibits autonomous commits and pushes; no commit or push was made.
