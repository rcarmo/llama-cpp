# K3 RVV/IME2 campaign baseline — 2026-07-19

Baseline source commit: `26e8b4f869ece5bda3880fc186c0b501ceb2db14`  
Harness commit: `3a6b83638d8b521c90a58a03737a633e5d260a56`  
Annotated tag: `k3-matmul-baseline-20260719`  
Service state: stopped

The model data path remains the tagged baseline; the harness commit changes only scripts and `.gitignore`.

## Environment

- Milk-V K3, 16 visible cores
- Benchmark process inherited CPUs `0-7`; SpaceMIT registered and selected worker mask `ff00` through the K3-specific `/proc/set_ai_thread` mechanism
- The process must not be externally pinned: restricting its inherited affinity prevents backend worker migration and can corrupt IME/TCM execution
- Historical notes disagree on X100/A100 naming versus IME ownership; this campaign records numeric CPU masks, ISA behavior and runtime dispatch instead of inferring capabilities from labels
- 8 benchmark threads
- SpaceMIT IME2 enabled, HPAGE backend, 8 × 393,216-byte TCM blocks
- Q8 KV/service settings do not apply to `llama-bench`
- Prompt and generation cases run in separate processes
- The current backend aborts during teardown after prompt rows, but complete JSONL results are emitted first. The harness validates and records each accepted exit-134 case.

## Gemma 4 E2B QAT

Model: `gemma-4-E2B-it-qat-UD-Q4_K_XL.gguf`  
Size: 2,620,368,960 bytes  
SHA-256: `cd4526493dccbfd6791bee8822e37e30340074d1d4d9aada52ce09afefd6a33a`  
Batch/ubatch: 256/128  
Repetitions: 5

| Test | Median tok/s | Minimum | Maximum | Spread |
|---|---:|---:|---:|---:|
| pp32 | 124.162 | 123.955 | 124.280 | 0.26% |
| pp128 | 131.383 | 131.215 | 131.508 | 0.22% |
| pp512 | 103.998 | 103.952 | 104.111 | 0.15% |
| tg32 | 13.2674 | 13.2629 | 13.2727 | 0.07% |
| tg128 | 13.1655 | 13.1596 | 13.1698 | 0.08% |

Raw artifact directory:

```text
benchmarks/k3-matmul/20260719T232310Z-3a6b83638d8b-gemma-immutable-baseline
```

Artifact checksums:

```text
9b03c0250e0d66fde78cde894927b7f3b8367ae35e6bdff3c43b28328b7752f1  llama-bench.json
f04170689fd7bd83270aa25728ba6fd1fbaf92c30e145ad4caf3c93878a684b0  metadata.json
76b8529cc447b956a0b8231c0407ff1901a48ca19f4ad894279f536aeae1c733  system.txt
```

## Qwen3.6-35B-A3B

Model: `Qwen3.6-35B-A3B-UD-Q4_K_M.gguf`  
Size: 22,134,528,992 bytes  
SHA-256: `917d55fd552445cd47c06648283a6211702d2e5b932eb76b3606f4ebd780e95c`  
Batch/ubatch: 512/128  
Repetitions: 3

| Test | Median tok/s | Minimum | Maximum | Spread |
|---|---:|---:|---:|---:|
| pp64 | 30.5692 | 30.4095 | 30.5845 | 0.57% |
| pp128 | 32.3894 | 31.7506 | 32.5752 | 2.55% |
| tg32 | 6.59122 | 6.55424 | 6.60294 | 0.74% |

Raw artifact directory:

```text
benchmarks/k3-matmul/20260719T232607Z-3a6b83638d8b-a3b-immutable-baseline
```

Artifact checksums:

```text
67cbfa2cf83d1883b25dcd159ef606fa5dd8175d626ffac86f606fb087c6e610  llama-bench.json
1698c5a97826427fa1928fc437df7ebbd8636245ecc59eb9d886df25983347d3  metadata.json
e139beee54c23d4ec66f555b4a8b38bfa463cf9593a9c7d2d4e2dc25cd73b915  system.txt
```

## Comparison policy

- Compare candidates against these medians and their observed ranges.
- Treat changes below 2% as noise unless repeated evidence is substantially tighter.
- Use identical model hashes, batch sizes, thread counts and isolated pp/tg process execution.
- Preserve raw result directories locally; only this manifest is tracked.
