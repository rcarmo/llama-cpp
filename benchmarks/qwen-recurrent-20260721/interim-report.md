# Qwen recurrent-path optimisation checkpoint

The direct-state GDN prototype removes the second recurrent-cache copy and improves the paired 128-token workload by 8.33–8.99%.

## Profile

A 128-token Qwen3.6-35B-A3B Q4_K_M MTP request identified these CPU shapes:

| Path | Dominant shape or bucket | Count | Measured cost |
|---|---:|---:|---:|
| Recurrent cache `CPY` | 8 MiB | 13,440 thread calls | 9.15 thread-seconds |
| F32 dot | 128 elements | 64,880,640 calls | 8.30 billion elements |
| Gated delta net | `4096 × 516` | 1,650 calls | 4.46 thread-seconds |
| SSM convolution | `8192 × 4` | 1,650 calls | 0.56 thread-seconds |
| Dense TCM-B weight staging | panel copies | 3,080,128 calls | 218.35 GB copied |

The 8 MiB tensor is one recurrent state: `128 × 128 × 128 × f32`. The graph copied each GDN snapshot into packed output and then copied it into the persistent recurrent cache.

## Accepted prototype

`GGML_CPU_GDN_DIRECT_STATE=1` attaches the existing strided recurrent-cache view to the GDN operator. The CPU kernel writes rollback snapshots directly into that view. The default graph retains the packed-output and `CPY` path.

Three paired runs used identical prompts, generated text, draft counts and accepted drafts:

| Pair | Existing `CPY` | Direct state | Change |
|---:|---:|---:|---:|
| 1 | 5.894 tok/s | 6.424 tok/s | +8.99% |
| 2 | 5.692 tok/s | 6.173 tok/s | +8.45% |
| 3 | 5.935 tok/s | 6.430 tok/s | +8.33% |

The profiler recorded 40,800 thread-level 8 MiB-bucket `CPY` calls over the three gate-off requests. Gate-on removed all 2–8 MiB recurrent `CPY` buckets. The remaining 64 KiB bucket is convolution-state maintenance.

## Rejected kernels

| Candidate | Local result | End-to-end result | Status |
|---|---:|---:|---|
| F32 dot, split LMUL=8 | 86–95 ns/call vs 60–70 ns | Not run | Rejected |
| F32 dot, four LMUL=4 accumulators | 76–86 ns/call vs 60–70 ns | Not run | Rejected |
| GDN fused update and dot | 15–17% faster row fixture | 0.6–1.1% slower on five prompts | Rejected |
| SSM Conv4 strided RVV | 21–29% faster fixture | 0.98% slower without speculation | Rejected |
| RVV recurrent-state copy | About equal at 8 × 1 MiB; slower at 8 MiB | Not run | Rejected |

## Validation status

- `GATED_DELTA_NET` and `SSM_CONV`: 81/81 tests pass at one and eight workers with profiling disabled and enabled.
- Direct-state paired responses match by SHA-256.
- MTP draft counts and acceptance match in every direct-state pair.
- The production service still uses the gate-off release binary.

## Varied-prompt acceptance

Five 96-token engineering prompts produced identical response hashes, draft counts and accepted drafts with the gate off and on. Mean generation throughput increased from 6.887 to 7.235 tok/s, a 5.05% gain. Individual gains were 4.84–5.16%.

## Context, cache and memory

A 3,042-token README review and a dependent follow-up passed with matching response hashes and draft acceptance. The follow-up reused 3,038 cached tokens and processed 54 new tokens. Direct-state generation improved from 2.730 to 2.811 tok/s on the initial request and from 2.589 to 2.647 tok/s on the follow-up.

Both slots returned idle. Available memory after each sequence differed by about 1 MB: 8,482,680,832 bytes with the existing copy and 8,483,676,160 bytes with direct state. The production Qwen service restarted and returned HTTP 200 after the test.

The direct-state path still needs final profiler-off correctness, default-service and restart gates before promotion.
