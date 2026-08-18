# Qwen 3.8 27B Sigma campaign

Keep Gemma 4 E4B as the primary local Pi provider. Qwen 3.8 27B is too slow and leaves too little memory margin on the 32 GiB LattePanda Sigma. Keep its service disabled and use it only for manual compatibility or vision checks.

Campaign date: 18 August 2026. Repository commit: `def3f1649e22833a7b66bd4814804a21f6616396`. Runtime: llama.cpp build 10573, commit `7f3f259a1`, compiled with Clang 22.1.8.

## Model and runtime

The campaign used the official `ggml-org/Qwen3.8-27B-GGUF` revision `0669b98607d47046c7c2b3f801011d54a08cfccf`:

| Artefact | Size | SHA-256 |
|---|---:|---|
| `Qwen3.8-27B-Q4_K_M.gguf` | 18,973,870,432 bytes | `31629f53165ab6a7dad8c9847dcfd1fdf55829dac1e6e748f4a68581b0033d34` |
| `mtp-Qwen3.8-27B-Q4_0.gguf` | 1,680,271,648 bytes | `051a1764cff8c4f3ee6ae8b00593a0364c7539c67fa50ffc58f3f96509fca38e` |
| `mmproj-Qwen3.8-27B-Q8_0.gguf` | 629,247,008 bytes | `2e968a6af97ce35d8971890b257b9b7edabf20ad91450501fa53162a19ee33eb` |

The base model revision is `1d4bf0f2ff6012fd82039f2fa52739d0dd7c60c0`. The model and projector use the Apache 2.0 licence. The campaign retained the existing runtime. Across the target, MTP and vision runs it loaded all three artefacts and passed deterministic chat, strict JSON, required tool-call, server-sent events and cancellation-recovery checks.

## Matched performance

Each prompt contains exactly 512, 4,096 or 32,768 tokens under the Qwen tokenizer. The generation probe uses an exact 512-token prompt and 64 output tokens. Runs used eight strict P-core threads on CPUs 0-7, process affinity 0-15, Q4_0 KV, serial service switching, a below-60 C and load-below-1.5 start gate, and a three-sample 97 C abort rule.

| Profile | pp512 | pp4K | pp32K | tg64 | 512 TTFT | 4K TTFT | 32K TTFT |
|---|---:|---:|---:|---:|---:|---:|---:|
| Qwen 3.8 target | 6.88 tok/s | 6.34 tok/s | 3.21 tok/s | 2.33 tok/s | 74.37 s | 645.79 s | 10,211.61 s |
| Qwen 3.8 MTP-3 | 6.76 tok/s | 6.18 tok/s | not run | 3.47 tok/s | 75.76 s | 662.31 s | not run |

MTP drafted 63 tokens and accepted 42 in the generation probe. It improved decode by 48.7% and reduced the 64-token decode phase from 27.44 to 18.46 seconds. Prompt processing fell by 1.8% at 512 tokens and 2.5% at 4K.

The target-only 32K probe completed all 32,768 prompt tokens and generated one output token. It took 2 hours 50 minutes 12 seconds of server prompt time. The server context was set to 33,024 tokens to retain an output slot.

An MTP 32K probe was not run. The 4K MTP resource result already fails the host memory gate, and the target-only 32K run took almost three hours.

## Existing Sigma models

The prior accepted campaign used the same exact-token protocol and eight-thread CPU placement.

| Model | pp512 | pp4K | pp32K | tg64 | Peak PSS |
|---|---:|---:|---:|---:|---:|
| Maple exact compact | 76.03 | 71.79 | 56.91 | 18.77 | 11.85 GiB |
| Gemma 4 E4B | 65.24 | 60.96 | 44.32 | 25.77 | 11.79 GiB |
| Qwen 3.6 35B-A3B | 31.89 | 26.87 | 10.95 | 11.40 | 13.21 GiB |
| Qwen 3.8 target | 6.88 | 6.34 | 3.21 | 2.33 | 27.87 GiB |
| Qwen 3.8 MTP-3 | 6.76 | 6.18 | not run | 3.47 | 28.97 GiB |

The MTP profile is about 9.7 times slower than Gemma at 512-token prompt processing, 9.9 times slower at 4K and 7.4 times slower at generation. The target-only 32K run is 13.8 times slower than Gemma and 3.4 times slower than Qwen 3.6.

