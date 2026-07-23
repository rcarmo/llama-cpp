# Qwen3.6 35B A3B Q3_K_M service test — 2026-07-22

Q3_K_M provides 16K context with ample memory headroom, but it is slower than Q2_K_XL and Q4_K_M on the K3.

## Model

- Repository: `unsloth/Qwen3.6-35B-A3B-MTP-GGUF`
- File: `Qwen3.6-35B-A3B-UD-Q3_K_M.gguf`
- Size: 17,104,402,720 bytes
- SHA-256: `8966dd0cd8c543c4228490a2a8b0e0814fc4f1e6a8e199ceed4de6754ae7b8e1`

The eliminated 18.94 GB IQ4_XS fixture was removed with approval to make room for this file.

## Configuration

- eight workers;
- batch 2,048;
- microbatch 512;
- one slot;
- q8_0 K/V cache;
- prompt caching enabled;
- no warm-up.

Q3_K uses the standard SpaceMIT Q3_K repack and IME path. It does not use the compact-IQ tile cache.

## Results

The repeated request used 28 prompt tokens and 64 generated tokens. The warm request reused 24 prompt tokens.

| Context | Speculation | Warm prompt | Warm generation | Draft acceptance |
|---:|---|---:|---:|---:|
| 4K | off | 1.103 tok/s | 1.043 tok/s | — |
| 16K | off | 1.104 tok/s | 1.045 tok/s | — |
| 16K | MTP draft-1 | 1.100 tok/s | 0.877 tok/s | 24/39, 61.5% |

The 16K non-speculative server loaded with 14.58 GiB available. Generation throughput was unchanged between 4K and 16K, so longer allocation did not impose a measurable penalty in this test.

MTP reduced generation by 16.1% despite accepting 61.5% of draft tokens.

## Quant ranking

| Quant/profile | Context | Sustained warm generation |
|---|---:|---:|
| Q4_K_M + MTP | 4K | 6.11 tok/s final health check; 7.86 tok/s five-prompt mean |
| Q2_K_XL, 14 GiB shared tile cache | 16K | 3.58 tok/s |
| Q3_K_M, speculation off | 16K | 1.05 tok/s |
| IQ4_XS, 8 GiB tile cache | 4K | 1.28 tok/s |

Q3_K_M is not a speed upgrade. It is useful only when 16K context and better expected quality than Q2 matter more than throughput. Q2 remains the faster long-context quant; Q4 remains the interactive production default.

## Deployment state

The Q3 test server was stopped. The Q4_K_M MTP service was restored on port 8090 and `/health` returned `{"status":"ok"}`.
