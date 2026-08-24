# Fieldfare raw-cache gate decision

The bounded raw-expert fixed-slot cache is not gated in on the Intel i5-1340P host.

## Evidence

Matched Q2_K_XL, 128K context, Q4_0 KV, MTP-1 runs used distinct btrfs reflink inodes and a 10 GiB post-load anonymous-memory pressure holder.

| Mode | Request wall | Physical reads | Major faults | Prompt tok/s | Generation tok/s |
|---|---:|---:|---:|---:|---:|
| cold off | 114.726 s | 5.855 GB | 6,216 | 27.820 | 13.349 |
| cold bounded | 113.411 s | 0.323 GB | 118,074 | 28.194 | 12.987 |
| warm bounded control | 112.691 s | 0 B | 0 | 28.363 | 13.195 |

The workload produced 474 repeated expert selections in all modes. In bounded mode all 696 sampled expert pages were resident by execution, `resident_skips=1160`, and no advice syscall was needed. The cold bounded request was 0.64% slower than the warm bounded control, below the documented residual-I/O threshold of 10% of token wall time.

The high major-fault/swap-in counts under synthetic pressure did not translate into a material request-time penalty. A raw cache would add pointer redirection, file-offset ownership, slot lifetime and eviction complexity without meeting the acceptance gate.

## Decision

- Do not implement raw fixed slots or asynchronous `pread` buffers.
- Retain the existing mmap, residency planner, bounded advice worker and metrics.
- Use bounded advice in the final near-capacity validation and service so nonresident expert ranges can be prefetched when the kernel identifies misses.
- Revisit raw slots only if a future real workload shows at least 10% residual token-wall storage cost after bounded advice.
