# Branch decisions

## Static score scheduling — rejected

The opt-in strided scheduler passed structural, bit-exact, native and real-dispatch gates, then lost the trace-off saved-64K ABBA screen: 9.2790 to 8.3537 tok/s (-9.97%) and 15.404 to 16.958 s request wall (+10.09%). Real trace showed workers on CPUs 0-15 and up to 5.98x per-thread elapsed spread. The dynamic queue compensates for heterogeneous placement. No B1-combination or confirmation runs were opened.

## Cross-head shared-key preparation — conditional not run

Gemma has eight query heads and two KV heads, but `build_attn_mha()` emits one graph `ggml_mul_mat(ctx0, k, q)` and the CPU path iterates broadcast head indices internally. The low-level `llamafile_sgemm()` entry receives one head's key/query/output pointers at a time and completes team barriers before returning. B1 query reuse is local to that call.

The current score kernel does not explicitly prepare a reusable key tile: it converts key vectors while accumulating each output tile. Sharing those conversions across four query heads would require caller-level head fusion, a shared prepared-key lifetime, producer/consumer synchronization, and altered traversal. A persistent pointer cache in the local helper would be unsafe across graph executions and concurrent slots. This is a graph/backend API design, not a bounded local prototype, so G02/G03 are not run. This does not prove grouped-head fusion can never help.

## Resource/reclaim diagnosis — unresolved, local limit hypothesis not supported

The historical `gemma-b1-staging-20260911` transient cgroup and unit have been collected/deleted, so its `memory.current/peak/stat/events/high/max/swap/pressure` and CPU limits are no longer readable. The retained process snapshot proves CPU `VmSwap=352516 KiB` at abort; regular sampling saw 182336 KiB and system `pswpout` increased by 41070 pages while `MemAvailable` stayed above 18 GiB.

Current production and every visible ancestor have `memory.high=max`, `memory.max=max`, `memory.swap.max=max`, and no CPU quota. The current worker cgroup has zero swap and zero local reclaim/OOM events. Current ancestor counters contain historical reclaim and swap peaks, but are cumulative across many workloads and cannot be attributed to the failed stage. Current policy is zram swap, swappiness 60, overcommit heuristic, and `zone_reclaim_mode=0`.

Accessible user/kernel logs around 15:56 contain no OOM kill, driver allocation failure, or process exit reason. The worker stderr, GPU startup exit status/allocation trace, and historical cgroup event deltas were not retained. Therefore an inherited/local cgroup reclaim limit is not supported by visible current configuration, but the actual cause remains unresolved. A future authorised retry would need pre/post ancestry snapshots, per-cgroup event/pressure deltas, unsuppressed native stderr, GPU process exit status, and allocation/admission logging before any load. No retry or policy change was made.

## Q6_K fallback — no candidate

The actual Q6_K node is `token_embd.weight`, the 2560 x 262144 vocabulary projection, not an attention output projection. The retained MTP3 profile measured 36 long n4 calls and 0.777684 s node wall. Generic activation preparation summed only 0.001269 s across 288 worker records in that profile, so eliminating repeated preparation has a negligible evidenced ceiling relative to the operator. On this x86 host the ARM Q6_K repack implementations are excluded; the active generic Q6_K x Q8_K path has no identified unchanged-arithmetic mechanism beyond a new quantized dot-product kernel. No C01 candidate is opened from Q6_K.

## Pool transition fallback — no candidate

Source supports persistent decode/batch threadpool attachment and only pauses a prior pool when switching to a different attached pool. The live server's OpenMP path has an established affinity limitation and no evidence of per-token thread creation/destruction. Existing profiles do not isolate a removable transition cost, and a fresh thread-count sweep is disallowed. T01 closes at the source/evidence boundary; no C01 candidate is opened from pool transitions.
