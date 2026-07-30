# CPU and Vulkan interleaving on Intel Core i5-1340P

True intra-token CPU and Iris Xe execution is not useful with the current llama.cpp scheduler on this host. Continuous CPU batching improves aggregate throughput for multiple users, and independent CPU/Vulkan requests can overlap when higher CPU latency is acceptable.

Date: 31 July 2026
Source branch: `perf/intel-1340p-vulkan-20260731`

## Evaluated mechanisms

1. Vulkan prefill followed by CPU generation through slot-state save/restore.
2. Static layer offload between CPU and Vulkan.
3. Q2-A3B expert placement with `--n-cpu-moe`.
4. Independent CPU generation and Vulkan prefill at the same time.
5. CPU continuous batching with one, two and four sequences.

## Backend state handoff

Dense Qwen3.6 27B Q2 has the strongest theoretical phase crossover: Vulkan prompt processing reaches about 20 tok/s, while CPU generation reaches about 2.9 tok/s.

A Vulkan server processed 1,966 prompt tokens, saved slot 0, and a CPU server restored it:

| Phase | Result |
|---|---:|
| Vulkan prefill | 96.08 s wall, 20.46 tok/s |
| Save 225,390,208-byte state | 0.12 s wall |
| CPU restore | 0.04 s wall |
| CPU request after restore | 494.85 s wall |

The CPU request reprocessed all 1,966 prompt tokens at 4.16 tok/s before generating 64 tokens at 2.81 tok/s. Total time was about 591 s.

`tools/server/server-context.cpp` deliberately resets `n_past` for hybrid/recurrent memories when a restored prompt has no compatible context checkpoint. Qwen3.6 uses hybrid recurrent state, so backend-neutral sequence serialization does not provide a transferable prefill checkpoint for this workflow.

Decision: reject phase switching through slot files for Qwen3.6.

## Static CPU/Vulkan layer split

Dense 27B was swept from zero to full Vulkan offload with batch 512, microbatch 128 and eight threads.

- prompt throughput rose from 14.43 tok/s in the Vulkan-capable CPU path to 16.76 tok/s near 72/full layers;
- generation was best with zero offloaded layers at 2.20 tok/s;
- the best offloaded generation point was 2.04 tok/s at 16 layers;
- deep offload fell to about 1.81 tok/s.

The accepted Clang CPU-only build remains faster at 2.91 tok/s generation.

Decision: use full Vulkan only for isolated dense-27B prompt-heavy jobs; use CPU for interactive generation.

## MoE-aware placement

Qwen3.6 35B-A3B Q2 was tested with full Vulkan offload and increasing `--n-cpu-moe` values.

| CPU MoE layers | pp128 tok/s | tg32 tok/s |
|---:|---:|---:|
| 0 | 24.50 | 10.30 |
| 8 | 21.56 | 8.54 |
| 16 | 19.44 | 7.47 |
| 24 | 17.91 | 6.48 |
| 32 | 16.49 | 5.96 |
| 40 | 15.30 | 2.90 |
| 48 | 15.17 | 2.72 |

CPU expert placement adds graph splits and synchronisation without overlapping CPU expert compute with Vulkan dense compute.

Decision: reject CPU-MoE/Vulkan partitioning on Iris Xe.

## Independent request overlap

Two resident dense-27B servers were tested: CPU generation on the P-cores and an independent full-Vulkan long prefill.

| Work | Isolated | Concurrent | Change |
|---|---:|---:|---:|
| CPU 64-token generation | 25.64 s, 2.92 tok/s | 35.45 s, 2.17 tok/s | 38.3% longer wall time |
| Vulkan 1,866-token prefill | 91.91 s, 20.30 tok/s | 95.69 s, 19.58 tok/s | 4.1% longer wall time |
| Combined makespan | 117.55 s sequential | 95.70 s concurrent | 18.6% lower |

Both servers fit concurrently because model mappings are largely file-backed and memory is unified. About 15.3 GiB remained available after the concurrent run.

Decision: request-level overlap is useful for a throughput-oriented router. Send long, latency-tolerant prompt-only jobs to Vulkan while CPU serves generation. Do not use it when CPU interactive latency has priority.

## Continuous batching

`llama-batched-bench` used 128 prompt tokens and 64 generated tokens per independent sequence on the Clang-native CPU build.

### Qwen3.6 35B-A3B Q2

| Streams | Aggregate generation | Effective per stream | Generation wall time |
|---:|---:|---:|---:|
| 1 | 14.93 tok/s | 14.93 tok/s | 4.29 s |
| 2 | 18.04 tok/s | 9.02 tok/s | 7.10 s |
| 4 | 21.22 tok/s | 5.31 tok/s | 12.06 s |

Aggregate generation improves by 20.8% with two streams and 42.2% with four. Each request becomes slower.

### Qwen3.6 27B Q2

| Streams | Aggregate generation | Effective per stream | Generation wall time |
|---:|---:|---:|---:|
| 1 | 2.89 tok/s | 2.89 tok/s | 22.16 s |
| 2 | 3.33 tok/s | 1.67 tok/s | 38.40 s |
| 4 | 3.64 tok/s | 0.91 tok/s | 70.25 s |

Aggregate generation improves by 15.4% with two streams and 26.2% with four. The dense model remains bandwidth-bound.

MTP draft-1 remains preferable for one interactive A3B slot. Multi-slot service uses target-only continuous batching because native MTP is not supported for `-np > 1` in the model's deployment guidance.

