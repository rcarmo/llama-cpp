# Qwen 128K Fieldfare service report

Status: complete. The service is configured for 131,072 tokens and passed an uninterrupted 99,104-token agentic request, meeting the requested 96K minimum without claiming a full 128K prefill.

## Service objective

Deploy one LAN-accessible llama.cpp Web UI on `0.0.0.0:8090`, with no API key, one active slot, native Qwen MTP, at least 96K usable context, no sustained swap growth and automatic boot startup.

## Host and build

- Host: `sigma`, Intel Core i5-1340P, 31 GiB RAM, 8 GiB zram.
- Model storage: local NVMe/btrfs under `/var/home`.
- Build: Clang 22.1.8, `-march=native`, OpenMP, CPU backend, llama.cpp commit `603f26c86`.
- Model workers: eight threads on logical CPUs 0-7, the four P-core SMT pairs.
- Canonical repository: `/var/home/agent/workspace/projects/llama-cpp`; all auxiliary worktrees were merged and removed.

## Existing Fieldfare path

The current tree already contains the router-aware expert-I/O series from `fc8e68490` through `c4462f34e`: Qwen `MUL_MAT_ID` selection observability, expert range planning, page-residency checks, bounded/asynchronous `MADV_WILLNEED`, adaptive modes, same-block lookahead and Prometheus counters.

Both Q2_K_XL and Q4_K_XL layouts were validated as mmap-backed with 41 routed layers, 256 experts per layer and three contiguous aligned ranges per expert. Routed expert storage is 10.78 GB for Q2 and 20.12 GB for Q4.

## Raw-cache gate

The raw fixed-slot expert cache was not gated in and was not implemented.

The controlled gate used Q2_K_XL, 128K context, Q4_0 KV, MTP-1, distinct btrfs reflink inodes and a 10 GiB post-load anonymous-memory pressure holder. The workload produced 474 repeated expert selections.

| Run | Request wall | Physical reads | Major faults | Prompt tok/s | Generation tok/s |
|---|---:|---:|---:|---:|---:|
| cold off | 114.726 s | 5.855 GB | 6,216 | 27.820 | 13.349 |
| cold bounded | 113.411 s | 0.323 GB | 118,074 | 28.194 | 12.987 |
| warm bounded control | 112.691 s | 0 B | 0 | 28.363 | 13.195 |

The cold bounded request was 0.64% slower than the warm bounded control, below the documented 10% residual token-wall threshold. Bounded metrics reported 1,160 resident skips and zero advice calls/bytes. The synthetic high fault count did not become a material request-time penalty. A raw cache would add file-offset ownership, pointer redirection, slot lifetime and eviction complexity without meeting the gate.

## Weight/context selection

Q2_K_XL and Q4_K_XL both reached health at configured 131,072-token context with Q4_0 KV and MTP-1.

- Q2: ready in 4 s; 13,388,298 KiB PSS in the final pre-health sample; no major faults or sampled swap growth.
- Q4: ready in 21 s; 28,419,881 KiB PSS; 24,121 process major faults, 54,983 system major-fault delta and a 831,312 KiB SwapFree decrease during startup.

Q4 has only startup evidence, not a full 128K agentic request. It was rejected on startup footprint/page pressure for this 31 GiB host. The Q4-within-10%-of-Q2 throughput rule was therefore not exercised at 128K. Lower-context Q4 cannot displace Q2 because the user prioritized the largest stable context first.

## KV sweep

The matched 3,068-token agentic tool-call workload produced the required `search_repository` call in every accepted run.

| KV | Wall | Prompt tok/s | Generation tok/s | Request reads | Request major faults | Decision |
|---|---:|---:|---:|---:|---:|---|
| Q4_0 | 113.908 s | 28.013 | 13.551 | 0 | 0 | selected |
| Q5_0 | 115.259 s | 27.703 | 13.148 | 0 | 0 | stable, slower |
| Q8_0 | 109.359 s | 29.363 | 13.663 | 438.8 MB | 6,609 | rejected for request-time memory/page pressure |

Turbo2/3/4 were not swept. In this CPU build their fallback dequantizes to F32 per dot; the optimized path is CUDA-oriented and is not a credible fastest Intel CPU candidate.

