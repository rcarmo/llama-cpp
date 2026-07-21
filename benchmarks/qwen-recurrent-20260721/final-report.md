# Qwen recurrent-path optimisation report

Direct GDN-to-cache writes remove the second recurrent-state copy and improve Qwen3.6-35B-A3B Q4_K_M MTP generation by 5.05% across five prompts.

## Service and workload

The measurements ran on a Milk-V K3 with eight SpaceMIT CPU workers, Q4_K_M native MTP, draft maximum 3, one 4,096-token slot, batch 2,048 and microbatch 512. Thinking and built-in tools were disabled. The promoted release reports fingerprint `b10255-544cb0ccc`.

## Profile

A 128-token response identified these CPU shapes:

| Path | Dominant shape or bucket | Count | Measured cost |
|---|---:|---:|---:|
| Recurrent cache `CPY` | 8 MiB | 13,440 thread calls | 9.15 thread-seconds |
| F32 dot | 128 elements | 64,880,640 calls | 8.30 billion elements |
| Gated delta net | `4096 × 516` | 1,650 calls | 4.46 thread-seconds |
| SSM convolution | `8192 × 4` | 1,650 calls | 0.56 thread-seconds |
| Dense TCM-B weight staging | panel copies | 3,080,128 calls | 218.35 GB copied |

One recurrent state is `128 × 128 × 128 × f32`, or 8 MiB. GDN copied the input state into working storage, wrote rollback snapshots into packed operator output and then ran `GGML_OP_CPY` into the persistent recurrent cache.

Dense TCM-B staging accounts for most bytes copied by the SpaceMIT matmul path. The earlier campaign found that disabling this staging reduced generation throughput by 8.2%, so it remains enabled.

## Direct recurrent-state output

`ggml_gated_delta_net_set_state_dst()` attaches the existing strided recurrent-cache view in source slot 6. The CPU GDN kernel writes each eligible rollback snapshot directly into this view. `GGML_CPU_GDN_DIRECT_STATE=1` selects the direct path during graph construction. The library default retains the packed-output and `CPY` path.

The copy profiler recorded 40,800 thread-level 8 MiB-bucket `CPY` calls over three gate-off requests. Gate-on removed every 2–8 MiB recurrent `CPY` bucket. The remaining 64 KiB bucket belongs to convolution-state maintenance.

### Paired 128-token result

Each pair produced identical response hashes, draft counts and accepted drafts.

| Pair | Existing `CPY` | Direct state | Change |
|---:|---:|---:|---:|
| 1 | 5.894 tok/s | 6.424 tok/s | +8.99% |
| 2 | 5.692 tok/s | 6.173 tok/s | +8.45% |
| 3 | 5.935 tok/s | 6.430 tok/s | +8.33% |

### Five-prompt corpus

Five 96-token engineering prompts produced identical response hashes, draft counts and accepted drafts with the gate off and on.

| Metric | Existing `CPY` | Direct state | Change |
|---|---:|---:|---:|
| Mean generation | 6.887 tok/s | 7.235 tok/s | +5.05% |
| Per-prompt range | 6.219–7.506 tok/s | 6.540–7.869 tok/s | +4.84–5.16% |

## Context, cache and memory

A 3,042-token README review and a dependent follow-up produced matching response hashes and draft acceptance. The follow-up reused 3,038 cached tokens and processed 54 new tokens.

| Request | Existing `CPY` | Direct state | Change |
|---|---:|---:|---:|
| Initial generation | 2.730 tok/s | 2.811 tok/s | +2.97% |
| Cached follow-up | 2.589 tok/s | 2.647 tok/s | +2.25% |

Both slots returned idle. Available memory after each sequence differed by about 1 MB: 8,482,680,832 bytes with the existing copy and 8,483,676,160 bytes with direct state.

The promoted live service completed:

- 128-token response at 6.354 tok/s with 71 of 164 draft tokens accepted;
- 3,042-token prompt and 48-token response;
- cached follow-up with 3,038 reused tokens and 54 processed tokens;
- slot recovery to idle;
- embedded chat UI request with HTTP 200;
- service restart with the direct-state environment variable present in `/proc/<pid>/environ`.

## Rejected kernels

| Candidate | Local result | End-to-end result | Decision |
|---|---:|---:|---|
| F32 dot, split LMUL=8 | 86–95 ns/call vs 60–70 ns | Not run | Reject |
| F32 dot, four LMUL=4 accumulators | 76–86 ns/call vs 60–70 ns | Not run | Reject |
| GDN fused update and dot | 15–17% faster row fixture | 0.6–1.1% slower across five prompts | Reject |
| SSM Conv4 strided RVV | 21–29% faster fixture | 0.98% slower without speculation | Reject |
| RVV recurrent-state copy | Tied at 8 × 1 MiB; 27–37% slower at 8 MiB | Not run | Reject |

The current F32 dot already uses two LMUL=8 FMAs and one reduction for the 128-element shape. Extra accumulators increase setup and reduction cost. The fused GDN and strided SSM fixtures reduced isolated memory work but increased full-loop instruction or cache cost.

## Correctness and rollback

`GATED_DELTA_NET` and `SSM_CONV` pass 81 of 81 focused backend cases at one and eight workers. The profiler passes the same matrix with profiling disabled and enabled.

The model-level gates cover rollback state because native MTP requests retain four recurrent snapshots. Identical response hashes and draft acceptance across seven paired requests verify that direct writes preserve the snapshots consumed by target and draft verification.

## Operation

The Qwen launcher enables:

```sh
GGML_CPU_GDN_DIRECT_STATE=1
```

Remove this assignment and restart `llama-qwen36-35b.service` to restore the previous `CPY` path. The source tree keeps direct state disabled by default.

Benchmark inputs, JSON responses, counters and scripts are stored in this directory. Generated binaries and assembly dumps are excluded.
