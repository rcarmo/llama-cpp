# Qwen3.6 35B-A3B RTX 3060 routing profile

`production-routing.csv` is the durable decode-routing profile used by the selected RTX 3060 service.

## Provenance

Generated on 2026-08-26 at repository commit `b1d2c5c6cd0903f959e097ed2b1009fa5991eabb` with `llama-moe-trace` and:

- model: `Qwen3.6-35B-A3B-UD-Q2_K_XL-MTP.gguf`;
- all non-expert layers on CUDA;
- first five routed-MoE layers on CPU;
- 32,768-token context;
- q4_0/q4_0 KV;
- batch/ubatch 1024;
- no-mmap loading;
- five representative prompts: coding, constrained tool use, debugging, architecture reasoning, and repository context.

The checked-in CSV contains decode rows only:

```text
32,840 rows
821 decode steps
40 MoE layers
256 experts/layer
8 selected experts/token
SHA-256: 9f00d597bdd75217adb29a10539cb48030dfa78e27e48a49bc1bc3a5a58d92ef
```

Static-oracle simulated hit rates were 39.3%, 56.6%, 77.5%, 88.7%, and 94.0% for 16, 32, 64, 96, and 124 slots respectively.

## Selected deployment

The production launcher selects 36 slots per CPU-resident MoE layer:

```bash
GGML_MOE_CACHE_PROFILE=tools/pi/profiles/qwen36-35b-a3b/production-routing.csv
GGML_MOE_CACHE_SLOTS=36
```

Matched six-request measurements at exact 32K service settings:

| Mode | Prompt tok/s | Generation tok/s | Peak process VRAM |
|---|---:|---:|---:|
| Cache off | 1185.17 | 72.51 | 11,424 MiB |
| 36 slots | 1190.89 | 77.75 | 11,598 MiB |

Generation improved 7.2% with no prompt regression in the promotion matrix. A 29,020-token prompt completed at 1193.55 prompt tok/s. Client cancellation/recovery and a sustained 1,024-token generation completed successfully.

Final post-deployment six-request measurement on the service port:

```text
five full 256-token requests: 79.66 generation tok/s
all six requests, including one early EOG: 77.86 generation tok/s
prompt average: 1180.37 tok/s
peak Qwen process VRAM: 11,598 MiB
```

Against the matched cache-off baseline of 72.51 generation tok/s and 1185.17 prompt tok/s, the full-length deployed result is approximately 9.9% faster in generation with a 0.4% prompt reduction. Device-wide headroom is tight when unrelated GPU processes are present; slot 40 and above are not production-safe at 32K.

## Important correctness note

Moving cached expert matmuls from CPU quantized kernels to CUDA kernels introduces expected floating-point trajectory differences. Outputs remain deterministic within one configuration, but cache-off and cache-on greedy text is not byte-identical. Backend semantic tests, target/MTP stability, generated-token counts, and request validity are the acceptance gates.

## Refresh procedure

Refresh this profile after a material model, quantization, router, workload, or graph change:

1. capture multiple representative traces with `llama-moe-trace`;
2. keep decode rows (`pos >= 0`);
3. concatenate them into `production-routing.csv`;
4. run `tools/moe-trace/simulate.py`;
5. repeat the exact production slot sweep and acceptance gates;
6. update this file with the new commit, SHA-256, and measurements.
