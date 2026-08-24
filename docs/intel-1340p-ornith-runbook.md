# Intel i5-1340P Ornith 1.0 35B runbook

This runbook defines the validated 128K candidate profile for Ornith 1.0 35B on `sigma`: one 131,072-token slot, embedded MTP depth 2, F16 KV cache and Flash Attention disabled.

## Hardware and software

| Item | Value |
|---|---|
| Host | `sigma` |
| CPU | Intel Core i5-1340P |
| Logical CPUs | 0-15 |
| Model workers | CPUs 0-7, 8 threads |
| Process mask | CPUs 0-15 |
| RAM | 31 GiB |
| Swap | 8 GiB zram |
| Repository | `/var/home/agent/workspace/projects/llama-cpp` |
| Build | `build-intel-clang` |
| Validated source | `603f26c869b6700eaa5c6d52068ed583419eeacf` |
| Model architecture | `qwen35moe` with one embedded NextN/MTP layer |
| Validated context | 131,072 tokens; 124,341-token prompt completed |

The CPU masks, paths and memory limits are host-specific. Repeat the parameter and pressure gates before using this profile on another machine.

## Model files

Target model:

```text
/var/home/agent/workspace/projects/models/ornith-1.0-35b-mtp-apex/Ornith-1.0-35B-MTP-APEX-I-Mini.gguf
```

SHA-256:

```text
91358f1059f029330de497e8c5637869347374468e98ca13fa4357cd8a811a4d
```

Optional multimodal projector:

```text
/var/home/agent/workspace/projects/models/ornith-1.0-35b-mtp-apex/mmproj-F16.gguf
a516ab92e8240da4734d68352bdfba84c16e830ee40010b8fac80d69c77272ff
```

Verify the required target model:

```bash
sha256sum /var/home/agent/workspace/projects/models/ornith-1.0-35b-mtp-apex/Ornith-1.0-35B-MTP-APEX-I-Mini.gguf
```

If provisioning the optional projector, verify it separately:

```bash
sha256sum /var/home/agent/workspace/projects/models/ornith-1.0-35b-mtp-apex/mmproj-F16.gguf
```

The service launcher in this runbook is text-only. It does not pass `--mmproj`. Multimodal mode is not part of the tracked validation in this repository and was not included in the 32K promotion gate.

## Selected profile

| Setting | Value |
|---|---:|
| Context | 131,072 |
| Slots | 1 |
| MTP depth | 2 |
| KV type | F16 K and V |
| Flash Attention | off |
| Batch / ubatch | 1024 / 256 |
| Threads | 8 |
| Model loading | mmap |
| Prompt reuse | enabled |
| Separate RAM prompt cache | disabled |
| Expert advice | off |

The earlier 32K gate compared F16 KV with Flash Attention off against Q8_0 KV with Flash Attention enabled in a balanced control/candidate/candidate/control sequence:

| Profile | Prompt | Generation | Wall |
|---|---:|---:|---:|
| Q8_0, Flash on | 35.16 tok/s | 14.95 tok/s | 91.32 s |
| F16, Flash off | **37.53 tok/s** | **16.65 tok/s** | **85.41 s** |

The selected profile improved prompt throughput by 6.73%, generation throughput by 11.32% and wall time by 6.92%. All repetitions produced the same required tool call and accepted 37 of 42 draft tokens.

## Capacity and thermal envelope

The combined validation used a 32K context, an 11,288-token prompt and an 8 GiB post-load pressure holder:

| Metric | Result |
|---|---:|
| Prompt throughput | 33.50 tok/s |
| Generation throughput | 14.77 tok/s |
| Wall time | 341.07 s |
| Draft acceptance | 39/40 |
| Peak PSS | 15,809,691 KiB |
| Process major faults | 7,105 |
| Peak package temperature | 86 C |

The request completed with the expected `search_repository` tool call. There was no material swap-in. All 960 sampled routed-expert ranges were resident, so expert advice and a separate raw expert cache are disabled.

Raw evidence:

- `benchmarks/intel-1340p/ornith-gemma-optimization/ornith-kv-flash-gate/summary.json`
- `benchmarks/intel-1340p/ornith-gemma-optimization/promoted-validation/ornith-d2-f16-faoff-ctx32k-p8/`
- `benchmarks/intel-1340p/ornith-gemma-optimization/validation/semantic-replay/`

## Build

Build the accepted CPU backend:

```bash
cd /var/home/agent/workspace/projects/llama-cpp
BUILD_JOBS=2 tools/build-intel-1340p.sh
```

The build helper uses rootless Podman, Clang, native x86 ISA, AVX-VNNI and OpenMP. It runs `test-x86-quant-dot` before returning success.

## Dry run

Check the complete command without starting the server:

```bash
cd /var/home/agent/workspace/projects/llama-cpp
set -a
source tools/config/llama-ornith-candidate.env.example
set +a
LLAMA_DRY_RUN=1 tools/run-intel-candidate.sh
```

The command must contain:

```text
--ctx-size 131072
--cache-type-k f16
--cache-type-v f16
--flash-attn off
--spec-draft-n-max 2
```

## Install the candidate service

The Ornith and Gemma profiles share `llama-candidate.service` and the active file `~/.config/llama-candidate/service.env`. Installing this profile replaces the active candidate configuration.

