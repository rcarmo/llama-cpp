# PTQ1 recovery fixed-work qualification

This is the final native ABBA qualification for the recovered PTQ1 Vulkan-prefill/CPU-generation candidate. It used 512-token chunks, logical batch 2048, microbatch 512, 12 threads, F16 K/V, flash attention and the AVX-VNNI PTQ1 CPU kernel.

## Result

| Workload | Handoff observations | Median | Gate | Result |
|---|---:|---:|---:|---|
| 256+32 | 44.374, 44.477 s | 44.426 s | <=35 s | FAIL |
| 1024+64 | 88.459, 88.894 s | 88.677 s | <=92 s | PASS |
| 2048+64 | 129.563, 129.666 s | 129.614 s | <=137 s | PASS |

All 12 ABBA observations produced finite logits at the correct final position with zero cgroup swap, OOM and OOM kills. Handoff observations used 671,633,408, 737,693,696 and 825,774,080 shared bytes at the three sizes and always copied zero bytes. `results.tsv` retains every parsed observation.

The short gate failed because one 256-token Vulkan prefill call remains at about 12.68 tok/s. A separate `../short-gate-screen-20260919T115718Z/` follow-up held logical batch 2048 and microbatch 512 constant: flash attention on completed in 44.447 s, while disabling flash attention regressed to 47.153 s. Larger 512-token prefill calls recover about 25.4 tok/s, which is why the longer workloads pass.

This candidate is therefore not accepted as the final topology. API/SSE/UI deployment qualification was not repeated because the native acceptance matrix failed. The earlier correctness and lifecycle evidence remains valid. Primary Gemma was restored after every guarded segment with zero restarts and zero unit swap; no deployment or routing change was made.
