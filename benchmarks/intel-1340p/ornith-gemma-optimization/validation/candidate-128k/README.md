# Ornith and Gemma near-capacity 128K validation

Both selected CPU profiles completed frozen model-specific requests in one 131,072-token slot with batch 1024 / ubatch 256, F16 KV and Flash Attention disabled.

| Model | Prompt tokens | Prompt | Generation | Elapsed | Draft acceptance | Peak PSS | Peak temperature |
|---|---:|---:|---:|---:|---:|---:|---:|
| Ornith | 124,341 | 13.14 tok/s | 2.63 tok/s | 9490 s | 37/44 | 23857 MiB | 91 °C |
| Gemma | 124,112 | 22.49 tok/s | 4.49 tok/s | 5537 s | 29/42 | 11141 MiB | 90 °C |

Both responses ended with exactly one valid `search_repository` tool call, retained generation headroom, used speculative decoding and completed without a thermal-abort marker.

## Selected 128K settings

| Setting | Ornith | Gemma |
|---|---:|---:|
| Context | 131072 | 131072 |
| Batch / ubatch | 1024 / 256 | 1024 / 256 |
| KV | f16 | f16 |
| Flash Attention | off | off |
| MTP depth | 2 | 3 |
| Threads | 8 | 8 |

Raw evidence is under `validation/candidate-128k/`; frozen requests and tokenization metadata are under `workloads/near-capacity-128k/`.