Stop conflicting services first:

```bash
systemctl --user disable --now llama-qwen-longctx.service 2>/dev/null || true
systemctl --user disable --now llama-candidate.service 2>/dev/null || true
```

Install the Ornith profile and unit:

```bash
cd /var/home/agent/workspace/projects/llama-cpp
install -Dm0644 tools/config/llama-ornith-candidate.env.example \
  ~/.config/llama-candidate/service.env
install -Dm0644 tools/systemd/user/llama-candidate.service \
  ~/.config/systemd/user/llama-candidate.service
systemctl --user daemon-reload
systemctl --user enable --now llama-candidate.service
```

The tracked profile binds to `127.0.0.1:8091` and does not configure an API key. Keep it loopback-only unless an authenticated reverse proxy or trusted-network policy is in place.

For loginless startup:

```bash
loginctl enable-linger "$USER"
```

## Health and API checks

These are operator procedures for a running service. The campaign also validated the tracked profile through `tools/validate-intel-candidate.sh`: loopback health, one 32K speculative slot, deterministic completion with 2/2 draft acceptance, telemetry and clean shutdown. It did not install or enable `llama-candidate.service`.

Run the no-install validator:

```bash
cd /var/home/agent/workspace/projects/llama-cpp
tools/validate-intel-candidate.sh ornith
```

```bash
curl -fsS http://127.0.0.1:8091/health | jq .
curl -fsS http://127.0.0.1:8091/slots | jq '.[0] | {n_ctx, speculative, is_processing}'
curl -fsS http://127.0.0.1:8091/metrics | grep '^llamacpp:' | head
curl -fsS --compressed http://127.0.0.1:8091/ -o /tmp/ornith-ui.html
```

Expected slot context:

```text
131072
```

Minimal deterministic request:

```bash
curl -fsS http://127.0.0.1:8091/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "messages":[{"role":"user","content":"Reply exactly OK"}],
    "temperature":0,
    "max_tokens":16,
    "chat_template_kwargs":{"enable_thinking":false}
  }' | jq '{content:.choices[0].message.content,timings}'
```

## Monitoring

```bash
systemctl --user status llama-candidate.service
journalctl --user -u llama-candidate.service -f
pid=$(systemctl --user show llama-candidate.service -p MainPID --value)
grep -E 'VmRSS|VmSwap' /proc/$pid/status
cat /proc/$pid/io
cat /sys/class/thermal/thermal_zone1/temp
```

Expert counters are observational in this profile; advice is off:

```bash
curl -fsS http://127.0.0.1:8091/metrics | grep '^llamacpp:expert_io_'
```

Stop new long requests if sustained package temperature approaches or exceeds the validated 91 C peak, swap-in grows, or PSS materially exceeds the validated 23.3 GiB peak.

## Operations

```bash
systemctl --user restart llama-candidate.service
systemctl --user stop llama-candidate.service
systemctl --user disable --now llama-candidate.service
journalctl --user -u llama-candidate.service --since today
```

After rebuilding `build-intel-clang`, restart the service to use the new binary.

## Troubleshooting

### Service fails before health

```bash
journalctl --user -u llama-candidate.service -n 200 --no-pager
set -a
source ~/.config/llama-candidate/service.env
set +a
sha256sum "$LLAMA_MODEL"
```

Check the model path, checksum, build binary and `libomp` runtime under `build-intel-clang/runtime`.

### `V cache quantization requires flash_attn`

The selected profile uses F16 KV with Flash Attention off. This error means the active environment was changed to a quantised V cache while leaving Flash Attention disabled. Restore the tracked profile.

### Performance is below the gate

Check that the active service uses:

```text
8 threads
CPUs 0-7 for model workers
F16 K/V
Flash Attention off
MTP depth 2
batch 1024 / ubatch 256
```

Also check competing processes, package temperature, swap activity and whether another llama service is running.

### High page faults under pressure

The 32K pressure test recorded 7,105 process major faults but completed without material swap-in. Do not enable bounded/adaptive expert advice by default: both modes reduced generation throughput in the campaign.

## Rollback to Qwen 128K

Stop the candidate and restore the tracked Qwen service profile:

```bash
systemctl --user disable --now llama-candidate.service
cd /var/home/agent/workspace/projects/llama-cpp
install -Dm0644 tools/config/llama-qwen-longctx.env.example \
  ~/.config/llama-qwen-longctx/service.env
install -Dm0644 tools/systemd/user/llama-qwen-longctx.service \
  ~/.config/systemd/user/llama-qwen-longctx.service
systemctl --user daemon-reload
systemctl --user enable --now llama-qwen-longctx.service
```

Verify Qwen health on port 8090:

```bash
curl -fsS http://127.0.0.1:8090/health | jq .
```

<!-- INTEL_128K_STATUS_BEGIN -->
Ornith passed near-capacity 128K validation with 124,341 prompt tokens, 13.14 prompt tok/s, 2.63 generation tok/s, 37/44 draft acceptance, 23857 MiB peak PSS and 91 C peak package temperature. The selected profile is context 131072, batch 1024, ubatch 256, F16 KV and Flash Attention off. Qwen remains the rollback baseline.
<!-- INTEL_128K_STATUS_END -->
