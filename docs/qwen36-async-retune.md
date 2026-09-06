## Qwen3.6 MoE restoration and async retune

The restored Qwen3.6 35B-A3B native-MTP model replaces the dense Qwen3.8 service
on port 8090. The generalised async scheduler was tested, but the selected
configuration keeps it disabled: CPU/GPU dispatch overhead outweighed its gain
on this workload.

## Status of this report

This is the decode-oriented restoration baseline. The subsequent
[agentic tuning](qwen36-agentic-tuning.md) supersedes the settings below with
16 cache slots and microbatch 1024, and adds near-32K validation. The
[CUDA executable allocation recovery fix](cuda-graph-allocation-recovery.md)
was deployed afterward. Historical measurements below are not reruns of that fix.

## Model and selected settings

Source: `unsloth/Qwen3.6-35B-A3B-MTP-GGUF`, file
`Qwen3.6-35B-A3B-UD-Q2_K_XL.gguf`, stored locally with the `-MTP.gguf` suffix.
Size: 12,574,128,416 bytes. SHA-256:
`ed7cda7e38985b4fcff76475865135039641d2bfbac3c169df15ca770f37fb0c`.
The standard non-MTP repository is a different artifact and must not be substituted.

| Setting | Selected value |
|---|---|
| Context / slots | 32768 / 1 |
| GPU placement | all layers, first five MoE layers on CPU |
| Routing cache | 24 slots, preserved production CSV |
| Threads / batch threads | 4 / 4 |
| Batch / microbatch | 1024 / 512 |
| KV | q4_0 / q4_0 |
| Flash attention | on |
| Model loading | mlock |
| MTP | native, maximum draft depth 1 |
| Async CPU | off |

Routing CSV SHA-256:
`9f00d597bdd75217adb29a10539cb48030dfa78e27e48a49bc1bc3a5a58d92ef`.

## Matched measurements

All short comparisons used the same queue-design prompt, 256 generated tokens,
strict greedy sampling (`top_k=1`), seed 42 and prompt reuse disabled. CPU and GPU
workloads belonging to other projects were not stopped. Contention materially
affected some runs, so timings below are not a clean hardware-isolated benchmark.

| Configuration | Generation tok/s |
|---|---:|
| Initial cache-off, six threads, microbatch 1024 | 75.81-76.46 (three runs) |
| Old 36-slot cache, microbatch 1024 | 79.11 once, then CUDA OOM; rejected |
| 24-slot cache, four threads, resident load, sync | 82.97-84.26 (six runs, two loads) |
| Same 24-slot profile, async, first load | 80.68-81.62 (three runs) |
| Same 24-slot profile, async, second load | 53.85-78.62 (contention affected) |
| Resident cache-off control, four threads | 53.01-73.43 (contention affected) |
| Resident 32-slot sync | 46.91-75.82 (contention affected) |
| Resident 16-slot sync | 60.07-78.27 (contention affected) |

The clean synchronous 24-slot median is about 83.83 tok/s versus 80.94 tok/s
for the first async round: roughly a 3.4% async slowdown. All 12 resident
24-slot sync/async outputs had identical token IDs. This establishes full-model
MoE parity for that prompt and placement, not a universal correctness guarantee.
Cache sizes can alter numerical rounding and draft acceptance, so cross-cache
throughput includes those effects rather than isolating cache hit rate alone.

Against the initial 75.86 tok/s cache-off median, the selected profile is about
10.5% faster, but this also changes threads, microbatch and loading mode. Do not
attribute the whole difference to caching or asynchronous scheduling.

## Deployed validation

The canonical merged server binary was rebuilt and the existing Qwen3.6 unit
started with the updated launcher. A 1,024-token generation completed at
84.08 tok/s; native MTP accepted 469/553 drafts (84.8%). A cancelled stream was
followed by a successful completion and an OK health check. Process VRAM after
requests was about 11,424 MiB, with the unrelated GPU allocations still present.
The old 36-slot profile's request-time OOM did not recur in this validation.

Compared with the prior Qwen3.8 512-token sustained result of 5.45 tok/s, this is
roughly 15.4 times the throughput. Those are different models, quantisations,
prompts and generation lengths -- this is an operational comparison, not a
quality-equivalent speedup or an async gain.

## Operating and rollback

The active unit is `llama-qwen36-27b-mtp.service`; its historical name still
says 27B. The launcher and local server registry select the 35B-A3B MoE model.
The Qwen3.8 unit is stopped, not removed. To switch back, stop the Qwen3.6 unit
before starting `llama-qwen38-27b-ud-q4.service`, since both use port 8090.

Raw run outputs are retained on the benchmark host under
`/workspace/tmp/qwen36-async-restore/`. No fresh near-32K prompt test was run in
this retune; the context allocation is 32K, but the new validation covers short
prompts, sustained decode, cancellation and recovery only.
