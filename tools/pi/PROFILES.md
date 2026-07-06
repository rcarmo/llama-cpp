# Pi llama.cpp profiles and tuning notes

These profiles were tuned on the Pi/Piclaw RTX 3060 12 GiB workstation for
interactive local use. They are intentionally concrete: paths, ports, cache
settings, and service names match the deployment on that host.

## Hardware baseline

```text
GPU: NVIDIA GeForce RTX 3060
VRAM: 12 GiB
CPU: Intel Core i7-12700 class host
llama.cpp build: CUDA, `GGML_CUDA=ON`, native CPU backend
shared port: 8090
```

Only one heavyweight model service should own port `8090` and the GPU at a
time. Before large model benchmarks, stop llama services and restart/stop
GPU-heavy Docker containers such as ComfyUI/InvokeAI/Jupyter if they have stale
CUDA allocations.

## Services

| Service | Launch script | Intended use |
|---|---|---|
| `llama-gemma-e2b-qat.service` | `bin/run-gemma-e2b-qat-cuda.sh` | Current default fast interactive Gemma 4 E2B QAT + MTP server. |
| `llama-gemma-e4b-qat.service` | `bin/run-gemma-e4b-qat-cuda.sh` | Larger Gemma 4 E4B QAT + MTP trial; flash attention is disabled due startup instability seen on this box. |
| `llama-qwen36-27b-mtp.service` | `bin/run-qwen36-27b-mtp-cuda.sh` | Qwen3.6 35B-A3B Q2 native-MTP speed/long-context profile. Name is historical. |
| `llama-qwen35b-a3b.service` | `bin/run-qwen35b-a3b-cuda.sh` | Older Qwen 35B A3B profile retained for reference. |
| `llama-ui-search-mcp.service` | `llama-ui-search-mcp/search_mcp.py` | Safe web-search MCP exposed to llama-ui via proxy. |

## Current preferred profile: Gemma E2B QAT + MTP

Script:

```text
bin/run-gemma-e2b-qat-cuda.sh
```

Key settings:

```text
--spec-type draft-mtp
--spec-draft-n-max 1
--batch-size 4096
--ubatch-size 2048
--ctx-size 131072
--parallel 2                 # 65536 context tokens per slot
--cache-type-k f16
--cache-type-v f16
--cache-prompt
--cache-reuse 1024
--n-gpu-layers 999
```

Why `--spec-draft-n-max 1`?

A controlled sweep on the RTX 3060 showed that deeper MTP drafting over-drafted
for this model/prompt mix. Lowering the draft count increased generation speed.

Natural-EOS sweep:

| Draft max | Avg generation tok/s | Drafted | Accepted |
|---:|---:|---:|---:|
| 4 | 123.88 | 376 | 66 |
| 3 | 153.00 | 273 | 70 |
| 2 | 185.76 | 184 | 68 |
| 1 | 187.24 | 98 | 48 |

Forced 180-token sweep with `ignore_eos=true`:

| Mode | Avg generation tok/s | Drafted | Accepted |
|---|---:|---:|---:|
| no speculative | 152.93 | — | — |
| draft max 4 | 147.40 | 347 | 91 |
| draft max 2 | 185.26 | 202 | 78 |
| draft max 1 | 186.23 | 122 | 56 |

Conclusion: on this hardware, `draft_n_max=1` is the best default for Gemma E2B
QAT + MTP; `2` is close enough to re-test for different workloads.

## Qwen3.6 35B-A3B Q2 native-MTP profile

Script:

```text
bin/run-qwen36-27b-mtp-cuda.sh
```

Despite the script name, this profile currently points at:

```text
Qwen3.6-35B-A3B-UD-Q2_K_XL-MTP.gguf
```

Fastest tested practical settings for the 26k-token smoke prompt plus current
drafter tuning:

```text
--ctx-size 32768
-fa on
--batch-size 1024
--ubatch-size 1024
--n-gpu-layers auto
--cache-type-k f16
--cache-type-v f16
--spec-type draft-mtp
--spec-draft-n-max 3
```

Why `--spec-draft-n-max 3`?

A forced 180-token sweep on the RTX 3060 showed that the previous draft depth of
4 over-drafted for this model/prompt mix. Unlike Gemma E2B, Qwen benefited from
a moderate draft depth rather than the minimum depth.

| Mode | Avg generation tok/s | Drafted | Accepted |
|---|---:|---:|---:|
| no speculative | 28.85 | — | — |
| draft max 4 | 25.96 | 230 | 121 |
| draft max 3 | 40.76 | 159 | 125 |
| draft max 2 | 38.52 | 142 | 107 |
| draft max 1 | 34.91 | 95 | 84 |

Conclusion: keep `draft_n_max=3` as the current Qwen default on this hardware;
`2` is close enough to re-test for other prompt distributions.

Context-size tradeoff observed on the RTX 3060:

| Context | Prompt tok/s | Generation tok/s | Notes |
|---:|---:|---:|---|
| 262144 | ~587 | ~31.5 | Maximum coherence/context test; slowest. |
| 131072 | ~705 | ~41.9 | Better long-context compromise. |
| 32768 | ~900 | ~52.7 | Fastest; fits the 26k prompt smoke test. |

Manual `llama-bench` offload findings:

```text
ngl=40 was fastest in tiny/medium bench,
but fixed ngl=40 could not allocate large 128k server KV/cache buffers.
For the 32k live profile, auto fitting was the safer operational default.
```

## Agents-A1 APEX-I-Mini trial

The model was downloaded and tested, then removed:

```text
mudler/Agents-A1-APEX-GGUF
Agents-A1-APEX-I-Mini.gguf
sha256/etag: 17ed2881c7ccaf855eeecfb9ff39cf85ade638a0a15e2e4367387ccd8657260f
```

Findings:

```text
Valid GGUF v3, qwen35moe, 40 blocks, 256 experts, 8 used.
Stable server profile: ctx=32768, batch=512, ubatch=512, ngl=35, -fa on.
VRAM was extremely tight: ~11.8 GiB used, ~100 MiB free.
Smoke generation: ~36.5 tok/s on a tiny prompt.
```

Verdict: it runs, but it is not the preferred RTX 3060 profile. The file is not
kept by default.

## Safe llama-ui MCP setup

The llama server is started with:

```text
--ui-mcp-proxy
--ui-config-file /workspace/.pi/llama-ui-config.json
```

`config/llama-ui-config.json` exposes only the local safe web-search MCP:

```text
http://127.0.0.1:8092/sse
```

Do not use broad unsafe llama-ui `--agent` mode for this setup; prefer bounded
custom MCP services.

## Operational checklist

Benchmarking a large model:

```bash
systemctl --user stop llama-qwen36-27b-mtp.service \
  llama-gemma-e4b-qat.service \
  llama-gemma-e2b-qat.service

# If VRAM is still occupied, restart/stop likely GPU containers:
docker restart comfyui invokeai jupyter

nvidia-smi
```

Restart current preferred profile:

```bash
systemctl --user restart llama-gemma-e2b-qat.service
curl -s http://127.0.0.1:8090/slots | python3 -m json.tool
```

Check active binary/version:

```bash
pgrep -af '^.*/llama-server .*--port 8090'
/workspace/projects/llama.cpp/llama.cpp/build-cuda/bin/llama-server --version
```
