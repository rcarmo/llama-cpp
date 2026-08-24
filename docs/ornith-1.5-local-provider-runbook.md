# Ornith 1.5 local provider on LattePanda Sigma

Ornith 1.5 35B-A3B Q4_K_M is the sole enabled local model service on Sigma. It listens on `127.0.0.1:8095` and exposes a 131,072-token context through `local-ornith/ornith-1.5-35b-a3b-q4-k-m`.

## Selected profile

| Setting | Value |
|---|---|
| Model | `Ornith-1.5-35B-Q4_K_M.gguf` |
| SHA-256 | `ca6ea26329c88b78ffd90a85163be2e746c2fafd1024f56db47e499f117f9a7f` |
| llama.cpp build | `b10579-abdbeadfb` |
| Context | 131,072 tokens, one slot |
| Threads | 12 on CPU range `0-15` |
| Batch / ubatch | 1,024 / 256 |
| K/V cache | Q8_0 / Q8_0 |
| Flash Attention | on |
| MTP | off |
| Load mode | mmap |
| Thermal stop used during tuning | 95 C |

The service environment is installed at `~/.config/llama-ornith-local-provider/service.env`. The tracked example is [`../tools/config/llama-ornith-1.5-local-provider.env.example`](../tools/config/llama-ornith-1.5-local-provider.env.example).

## Measured results

The matched tests used exact 512-token and 32,768-token prompts. The 32K resumed rows reused KV state preserved by llama-server after client interruption; their reported prompt time combines the measured prefix and resumed suffix.

| Profile | Prompt | Generation | Peak PSS | Process swap | Maximum temperature |
|---|---:|---:|---:|---:|---:|
| Q8, FA on, 12 threads, 512 tokens | 43.09 tok/s | 13.74 tok/s | 27.04 GiB | not recorded separately | 72 C |
| Q8, FA on, 12 threads, 32K | 18.07 tok/s | 6.80 tok/s | 26.58 GiB | 7.13 GiB | 91 C |
| Q8, FA on, 8 threads, 32K | 14.04 tok/s | 5.43 tok/s | 28.88 GiB | 0.00 GiB | 90 C |
| F16, FA off, 12 threads, 32K | 34.85 tok/s | 6.42 tok/s | 28.34 GiB | 7.06 GiB | 89 C |
| Q4, FA on, 8 threads, 32K | 13.78 tok/s | 4.57 tok/s | 28.53 GiB | 0.24 GiB | 94 C |
| Q8, FA on, MTP depth 1, 8 threads, 32K | 12.62 tok/s | 3.95 tok/s | 28.74 GiB | 7.54 GiB | 90 C |

Twelve threads improved the Q8 32K prompt rate by 28.7% and generation by 25.2% over eight threads. Q8 retained more memory headroom than F16 during the uninterrupted tests and avoided Q4's lower throughput and stronger KV quantisation.

Built-in MTP was rejected. At 512 tokens, MTP depths 1, 2 and 3 generated 13.15, 10.41 and 9.51 tok/s, compared with 13.64 tok/s target-only. At 32K, Q8 MTP depth 1 accepted 10 of 20 draft tokens and reduced generation from 5.43 to 3.95 tok/s. Generated continuations also differed from the target-only control, so correctness took precedence over speculative throughput.

Raw responses and telemetry are under `/var/home/agent/workspace/reports/ornith-1.5-35b-sigma-2026-08-19/`.

## Service operations

Install or refresh the tracked service files:

```bash
mkdir -p ~/.config/llama-ornith-local-provider ~/.config/systemd/user
cp tools/config/llama-ornith-1.5-local-provider.env.example \
  ~/.config/llama-ornith-local-provider/service.env
cp tools/systemd/user/llama-ornith-local-provider.service \
  ~/.config/systemd/user/llama-ornith-local-provider.service
systemctl --user daemon-reload
systemctl --user enable --now llama-ornith-local-provider.service
```

Check the service:

```bash
systemctl --user status llama-ornith-local-provider.service
curl -fsS http://127.0.0.1:8095/health
curl -fsS http://127.0.0.1:8095/v1/models | jq .
pi --provider local-ornith --model ornith-1.5-35b-a3b-q4-k-m
```

The service conflicts with the Gemma, Maple, Qwen3.6 and Qwen 3.8 units. Their weight files stay in place.

## Validated API behaviour

The deployed profile passed these checks on 20 August 2026:

- OpenAI chat completion returned exactly `OK`;
- a required `get_weather` function produced one schema-valid tool call with `{"city":"Lisbon"}`;
- terminating a client during prompt ingestion cancelled the server task;
- the slot returned to idle without a process restart;
- health remained `ok` and the next chat request returned exactly `OK`;
- a Pi child request through `local-ornith/ornith-1.5-35b-a3b-q4-k-m` returned exactly `ORNITH_OK`.

## Rollback

Stop Ornith before enabling an older service:

```bash
systemctl --user disable --now llama-ornith-local-provider.service
systemctl --user enable --now llama-gemma-local-provider.service
```

The pre-Ornith Pi model registration is saved at `~/.pi/agent/models.json.pre-ornith-20260820`. Restore it only when an older service is available:

```bash
cp ~/.pi/agent/models.json.pre-ornith-20260820 ~/.pi/agent/models.json
```

No model weight file was removed during deployment.
