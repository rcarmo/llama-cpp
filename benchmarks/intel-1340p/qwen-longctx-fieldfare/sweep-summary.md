| Group | Profile | Context | KV | MTP | Batch | Ubatch | Wall s | Prompt tok/s | Generation tok/s | Accepted | Tool |
|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---|
| advice | off | 131072 | q4_0 | - | - | - | 113.908 | 28.013 | 13.551 | 28/29 | search_repository |
| advice | bounded | 131072 | q4_0 | - | - | - | 112.496 | 28.382 | 13.506 | 28/29 | search_repository |
| advice | adaptive | 131072 | q4_0 | - | - | - | 113.155 | 28.255 | 12.989 | 28/29 | search_repository |
| kv | q5 | 131072 | q5_0 | 1 | 512 | 128 | 115.259 | 27.703 | 13.148 | 28/29 | search_repository |
| kv | q8 | 131072 | q8_0 | 1 | 512 | 128 | 109.359 | 29.363 | 13.663 | 32/32 | search_repository |
| kv | q4 | 131072 | q4_0 | - | - | - | 113.908 | 28.013 | 13.551 | 28/29 | search_repository |
| mtp | d0 | 131072 | q4_0 | 0 | 512 | 128 | 109.384 | 29.495 | 11.038 | - | search_repository |
| mtp | d1 | 131072 | q4_0 | - | - | - | 113.908 | 28.013 | 13.551 | 28/29 | search_repository |
| mtp | d2 | 131072 | q4_0 | 2 | 512 | 128 | 112.910 | 28.361 | 12.548 | 38/42 | search_repository |
| mtp | d3 | 131072 | q4_0 | 3 | 512 | 128 | 113.066 | 28.156 | 14.543 | 42/45 | search_repository |
| batch | b1024-u256 | 131072 | q4_0 | 3 | 1024 | 256 | 112.092 | 28.356 | 15.340 | 42/45 | search_repository |
| batch | b2048-u512 | 131072 | q4_0 | 3 | 2048 | 512 | 118.328 | 26.849 | 14.675 | 42/45 | search_repository |
