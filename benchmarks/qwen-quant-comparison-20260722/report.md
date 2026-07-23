# Qwen3.6 35B A3B quant comparison — 2026-07-22

IQ4_XS and Q3_K_M are both slower than Q2_K_XL and Q4_K_M on the K3. Q3_K_M was downloaded and tested after the initial IQ4 comparison.

## Compared configurations

All compact-IQ tests used the direct block packer and the bounded global LRU from commit `1ea7900b7`, eight workers, batch 2,048, microbatch 512 and q8_0 K/V cache.

| Quant | Model size | Context | Tile cache | Warm generation |
|---|---:|---:|---:|---:|
| Q2_K_XL | 12.57 GB | 16K | 14 GiB shared | 3.58 tok/s over 64 tokens |
| Q3_K_M | 17.10 GB | 16K | standard Q3_K repack | 1.05 tok/s over 64 tokens |
| IQ4_XS | 18.94 GB | 4K | 512 MiB | 0.36 tok/s over 3 tokens |
| IQ4_XS | 18.94 GB | 4K | 4 GiB | 0.73 tok/s over 64 tokens |
| IQ4_XS | 18.94 GB | 4K | 8 GiB | 1.28 tok/s over 64 tokens |
| Q4_K_M + MTP | 22.66 GB | 4K | persistent standard repack | 6.10 tok/s final health check; 7.86 tok/s five-prompt campaign mean |

IQ4_XS reaches 5.82 tok/s for a warm three-token burst with a 4 GiB cache, but sustained routing expands the working set and reduces the 64-token result to 0.73 tok/s. An 8 GiB per-format cache raises sustained generation to 1.28 tok/s, still below the corrected Q2 shared-cache result while using a larger source model and leaving less context headroom.

## Q3 files

Exact files in `unsloth/Qwen3.6-35B-A3B-MTP-GGUF`:

| Quant | Size |
|---|---:|
| IQ3_XXS | 14,069,266,720 bytes |
| IQ3_S | 15,346,432,288 bytes |
| Q3_K_M | 17,104,402,720 bytes |
| Q3_K_XL | 17,227,569,440 bytes |

The 18.94 GB IQ4_XS fixture was removed with approval and replaced by Q3_K_M. The downloaded file matched its published size and SHA-256. [The Q3 service report](../qwen-q3km-20260722/report.md) records 1.05 tok/s at 16K without speculation and 0.88 tok/s with MTP draft-1.

## Deployment state

The IQ4_XS and Q3 test servers were stopped. The Q4_K_M MTP service was restored on port 8090 and `/health` returned `{"status":"ok"}`.