## Scheduler boundary

`ggml/src/ggml-backend.cpp` launches each backend graph split asynchronously, but dependent input copies use events or backend synchronisation before the next split can consume them. The context synchronises all configured backends when graph execution completes. Existing expert prefetch can overlap weight upload with a previous split; it does not overlap CPU and Vulkan arithmetic on independent branches of one token graph.

`--split-mode row` and `tensor` use backend-provided GPU split buffers. CPU is the final fallback backend, not a cooperating row device. `--cpu-moe` changes weight placement and creates backend graph splits; it does not execute routed CPU experts concurrently with Vulkan operations.

True intra-token interleaving would require a scheduler extension that can identify independent graph branches, launch them on CPU and Vulkan, reduce their outputs, and preserve hybrid recurrent-state ownership. It also needs backend-specific correctness and device-loss tests. The measured Iris Xe performance does not justify that redesign.

A combined Clang-native plus Vulkan build loaded the Iris Xe device, but the focused backend corpus lost the device during a Q8_0 `MUL_MAT_ID` case after earlier cases passed. The established GCC Vulkan build passed the bounded 1,544-case corpus used by the main campaign. Keep the Clang+Vulkan build experimental until the Mesa/device-loss failure is isolated.

## Physical micro-batch boundaries

A fixed 256-token dense-27B prompt was tested with physical micro-batches of 32, 64, 128 and 256. Larger physical batches substantially improve prefill:

| Backend placement | ubatch 32 | ubatch 64 | ubatch 128 | ubatch 256 |
|---|---:|---:|---:|---:|
| CPU in Vulkan build, pp256 | 7.43 | 12.62 | 14.70 | 16.11 |
| 16 Vulkan layers, pp256 | 7.84 | 13.25 | 15.11 | 16.31 |
| Full Vulkan, pp256 | 9.97 | 16.15 | 16.81 | 17.12 |

The same ubatch sweep has no meaningful effect on one-slot decode:

| Backend placement | ubatch 32 | ubatch 64 | ubatch 128 | ubatch 256 |
|---|---:|---:|---:|---:|
| CPU in Vulkan build, tg32 | 2.29 | 2.28 | 2.28 | 2.27 |
| 16 Vulkan layers, tg32 | 2.06 | 2.09 | 2.08 | 2.07 |
| Full Vulkan, tg32 | 1.73 | 1.72 | 1.72 | 1.73 |

A single interactive decode graph has one new token, so there is no multi-token physical micro-batch handover to optimise. The hybrid generation loss comes from per-token backend placement, synchronisation and shared-memory contention.

## Comparison with antirez/ds4

DwarfStar uses two mechanisms:

- distributed prefill pipelines prompt chunks through different layer ranges and explicitly states that this does not accelerate autoregressive generation;
- server decode batching waits up to 2 ms for decode-ready tokens from separate resident sessions, then invokes model-specific N-row GPU paths.

`ds4.c` contains native session-batch QKV and shared-FFN paths which gather rows from separate sessions, call exact-row matrix kernels, scatter results back, and preserve each session checkpoint. Its CUDA oracle exercises N=2, N=4 and N=8 batches and compares every batched frontier with isolated-session logits. The public 120 tok/s figure is aggregate multi-user generation on eight L40S GPUs.

llama.cpp also has Vulkan decode pipelines specialised for one through eight columns. Dense-27B full-Vulkan batching confirms that the right dimension helps:

| Decode rows | Aggregate tg64 | Effective per stream |
|---:|---:|---:|
| 1 | 1.75 tok/s | 1.75 tok/s |
| 2 | 2.55 tok/s | 1.28 tok/s |
| 4 | 2.56 tok/s | 0.64 tok/s |
| 8 | 1.88 tok/s | 0.23 tok/s |

N=2 improves aggregate Vulkan decode by 45.4%, but N=4 adds no further throughput and N=8 regresses. Vulkan profiling still reports 161 `MUL_MAT_VEC` operations for N=1 and N=2. The generic shader specialises `NUM_COLS` and reuses weight dequantisation across columns, but increasing columns also raises accumulator/register state and activation reads without adding workgroups. DwarfStar goes further by fusing model-specific QKV and shared-FFN row operations.

Q2-A3B multi-session Vulkan decode lost the device during the batched test. This matches the earlier bounded `MUL_MAT_ID` device-loss risk and prevents deployment of an Iris Xe MoE batch profile.

The smallest transferable optimisation target is an Intel Xe N=2 exact-row Vulkan path for the dense Q2_K model, starting with QKV and FFN projections. It requires shader-level A/B tests and backend correctness coverage. Generic ubatch tuning cannot substitute for it.

## Deployment

Single interactive user:

```bash
LLAMA_PARALLEL=1 tools/run-intel-qwen.sh qwen36-35b-a3b-q2
```

This retains MTP draft-1.

Two or four concurrent users:

```bash
LLAMA_PARALLEL=2 LLAMA_CTX=8192 tools/run-intel-qwen.sh qwen36-35b-a3b-q2
LLAMA_PARALLEL=4 LLAMA_CTX=8192 tools/run-intel-qwen.sh qwen36-35b-a3b-q2
```

The launcher disables MTP when `LLAMA_PARALLEL` exceeds one. `LLAMA_CTX` is the total context allocation used by the server; size it for the required slot count and workload.

Raw evidence:

- `cpu-vulkan-handoff/`
- `hybrid-sweeps/`
- `request-overlap/`
- `microbatch/`
