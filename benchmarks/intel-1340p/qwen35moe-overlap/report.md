# Qwen3.6 35B-A3B same-session CPU/Vulkan overlap

A gated prototype ran the routed and shared-expert FFN branches concurrently on CPU and Iris Xe Vulkan within one Qwen3.6 35B-A3B session. It was correct in the stable orientation but slower in every target-only generation test, so the source change was rejected.

Date: 31 July 2026
Base commit: `d461841a6`
Target: Qwen3.6 35B-A3B only
Gate used during the experiment: `GGML_QWEN35MOE_CPU_VK_OVERLAP`

## Independence contract

Each Qwen35MoE layer normalises the post-attention state once, then computes two FFN branches from that tensor:

1. routed experts selected by the MoE router;
2. a gated shared expert.

The branches meet at one add before the FFN residual and the next layer. They do not write recurrent or KV state. This is a valid fork/join boundary for same-session overlap.

## Prototype

Two orientations were implemented behind a one-token, Qwen35MoE-only environment gate:

- `routed-cpu`: materialise the FFN input on CPU, launch the shared branch on Vulkan, compute routing and routed experts on CPU, join on CPU;
- `shared-cpu`: materialise the FFN input on CPU, launch routed experts on Vulkan, compute the shared branch on CPU, join on CPU.

The existing serial graph remained unchanged when the gate was absent. Manual scheduler placement pinned the CPU branch and join to CPU. Early graph expansion placed the independent Vulkan branch before the CPU branch.

Scheduler instrumentation proved arithmetic overlap. Vulkan split submission normally returned in hundreds of microseconds while the following CPU split ran for roughly 2-3 ms. The CPU join then waited for and copied the Vulkan result.

## Correctness

The stable `routed-cpu` orientation was compared with an identical serial placement through two dependent server requests at temperature 0 and seed 42.

- token IDs and text were identical for both responses;
- stop state and predicted-token counts were identical;
- the second request reused the same 45-token prompt prefix;
- Q2 and Q4 MTP draft acceptance was identical between serial and overlap runs.

The `shared-cpu` placement hit `vk::DeviceLostError` in its serial control server. This matches the existing Iris Xe `MUL_MAT_ID` stability limitation and excludes that orientation from deployment.

## Thread sweep

Generation throughput in tok/s, Q2_K_XL:

| CPU threads | Routed CPU serial | Routed CPU overlap | Shared CPU serial | Shared CPU overlap |
|---:|---:|---:|---:|---:|
| 1 | 2.67 | 2.50 | 3.99 | 4.29 |
| 2 | 3.82 | 3.21 | 5.61 | 4.41 |
| 4 | 5.09 | 3.64 | 5.86 | 4.47 |
| 6 | 5.58 | 4.23 | 6.49 | 5.13 |
| 8 | 5.67 | 4.35 | 6.95 | 5.04 |

No thread count produced a useful crossover. The one-thread shared-CPU result was noisy and did not survive at practical thread counts.

## Final target-only gate

Five repetitions, six CPU threads, batch 512, microbatch 128:

| Quant | Test | Serial tok/s | Overlap tok/s | Change |
|---|---|---:|---:|---:|
| Q2_K_XL | pp64 | 9.85 | 9.71 | -1.4% |
| Q2_K_XL | pp128 | 15.78 | 15.85 | +0.5% |
| Q2_K_XL | tg32 | 5.74 | 4.42 | -23.1% |
| Q4_K_XL | pp64 | 11.68 | 11.54 | -1.2% |
| Q4_K_XL | pp128 | 19.61 | 19.30 | -1.6% |
| Q4_K_XL | tg32 | 6.78 | 5.16 | -23.9% |

Prefill is unchanged because the prototype only gates one-token decode. Generation regresses materially.

## MTP gate

Three 96-token server requests, draft maximum 1:

| Quant | Mode | Mean tok/s | Warm request tok/s | Accepted drafts |
|---|---|---:|---:|---:|
| Q2_K_XL | serial | 7.03 | 7.18 | 41/53 |
| Q2_K_XL | overlap | 6.99 | 6.93 | 41/53 |
| Q4_K_XL | serial | 7.97 | 8.39 | 43/52 |
| Q4_K_XL | overlap | 8.36 | 8.43 | 43/52 |

Q2 regresses. The Q4 warm difference is +0.4%, below the 2% gate and within run noise.

## Decision

Reject and revert the source prototype.

The branches genuinely execute concurrently, but both stream large weight sets through the same LPDDR. CPU and Iris Xe contend for memory bandwidth, and the extra CPU/Vulkan copies and join wait exceed the latency hidden by overlap.

The DS4 principle remains valid on hardware with separate high-bandwidth devices. On this UMA system, the next useful Vulkan work is a model-specific exact-row kernel that reduces memory traffic inside one backend, not concurrent CPU/Vulkan weight streaming.

Retained evidence:

- `final/`: Q2/Q4 target and MTP promotion matrix;
- `thread-sweep.tsv`: matched thread results;
- `correctness/`: exact routed serial/overlap server responses;
- `profile-routed.txt` and `profile-shared.txt`: compact scheduler timing excerpts;
- `shared-cpu-device-lost.log`: reverse-placement failure.
