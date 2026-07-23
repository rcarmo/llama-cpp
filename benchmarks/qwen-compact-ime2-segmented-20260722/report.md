# Layer-segmented compact-IQ cache experiment — 2026-07-22

Equal per-layer cache segmentation regressed Q2 sustained generation and should not replace the global LRU.

## Implementation tested

Commit `c8df0a382` added:

- layer IDs parsed from `blk.N` tensor names;
- expert-frequency admission;
- whole-expert eviction;
- fixed per-layer budgets under the configured byte ceiling;
- hit, miss, bypass, admission, eviction and memory telemetry.

The compact-IQ fixture passed all 80 format/row/worker/gate combinations with `bad=0`. A forced 256 KiB segment evicted one complete eight-tile expert group and stayed below 261,120 bytes.

## Q2 service result

Model: `Qwen3.6-35B-A3B-UD-Q2_K_XL.gguf`, 16K context, eight workers, `CACHE_MB=8192`. At this point each format trait still owned a separate manager, so this was not an aggregate 8 GiB ceiling.

| Policy | Warm 64-token generation |
|---|---:|
| Historical per-format LRU | 2.41 tok/s |
| 64 fixed segments, admit after second routing use | 0.50 tok/s |
| 39 fixed segments, immediate admission | 0.57 tok/s |

The fixed 64-way policy discovered only 39 active layers and stranded about 3 GiB of the configured cache. The 39-way policy used more memory but still forced frequent eviction within layers.

Telemetry also exposed a pre-existing accounting problem: the cache manager is stored in four static per-format traits. Mixed IQ2/IQ3/IQ4 tensors therefore receive separate byte ceilings and cannot share expert-frequency state across gate/up/down projections. The 39-segment run reported 8.52 GB in the IQ2 trait plus 218 MB in IQ3, exceeding the intended shared 8 GiB ceiling.

## Decision

Revert the equal-segment policy. A future implementation needs one cache manager shared across compact formats, soft layer reservations that can borrow unused global capacity, and global frequency-aware whole-expert eviction. The global LRU remains the better measured policy until that design is implemented and service-tested.
