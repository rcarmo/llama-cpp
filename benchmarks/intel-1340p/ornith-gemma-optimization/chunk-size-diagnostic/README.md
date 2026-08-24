# Ornith routed `MUL_MAT_ID` chunk-size diagnostic

## Decision

Rejected. Keep the existing chunk size of 16. Do not test chunk size 8 without new evidence.

## Method

- CPU: Intel Core i5-1340P, Clang AVX-VNNI build
- operation: routed `MUL_MAT_ID`, Q3_K × F32
- exact N=2 projection shapes: `(m,k)=(512,2048)` and `(2048,512)`
- 16 synthetic experts, 8 selected experts
- 8 backend threads, process pinned to CPUs 0–7
- balanced interleaved order: 16, 32, 32, 16, 32, 16, 16, 32
- each process runs the harness's approximately one-second performance loop
- runs wait for load <1.5 and package temperature <55 C

## Result

| Shape `(m,k)` | Chunk 16 mean | Chunk 32 mean | Chunk 32 speedup |
|---|---:|---:|---:|
| `(512,2048)` | 145.310 us | 143.995 us | 0.91% |
| `(2048,512)` | 157.545 us | 155.253 us | 1.48% |
| Geomean | — | — | 1.19% |

The result does not clear the 2% focused microbenchmark gate, so no end-to-end model run or production scheduler change is justified.

## Artifacts

- `results.json`: parsed rows, statistics, comparisons, and geomean
- `run-order.tsv`: run order plus pre/post load and temperature
- `raw/`: console output from all eight runs
- `rejected-chunk32.patch`: diagnostic-only source patch as tested
