# Intel Core i5-1340P Qwen3.6 inference campaign

The Clang 22 native CPU build on the i5-1340P beats the published SpaceMIT K3 Q4 generation baseline by 99.8% and its pp128 result by 65.5%. CPU inference is the default on this machine. Iris Xe Vulkan is correct but slower for generation.

Date: 31 July 2026
Source commit: `5021f638b27ddb71e2402c3131da72c2a2e42573`
Branch: `perf/intel-1340p-vulkan-20260731`

## Hardware and build

- CPU: Intel Core i5-1340P, four P-cores with SMT and eight E-cores.
- ISA: AVX2, FMA, F16C and AVX-VNNI; no AVX-512 or AMX.
- Memory: 31 GiB usable LPDDR-class unified memory.
- GPU: Intel Iris Xe RPL-P, Mesa 26.1.5, Vulkan Tier 1, FP16 and integer dot product.
- CPU build: Clang 22.1.8, `Release`, `GGML_NATIVE=ON`, `GGML_AVX_VNNI=ON`, OpenMP.
- Placement: eight threads restricted to logical CPUs 0-7, covering the four P-cores.
- Benchmark geometry: batch 512, microbatch 128, five repetitions in one loaded process; prompt and generation cases use separate processes.

`tools/build-intel-1340p.sh` reproduces the CPU build in Fedora 44. `tools/intel-benchmark.sh` records raw JSON, RSS and temperatures. `tools/run-intel-qwen.sh` starts the accepted server profiles.

## Installed models

| Model | File bytes | SHA-256 |
|---|---:|---|
| Qwen3.6 27B Q2_K_XL + MTP | 12,040,512,640 | `16fb3f81a522faaecfed0402890c3471e970e732c0e3e1914f1c0d9d9253be00` |
| Qwen3.6 35B-A3B Q2_K_XL + MTP | 12,574,128,416 | `ed7cda7e38985b4fcff76475865135039641d2bfbac3c169df15ca770f37fb0c` |
| Qwen3.6 35B-A3B Q4_K_XL + MTP | 22,853,663,008 | `55983c5a75a1ab969824077b3bb3de4146e82a9234072b48ad4e8f92ad3fe9f1` |

All files passed `sha256sum -c` against Hugging Face LFS object hashes.

## Final CPU results

Values are mean tokens/s over five repetitions. The median is included because the mobile CPU changes frequency under sustained load.

| Model | Test | Mean tok/s | Median | Standard deviation | Range |
|---|---|---:|---:|---:|---:|
| 35B-A3B Q4_K_XL | pp64 | 48.521 | 48.585 | 2.862 | 44.215-51.361 |
| 35B-A3B Q4_K_XL | pp128 | 53.608 | 53.580 | 0.538 | 52.830-54.222 |
| 35B-A3B Q4_K_XL | tg32 | 13.166 | 13.210 | 0.184 | 12.868-13.321 |
| 35B-A3B Q2_K_XL | pp64 | 28.749 | 28.888 | 0.412 | 28.086-29.154 |
| 35B-A3B Q2_K_XL | pp128 | 28.807 | 28.952 | 0.319 | 28.394-29.147 |
| 35B-A3B Q2_K_XL | tg32 | 14.895 | 14.924 | 0.213 | 14.616-15.164 |
| 27B Q2_K_XL | pp64 | 4.464 | 4.508 | 0.064 | 4.392-4.516 |
| 27B Q2_K_XL | pp128 | 4.335 | 4.325 | 0.034 | 4.295-4.378 |
| 27B Q2_K_XL | tg32 | 2.909 | 2.908 | 0.002 | 2.908-2.912 |

The dense 27B model is limited by memory bandwidth. The 35B-A3B model activates about 3B parameters per token and is much faster despite its larger file.

## K3 comparison

The K3 strict baseline used Qwen3.6 35B-A3B `UD-Q4_K_M`, eight threads, batch 512 and microbatch 128. This campaign uses the requested `UD-Q4_K_XL`, so the comparison is conservative but not byte-identical.

| Test | K3 median tok/s | i5-1340P Q4_K_XL mean | Difference |
|---|---:|---:|---:|
| pp64 | 30.569 | 48.521 | +58.7% |
| pp128 | 32.389 | 53.608 | +65.5% |
| tg32 | 6.591 | 13.166 | +99.8% |

All margins exceed the campaign's 2% promotion threshold.

## MTP service results

The server used one 4K slot, eight P-core threads, batch 2048, microbatch 512, Q8_0 K/V cache and 128 generated tokens. Values below use the last warm request of each three-request sequence.

| Model | Target only | MTP draft-1 | Accepted drafts | Decision |
|---|---:|---:|---:|---|
| 35B-A3B Q4_K_XL | 12.396 tok/s | 14.946 tok/s | 57/69, 82.6% | enable MTP |
| 35B-A3B Q2_K_XL | 13.945 tok/s | 15.319 tok/s | 59/67, 88.1% | enable MTP |
| 27B Q2_K_XL | 2.883 tok/s | 2.868 tok/s | 58/68, 85.3% | disable MTP |

