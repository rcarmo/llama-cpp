# Qwen3.6 35B A3B quant comparison — 2026-07-22

The locally available IQ4_XS model is slower than Q2_K_XL and Q4_K_M on the K3. Q3 remains untested because no Q3 file is local and the filesystem lacks enough free space for one.

## Compared configurations

All compact-IQ tests used the direct block packer and the bounded global LRU from commit `1ea7900b7`, eight workers, batch 2,048, microbatch 512 and q8_0 K/V cache.

| Quant | Model size | Context | Tile cache | Warm generation |
|---|---:|---:|---:|---:|
| Q2_K_XL | 12.57 GB | 16K | 8 GiB | 2.41 tok/s over 64 tokens |
| IQ4_XS | 18.94 GB | 4K | 512 MiB | 0.36 tok/s over 3 tokens |
| IQ4_XS | 18.94 GB | 4K | 4 GiB | 0.73 tok/s over 64 tokens |
| IQ4_XS | 18.94 GB | 4K | 8 GiB | 1.28 tok/s over 64 tokens |
| Q4_K_M + MTP | 22.66 GB | 4K | persistent standard repack | 6.10 tok/s final health check; 7.86 tok/s five-prompt campaign mean |

IQ4_XS reaches 5.82 tok/s for a warm three-token burst with a 4 GiB cache, but sustained routing expands the working set and reduces the 64-token result to 0.73 tok/s. An 8 GiB cache raises sustained generation to 1.28 tok/s, still about half the Q2 result while using a larger source model and leaving less context headroom.

## Q3 candidates

Exact files in `unsloth/Qwen3.6-35B-A3B-MTP-GGUF`:

| Quant | Size |
|---|---:|
| IQ3_XXS | 14,069,266,720 bytes |
| IQ3_S | 15,346,432,288 bytes |
| Q3_K_M | 17,104,402,720 bytes |
| Q3_K_XL | 17,227,569,440 bytes |

The filesystem has 10,214,518,784 bytes free. Testing any MTP Q3 therefore requires freeing at least 3.86 GB for IQ3_XXS or 6.89 GB for Q3_K_M. The 18.94 GB IQ4_XS fixture is the most direct replacement because this campaign has eliminated it as a speed candidate.

## Deployment state

The IQ4_XS test server was stopped. The Q4_K_M MTP service was restored on port 8090 and `/health` returned `{"status":"ok"}`.