Simon Willison reported about 15-30 generation tok/s on an Apple M3 Ultra and NVIDIA DGX Spark, with about 72% MTP uplift. The Sigma reached 3.47 tok/s with MTP and 48.7% uplift. The reported machines have different memory and compute architectures, so those rates are reference points rather than acceptance thresholds.

## Memory, swap, faults and temperature

| Probe | Peak PSS | Process swap | Host swap-in delta | Major-fault delta | Peak temperature |
|---|---:|---:|---:|---:|---:|
| Target 512 | 27.87 GiB | 0 | 65 pages | 74 | 84 C |
| Target 4K | 27.87 GiB | 0 | 1,136 pages | 1,215 | 95 C |
| Target 32K | 27.43 GiB | 70 MiB | 32,128 pages | 33,075 | 95 C |
| MTP 512 | 27.09 GiB | 209 MiB | 37,228 pages | 37,267 | 85 C |
| MTP 4K | 28.97 GiB | 2.73 GiB | 724,477 pages | 724,877 | 93 C |
| MTP generation | 28.83 GiB | 62 MiB | 282 pages | 302 | 85 C |

No run reached three consecutive samples at or above 97 C. The target 32K cgroup recorded a 27.6 GiB memory peak and 1.7 GiB swap peak. The completed API corpus service recorded 29.6 GiB memory and 857 MiB swap; an earlier client-timeout activation reached 29.9 GiB memory and 7.6 GiB swap. These systemd peaks varied between activations, but every MTP result leaves inadequate operating margin.

## Cache, API and Pi results

The clean cached-prefix pair processed 4,096 tokens at 6.24 tok/s on the first request. The second request restored 4,092 tokens and reprocessed four tokens in 1.07 seconds. Same-slot cache reuse works, but the profile has one slot and no separate RAM prompt-state cache.

| Model | Bounded API corpus | Real Pi tasks |
|---|---:|---:|
| Maple | 4/6 | 3/4 |
| Gemma | 4/6 | 3/4 |
| Qwen 3.6 | 3/6 | 4/4 |
| Qwen 3.8 | 4/6 | 2/4 |

Qwen 3.8 passed bounded refusal, cached follow-up, exact JSON instruction and valid required-tool syntax. `implementation-debug` and `repository-planning` both exhausted the 1,024-token response limit. Its `search_repository` call used `max_results: 20`; Gemma remains the only compared model that obeyed the requested value of 3.

The Pi suite used `--thinking low`. Qwen 3.8 passed the constrained edit and independent test, and recovered after client cancellation. Repository retrieval and exact-reply processes exited 0 but emitted no visible final text. The objective result is therefore 2/4, below every model in the prior matched campaign.

## Vision

The Q8_0 projector passed the red-square fixture. The response was: `The image features a solid red square.` The request used 93 prompt tokens and generated nine tokens at 3.40 tok/s. The normal service omits the projector; its file is a further 600 MiB.

## Deployment

The installed user unit listens only on `127.0.0.1:8094`, is disabled, and conflicts with the resident Gemma, Maple and Qwen 3.6 units. A local Pi entry exists for `local-qwen38/qwen3.8-27b-q4km-mtp`, but Pi's active model remains `opencode-zen/minimax-m2.5-free`.

Use Qwen 3.8 only when Qwen 3.8 compatibility or its vision projector is specifically required. Do not enable the service at login and do not replace Gemma. Target-only mode is slow but avoids the MTP draft model's worst swap pressure. MTP remains an evaluation option because its 48.7% decode gain does not compensate for the memory risk or the 7.4-fold generation deficit against Gemma.

The original services are active and healthy on ports 8091, 8093 and 8090. Qwen 3.8 is inactive and disabled. Maple rollback remains commits `7f3f259a17` and `78616cbad`, endpoint `127.0.0.1:8093`, model SHA-256 `fd68a5f315189367dfae84d44fc066386e2d37ba6544f529304f21d482f24db4`. The campaign baseline and upstream were `def3f1649e22833a7b66bd4814804a21f6616396`; the evidence was committed locally after validation and was not pushed. No default-provider setting was changed.