Q4 MTP is 90.3% faster than the K3 live-service mean of 7.855 tok/s and 46.8% faster than its older 10.182 tok/s campaign result.

## CPU topology and compiler choices

Eight threads on CPUs 0-7 were best for the 35B-A3B models. Four physical P-core threads reached 10.95 tg32. Twelve mixed P/E threads reached 9.32; sixteen threads reached 8.19. The E-cores and extra scheduling traffic reduce generation throughput.

Clang 22 with native ISA reached 13.16 tg32 and 53.82 pp128 in the selection run. The explicit GCC AVX-VNNI baseline reached 12.07 tg32 and 45.49 pp128. The accepted build uses Clang native.

## Profiler result

Whole-token profiling of Q4 tg32 recorded 5.151 seconds of graph time:

| Family | Wall time | Share |
|---|---:|---:|
| Matrix | 4.187 s | 81.3% |
| Other | 0.737 s | 14.3% |
| Recurrent | 0.116 s | 2.2% |
| Copy | 0.078 s | 1.5% |
| Attention | 0.022 s | 0.4% |

`MUL_MAT_ID` used 2.116 seconds and `MUL_MAT` used 2.071 seconds. Recurrent and copy changes have too little measured leverage for a source patch on this host.

## AVX-VNNI and Tunney experiment

The repository already applies a two-block independent-accumulator unroll to q4_0, q5_0 and q8_0. Native Clang emits `vpdpbusd` for these paths with no vector spills.

A focused Q2_K/Q4_K candidate replaced `vpmaddwd` plus add sequences with AVX-VNNI `vpdpwssd`. It passed an expanded x86 correctness test and emitted the intended instruction without vector spills. A controlled library-only A/B rejected it:

| Path | Baseline | Candidate | Difference |
|---|---:|---:|---:|
| Q2_K microbenchmark | 1.93 cycles/32 | 1.95 | -1.0% |
| Q4_K microbenchmark | 2.99 cycles/32 | 3.01 | -0.7% |
| Q2-A3B tg32 | 15.138 tok/s | 15.160 tok/s | +0.14% |
| Q4 tg32 | 13.065 tok/s | 13.088 tok/s | +0.17% |

The candidate is below the 2% gate. Inline assembly would encode the same dependency chain and constrain Clang's register allocation, so no assembly patch is accepted. `vnni-kquant-ab/rejected-candidate.patch` preserves the exact tested change.

Q4_K eligible dense matrices use the existing eight-row repacked AVX2 kernel. Q2_K repacking requires AVX-512 and is unavailable on this CPU. These dispatch differences explain why a vec-dot microbenchmark cannot predict the complete model result.

## Iris Xe Vulkan

Vulkan detected the hardware Iris Xe device, not llvmpipe. The focused `MUL_MAT_ID`, `RMS_NORM`, `ROPE` and `SOFT_MAX` corpus passed 1,544/1,544 cases.

| Model/profile | Generation tok/s | CPU result | Decision |
|---|---:|---:|---|
| 35B-A3B Q2 full offload | 9.90 | 14.90 | CPU |
| 35B-A3B Q4, 10 layers | 7.62 | 13.17 | CPU |
| 27B Q2 full offload | 1.72 | 2.91 | CPU generation |

The dense 27B prompt path improves from about 4.0 tok/s on CPU to 16.8 tok/s on Vulkan, but generation regresses. Shared LPDDR bandwidth and CPU/GPU synchronisation dominate on this unified-memory device.

## Memory and operating limits

- Q4 llama-bench peaked near 31,022,516 KiB RSS. Use one slot and a 4K context by default. Stop other memory-heavy processes before loading it.
- 35B-A3B Q2 used about 12,661,452 KiB RSS.
- 27B Q2 used about 13,434,604 KiB RSS.
- CPU package temperature reached 85 C during the sustained Q4 prompt campaign without a crash.
- RAPL energy counters were not exposed, so this campaign does not report energy per token.
- The host's 8 GiB swap is a safety net, not model capacity. Swapping weights will collapse throughput.

## Accepted launch profiles

```bash
# Q4 quality profile; MTP enabled
LLAMA_PORT=8080 tools/run-intel-qwen.sh qwen36-35b-a3b-q4

# Q2 fast MoE profile; MTP enabled
LLAMA_PORT=8080 tools/run-intel-qwen.sh qwen36-35b-a3b-q2

# Dense 27B; MTP disabled
LLAMA_PORT=8080 tools/run-intel-qwen.sh qwen36-27b-q2
```

All three launchers returned `{"status":"ok"}` in 1K smoke tests. Q4 and Q2-A3B also completed the 4K MTP service campaign. Override `LLAMA_CTX`, `LLAMA_PORT`, `LLAMA_CPUS`, `LLAMA_THREADS`, `LLAMA_BUILD` or `LLAMA_MODELS` as needed.

## Evidence

- Final repeated results: `final/`
- MTP service responses: `mtp-q4/` and `mtp-models/`
- Whole-token profile: `profiles/q4-whole-token.log`
- Topology and Vulkan sweeps: `sweeps/` and `smoke/`
- Rejected VNNI A/B: `vnni-kquant-ab/`
- Launcher health checks: `launcher-smoke/`
