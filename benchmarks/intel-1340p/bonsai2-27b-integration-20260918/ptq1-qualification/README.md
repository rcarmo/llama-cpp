# Bonsai 2 27B PTQ1_0 qualification on Intel Core i5-1340P

PTQ1_0 full Vulkan offload reached 25.5768 prompt tok/s and 0.4763 generation tok/s on Sigma. It accelerates prompt ingestion but does not replace the PQ2_0 CPU profile, which generates at 1.4846 tok/s.

## Inputs

| Item | Value |
|---|---|
| Host | LattePanda Sigma, Intel Core i5-1340P, 31 GiB RAM, Intel Iris Xe |
| Branch | `feat/bonsai2-ptq1-integration` |
| Hadamard dependency | `685c6cdf0` |
| Adapted PTQ1 implementation | `62f4bbb72` |
| Test registration | `4a3950bb8` |
| Current Vulkan matrix fix | `e96d552c0` |
| Unsupported-operation boundary | `a21384cf8` |
| Coopmat2 exclusion | `a9ca156ea` |
| Model | `Ternary-Bonsai-2-27B-PTQ1_0.gguf` |
| Model repository revision | `6ed5e12bf84b7a63069882c91dd9e9218647d17b` |
| File size | 5,946,648,928 bytes |
| SHA-256 | `53107f530aa52eb00912263ab1ee29bd199261c87cd7b4ad4ca1318c1fe33ee3` |
| GGUF `general.file_type` | `143` |
| Tensor format | `PTQ1_0`, 1.75 bits per weight, group 128 |

The Vulkan build uses GCC 16.1.1, `GGML_NATIVE=ON`, `GGML_OPENMP=ON` and `GGML_VULKAN=ON`. The tested server launcher has SHA-256 `a743126659be6866db407552dc24bf330aa01ba31eec4fa15e2d5f8749025879`. The post-boundary `libggml-vulkan.so` has SHA-256 `9b6dea6bc47e457c3a63ad568a9d12ffd49de15122934b5c3083ef661b2c47f3`; shared libraries contain most server implementation code.

## Integration

Prism commits `#137` and `#148` were adapted to the current local source. The current Vulkan backend generates one quantised matrix shader for several tensor types. Prism's older per-type PTQ matrix branch therefore needed four current-source additions:

- PTQ1 type ID `143` in `ggml_type_ids.glsl`;
- a `block_ptq1_0` buffer alias;
- matrix load width 8;
- runtime ternary decoding in `mul_mm_funcs.glsl`.

Without these additions, PTQ matvec tests passed for `n <= 8`, but the matrix path selected for larger `n` produced infinite error in 11 cases. Commit `e96d552c0` adds the missing current-source path. Commit `a21384cf8` stops the backend from advertising PTQ quantised copy and set-row operations that have no released shader pipeline. Contiguous PTQ-to-PTQ copies continue through the generic byte-preserving path. Commit `a9ca156ea` excludes PTQ from both coopmat2 pipeline-creation loops because `dequant_funcs_cm2.glsl` has no PTQ decoder. PTQ remains in scalar and coopmat1 loops. Iris Xe exposes neither coopmat1 nor coopmat2 matrix cores, so the coopmat2 boundary is source-checked and compile-checked rather than device-executed.

## Focused tests

| Backend | Operation | Result |
|---|---|---:|
| CPU | PTQ1 `MUL_MAT` | 47/47 |
| CPU | PTQ1 `GET_ROWS` | 8/8 |
| Vulkan | PTQ1 `MUL_MAT` | 30/30 |
| Vulkan | PTQ1 `GET_ROWS` | 8/8 |
| CPU | `MUL_MAT_HADAMARD` | 28/28 |
| Vulkan | `MUL_MAT_HADAMARD` | 28/28 |

`test-quantize-fns` and `test-ptq1_0-element-map` also passed. Test logs are in this directory. The retained support probes confirm that Vulkan F32/PTQ conversions and PTQ set-row operations report unsupported; contiguous same-type PTQ copies remain supported. Unsupported shape/type combinations are reported as skips by `test-backend-ops`; they are not counted as passing PTQ executions.

## Performance

The standard runs use `llama-bench`, 512 prompt tokens, 128 generated tokens, one repetition, context-independent default batch settings and the same model file. CPU uses `--device none -ngl 0 -fa off`; Vulkan and hybrid runs use `-fa on`.

| Profile | Threads | Prompt tok/s | Generation tok/s | Unit peak | Unit swap |
|---|---:|---:|---:|---:|---:|
| PTQ1 CPU, `-ngl 0` | 12 | 0.9854 | **0.7958** | 1.2 GiB | 0 B |
| PTQ1 hybrid, `-ngl 16` | 8 | 7.3774 | 0.5843 | 6.5 GiB | 0 B |
| PTQ1 full Vulkan, `-ngl 99` | 12 | **25.5768** | 0.4763 | 6.7 GiB | 0 B |

Full Vulkan prompt processing is 25.96 times the PTQ1 CPU rate. It is 12.24 times the published PQ2_0 CPU prompt rate of 2.0901 tok/s. Full Vulkan generation is 40.14% slower than PTQ1 CPU and 67.92% slower than the published PQ2_0 CPU rate of 1.4846 tok/s.

A short screen also tested CPU at 4 and 12 threads, GPU layers 16, 32, 48 and 99, and full Vulkan at 4 and 12 threads. More offload increased prompt throughput and reduced generation throughput monotonically. The 16-layer split was the fastest tested hybrid generation result, but remained below PTQ1 CPU and PQ2_0 CPU.

These are one-repetition qualification runs. Thermal telemetry and sustained-load variance were not measured.

## Server gates

The full-Vulkan PTQ server passed:

- `/health` and `/v1/models` with exact PTQ1 path and metadata;
- non-streaming output `BONSAI_PTQ1_OK`;
- SSE reconstruction of `BONSAI_PTQ1_STREAM_OK`, followed by `[DONE]`;
- forced OpenAI-style `get_weather` tool selection with `{"city":"Lisbon"}`;
- embedded root UI delivery with normal browser gzip support;
- zero cgroup swap, zero restarts and clean shutdown.

The CPU server independently returned `BONSAI_PTQ1_OK`. The Vulkan and CPU outputs therefore matched for the deterministic exact-answer request. The Vulkan tool request processed 287 prompt tokens at 25.6761 tok/s and generated 28 tokens at 0.4757 tok/s.

The root UI payload is 12,639 bytes after curl decompression and has SHA-256 `4ab280087a87e416e289ace909b912837cc7156749c3e089d24ba93419f24b04`, matching the verified local UI input. A client that omits `Accept-Encoding: gzip` receives HTTP 415 by design from this gzip-only embedded build.

Every benchmark and server process ran in a transient user unit with `MemorySwapMax=0` and `MemoryMax=24G`. Unit logs report 0 B swap. The global zram device already contained unrelated pages; global counters moved during primary shutdown and restoration, outside the constrained benchmark units.

## Decision

The PTQ1 implementation and Iris Xe Vulkan path are accepted for source integration. No PTQ service is installed or enabled. The existing static PQ2_0 CPU profile remains the Bonsai interactive test profile because its generation rate is higher.

Gemma primary was restored after every guarded run. The final state reports the expected model, zero restarts and zero current/peak service swap.

`artifact-inventory.tsv` lists the retained evidence. `evidence.sha256` verifies every retained artefact except itself.
