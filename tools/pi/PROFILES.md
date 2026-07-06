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

Current fastest tested RTX 3060 settings:

```text
--ctx-size 32768
-fa on
--batch-size 1024
--ubatch-size 1024
--n-gpu-layers all
--n-cpu-moe 5
--cache-type-k q4_0
--cache-type-v q4_0
--no-mmap
--spec-type draft-mtp
--spec-draft-n-max 1
```

Why `--n-cpu-moe 5`?

A Qwen3.6 35B-A3B tuning pass showed that generic layer auto-fit was leaving
speed on the table, but pushing too many MoE experts to CPU caused PCIe/expert
fetch overhead. The sweet spot on the RTX 3060 is to keep almost all experts on
GPU while leaving five MoE layers on CPU to stay just below the 12 GiB VRAM
limit.

| `--n-cpu-moe` | Approx. GPU used | Avg generation tok/s | Notes |
|---:|---:|---:|---|
| none, `--n-gpu-layers auto`, q4_0 KV | ~10.9 GiB | ~55–58 | Previous tuned baseline. |
| 26 | ~6.5 GiB | ~36 | Better than 35/36, still too much CPU expert traffic. |
| 12 | ~10.0 GiB | ~52 | Close to old baseline. |
| 8 | ~10.9 GiB | ~59.6 | Good, but below the knee. |
| 7 | ~11.2 GiB | ~61.8 | Stable. |
| 6 | ~11.4 GiB | ~67.3 | Stable. |
| 5 | ~11.7 GiB | ~70.2 | Current fastest stable profile. |
| 4 | ~11.9 GiB | unstable | Too close to VRAM limit. |
| 2 / 0 | — | failed to load | OOM/allocation failure. |

Why `--spec-draft-n-max 1`?

After the July 2026 merge and MoE placement retune, deeper native MTP draft
windows over-draft on this hardware. A reliable 160-token local prompt sweep
with `q4_0` KV and `--no-mmap` found draft depth 1 faster than depths 2–4.

| Mode | Avg generation tok/s | Notes |
|---|---:|---|
| no speculative | ~52.5 | q4_0 KV, 32k context. |
| draft max 1 | ~58.2 before MoE retune; ~70 with `--n-cpu-moe 5` | Current default. |
| draft max 3 | ~48.9 | Slower on current build/profile. |
| draft max 4 | ~45.4 | Over-drafts. |

KV cache notes:

- `q4_0/q4_0` is the fastest tested cache for the live 32k profile.
- TurboQuant KV cache types (`turbo2`, `turbo3`, `turbo4`) are now registered
  and can load/generate with Flash Attention enabled.
- The video-inspired `--cache-type-k turbo4 --cache-type-v turbo3` combination
  worked at 32k, but measured ~49 tok/s on this RTX 3060/Qwen profile, so it is
  retained for long-context experiments rather than used as the default.
- Quantized V cache requires `-fa on`.

Context-size tradeoff observed on the RTX 3060 before the final MoE retune:

| Context | Prompt tok/s | Generation tok/s | Notes |
|---:|---:|---:|---|
| 262144 | ~587 | ~31.5 | Maximum coherence/context test; slowest. |
| 131072 | ~705 | ~41.9 | Better long-context compromise. |
| 32768 | ~900 | ~52.7 | Fastest older baseline; current tuned profile is ~70 tok/s. |

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