## MTP sweep

| Depth | Wall | Prompt tok/s | Generation tok/s | Accepted |
|---:|---:|---:|---:|---:|
| target only | 109.384 s | 29.495 | 11.038 | - |
| 1 | 113.908 s | 28.013 | 13.551 | 28/29 |
| 2 | 112.910 s | 28.361 | 12.548 | 38/42 |
| 3 | 113.066 s | 28.156 | 14.543 | 42/45 |

Target-only wins the short call's total wall time. MTP-3 improves generation throughput by 31.8% and is selected for interactive responses, where generated output often exceeds the 58-token sweep response.

## Batch sweep at MTP-3

| Batch/ubatch | Wall | Prompt tok/s | Generation tok/s | Accepted |
|---|---:|---:|---:|---:|
| 512/128 | 113.066 s | 28.156 | 14.543 | 42/45 |
| 1024/256 | 112.092 s | 28.356 | 15.340 | 42/45 |
| 2048/512 | 118.328 s | 26.849 | 14.675 | 42/45 |

1024/256 is selected.

## Expert advice mode

Off, bounded and adaptive modes were equivalent on the warm 3K workload because all 696 sampled expert pages were resident and no advice syscall was issued. Bounded mode is retained as the production fallback: it remains miss-only and can prefetch nonresident experts under real page pressure.

## Near-capacity validation

A 122,654-token request was stopped after 38,217 tokens because its projected completion exceeded the original 10,800-second client timeout. It ran 3,891 seconds at 13.76 GiB PSS with zero swap-in/out and zero process major faults. This is retained as partial stability evidence, not a completed context proof.

The final uninterrupted acceptance request contained 99,104 input tokens in a 131,072-token slot, above the requested 96K minimum. It completed in 21,663.009 seconds (6.02 hours) at 4.580 prompt tok/s and generated the required `search_repository` tool call. Generation was 2.104 tok/s with 42/45 MTP drafts accepted.

Peak sampled RSS was 14,066,640 KiB and peak PSS was 14,062,048 KiB. The run recorded zero process major faults, zero swap-in pages and zero swap-out pages; SwapFree remained at the full 8 GiB. Expert telemetry recorded 1,080 selections, 813 repeated selections and all 1,080 sampled pages resident. No advice syscall was needed.

A browser-facing 128K service can therefore sustain at least 99K usable input on this host. The evidence does not claim a completed 131,072-token prefill.

## Selected service profile

- Qwen3.6-35B-A3B Q2_K_XL;
- one 131,072-token slot;
- MTP depth 3;
- Q4_0 target and draft K/V;
- batch/ubatch 1024/256;
- eight model threads on CPUs 0-7; process mask 0-15;
- mmap weights;
- bounded Fieldfare expert advice and expert metrics;
- active-slot prompt reuse enabled;
- separate RAM prompt-state cache disabled;
- embedded UI, metrics and slot endpoints enabled;
- `0.0.0.0:8090`, no API key.

## Deployment status

Lingering is enabled and the systemd user manager is running. The source launcher and unit pass shell/systemd verification. The installed user unit is enabled and active. The guarded deployment validated one speculative 131,072-token slot, gzip-capable embedded UI delivery, Prometheus metrics, the deterministic `search_repository` tool call, service restart and post-restart health.

Service validation measured 28.506 prompt tok/s and 14.987 generation tok/s on the 3,068-token agentic workload after deployment. The service listens on `0.0.0.0:8090` with no API key, as explicitly requested.

Loginless startup was tested by restarting system scope `user@1001.service` while lingering was enabled. The production service PID changed from 1006500 to 1008278, returned `active`, restored `/health`, and continued exposing the 131,072-token speculative slot, UI and metrics without an interactive login.

Source files:

- `tools/run-intel-qwen-longctx.sh`;
- `tools/systemd/user/llama-qwen-longctx.service`;
- `benchmarks/intel-1340p/qwen-longctx-fieldfare/validate-service.sh`;
- `benchmarks/intel-1340p/qwen-longctx-fieldfare/service.md`.

The repository prohibits autonomous pushes. The agent will not run `git push`; the user must push reviewed commits manually.
