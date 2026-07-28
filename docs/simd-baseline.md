# SIMD performance baseline

Baseline commit: `69e55f3e593db9c31829c1502a9124be9653424d`

## Host

- CPU: 12th Gen Intel Core i7-12700 exposed through KVM
- vCPUs: 6, one thread per exposed core
- Compiler: GCC/G++ 13.3.0
- Build: Release, `GGML_NATIVE=ON`, `-march=native`, CPU-only
- Relevant flags: AVX2, FMA, F16C, AVX-VNNI
- Load snapshot before baseline build: 0.60 / 0.61 / 0.56
- Baseline `llama-bench` incremental build: 6 seconds with `-j 2`; ending load 0.66 / 0.63 / 0.57

## Focused q*_0 vec-dot baseline

Command pattern:

```bash
./build-simd-test/bin/test-quantize-perf \
  --type TYPE --op vec_dot_q --size 4096 --iterations 200
```

| Kernel | Minimum cycles / 32 values | Average cycles / 32 values | Quantized throughput |
|---|---:|---:|---:|
| q4_0 x q8_0 | 2.95 | 3.38 | 7.80 GB/s |
| q5_0 x q8_0 | 3.62 | 4.04 | 9.71 GB/s |
| q8_0 x q8_0 | 2.95 | 3.05 | 18.85 GB/s |

Raw outputs are retained under `/workspace/tmp/q{4,5,8}-avx2-perf-4096-baseline.log`.

## End-to-end CPU baseline

Model: `/workspace/models/gguf-misc/gemma-4-E2B-it-qat-UD-Q4_K_XL.gguf`

Fixed command:

```bash
./build-simd-test/bin/llama-bench \
  -m /workspace/models/gguf-misc/gemma-4-E2B-it-qat-UD-Q4_K_XL.gguf \
  -ngl 0 -t 6 -p 128 -n 32 -r 1 -o json
```

Measured at baseline commit `69e55f3e5`:

| Workload | Throughput | Wall time | Start load (1/5/15m) | End load (1/5/15m) |
|---|---:|---:|---:|---:|
| Prompt, 128 tokens | 182.56 tok/s | 0.70 s | 0.76 / 0.64 / 0.57 | 1.26 / 0.75 / 0.61 |
| Generation, 32 tokens | 18.32 tok/s | 1.75 s | 0.76 / 0.64 / 0.57 | 1.26 / 0.75 / 0.61 |

The complete command process took 5 seconds. Raw JSON and load snapshots are retained under `/workspace/tmp/simd-baseline-llama-bench.json` and `/workspace/tmp/simd-baseline-llama-bench-load.txt`. Single-repetition numbers are intentionally bounded and should be treated as directional, not confidence intervals.

## Explicit CPU build profiles

The reproducible profile scripts are `tools/simd-build-profiles.sh` and
`tools/simd-inspect-profile.sh`.

| Profile | Effective flags | Quant-dot instructions | Build duration | Load change (1m) |
|---|---|---|---:|---:|
| `avx2` | `-mavx -mavx2 -mfma -mf16c`, VNNI off | `vpmaddubsw`, `vpmaddwd`, `vfmadd231ps` | 47 s | 0.57 → 1.46 |
| `avx2-vnni` | AVX2 flags plus `-mavxvnni` | `vpdpbusd`, `vfmadd231ps` | 49 s | 0.53 → 1.41 |
| `native` | `-march=native` | `vpdpbusd`, `vfmadd231ps` | 50 s | 0.45 → 1.39 |

Raw build and disassembly reports are retained under
`/workspace/tmp/simd-build-*.log` and `/workspace/tmp/simd-inspect-*.txt`.
