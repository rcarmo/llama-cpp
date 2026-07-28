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

## Three-size baseline matrix

Each row uses 200 iterations and was load-guarded at a maximum 1-minute load of
2.0. The first 4096 run started at 1.65 load; the larger rows started at 0.82
and 0.81 respectively.

| Size | Kernel | Avg cycles / 32 values | Quantized throughput |
|---:|---|---:|---:|
| 4,096 | q4_0 | 3.18 | 8.58 GB/s |
| 4,096 | q5_0 | 3.71 | 9.54 GB/s |
| 4,096 | q8_0 | 3.05 | 18.01 GB/s |
| 65,536 | q4_0 | 2.02 | 17.21 GB/s |
| 65,536 | q5_0 | 2.50 | 16.92 GB/s |
| 65,536 | q8_0 | 2.25 | 29.02 GB/s |
| 655,360 | q4_0 | 1.95 | 18.08 GB/s |
| 655,360 | q5_0 | 2.51 | 17.21 GB/s |
| 655,360 | q8_0 | 2.25 | 29.69 GB/s |

Raw logs are retained as `/workspace/tmp/simd-matrix-baseline-*.log`; parsed
JSON is `/workspace/tmp/simd-matrix-baseline.json`.

## Accepted unroll matrix: explicit AVX2+VNNI

The current branch was measured with the explicit `avx2-vnni` profile. The
q4_0 65,536 row was repeated under a stricter 1.0 load guard because its first
sample began at 1.55 load and appeared to regress; the verification sample began
at 0.67 load and measured 1.99 cycles, so that load-corrected value is used.

| Size | Kernel | Baseline avg cycles / 32 | Current avg cycles / 32 | Delta | Current start load |
|---:|---|---:|---:|---:|---:|
| 4,096 | q4_0 | 3.18 | 3.14 | -1.3% | 1.92 |
| 4,096 | q5_0 | 3.71 | 3.38 | -8.9% | 1.92 |
| 4,096 | q8_0 | 3.05 | 1.94 | -36.4% | 1.92 |
| 65,536 | q4_0 | 2.02 | 1.99 | -1.5% | 0.67 |
| 65,536 | q5_0 | 2.50 | 2.46 | -1.6% | 1.55 |
| 65,536 | q8_0 | 2.25 | 1.65 | -26.7% | 1.55 |
| 655,360 | q4_0 | 1.95 | 1.88 | -3.6% | 0.58 |
| 655,360 | q5_0 | 2.51 | 2.48 | -1.2% | 0.58 |
| 655,360 | q8_0 | 2.25 | 1.76 | -21.8% | 0.58 |

All nine load-corrected cells are non-regressing. q4/q5 gains are small at the
larger sizes, while q8 consistently benefits from the accepted unroll plus VNNI.
Raw current logs are `/workspace/tmp/simd-matrix-current-vnni-*.log`; the q4
verification is `/workspace/tmp/simd-verify-current-vnni-q4-65536.log`.

## Explicit AVX2 versus AVX2+VNNI

Both explicit profiles pass `test-x86-quant-dot`. Values below use corrected
low-load samples for AVX2 q5_0/65,536 and VNNI q4_0/65,536.

| Size | Kernel | AVX2 cycles / 32 | VNNI cycles / 32 | VNNI delta |
|---:|---|---:|---:|---:|
| 4,096 | q4_0 | 3.53 | 3.14 | -11.1% |
| 4,096 | q5_0 | 3.03 | 3.38 | +11.6% |
| 4,096 | q8_0 | 2.08 | 1.94 | -6.7% |
| 65,536 | q4_0 | 2.22 | 1.99 | -10.4% |
| 65,536 | q5_0 | 2.76 | 2.46 | -10.9% |
| 65,536 | q8_0 | 1.83 | 1.65 | -9.8% |
| 655,360 | q4_0 | 2.06 | 1.88 | -8.7% |
| 655,360 | q5_0 | 2.70 | 2.48 | -8.1% |
| 655,360 | q8_0 | 1.80 | 1.76 | -2.2% |

VNNI wins eight of nine cells. The only regression is q5_0 at the smallest
4,096-value size; larger q5_0 rows improve 8–11%. For this i7, explicit VNNI is
the preferred profile, while explicit AVX2 remains the portable fallback.

## Bounded end-to-end CPU inference gate

Fixed model and parameters: Gemma4 E2B Q4_0, 6 threads, `-ngl 0`, 128 prompt
tokens, 32 generated tokens, one repetition. Runs were guarded to start below
1.0 one-minute load.

| Build | Prompt tok/s | Generation tok/s | Wall time | Start load | End load |
|---|---:|---:|---:|---:|---:|
| baseline `69e55f3e5` native | 182.56 | 18.32 | 5 s | 0.76 | 1.26 |
| current explicit AVX2 | 125.99 | 20.85 | 7 s | 0.51 | 1.39 |
| current explicit AVX2+VNNI | 185.00 | 24.09 | 4 s | 0.49 | 0.53 |

Against the same current commit/profile construction, VNNI improves prompt
throughput by 46.8% and generation throughput by 15.5% over explicit AVX2.
The old native baseline differs by commit/build composition, so its comparison
is directional only: VNNI is +1.3% prompt and +31.5% generation versus that
single baseline sample. These bounded one-repetition numbers are not confidence
intervals, but the VNNI advantage over explicit AVX2 is large enough to retain.
