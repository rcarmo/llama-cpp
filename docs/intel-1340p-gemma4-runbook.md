# Intel i5-1340P Gemma 4 E4B runbook

This runbook records the validated 128K Gemma 4 E4B model profile on the LattePanda Sigma: a separate four-block assistant model with MTP depth 3, F16 KV cache and Flash Attention disabled. The deployed two-slot Pi provider is documented in [`gemma-local-provider-runbook.md`](gemma-local-provider-runbook.md).

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
| Target architecture | `gemma4` |
| Assistant architecture | `gemma4-assistant`, four MTP blocks |
| Validated context | 131,072 tokens; 124,112-token prompt completed |

The CPU masks, paths and memory limits are host-specific. Repeat the parameter and pressure gates before using this profile on another machine.

## Model files

Target model:

```text
/var/home/agent/workspace/projects/models/gemma-4-e4b-qat-mtp/gemma-4-E4B_q4_0-it.gguf
676c35070db6dbe52f93e9c864ee0fba4eddea94b9c875d9cb10daff453fbaee
```

Assistant model:

```text
/var/home/agent/workspace/projects/models/gemma-4-e4b-qat-mtp/gemma-4-E4B-it-qat-assistant-MTP-Q8_0.gguf
49d8367f8e1a507ef6196a7eeed790b2797bc649568f431c10bce03f574f6ffc
```

Optional multimodal projector:

```text
/var/home/agent/workspace/projects/models/gemma-4-e4b-qat-mtp/gemma-4-E4B-it-mmproj.gguf
7498a37cb619e55f2fcf87eb931f56e99389ed6d432e4c5c66110694c0d65578
```

Verify the required target and assistant models:

```bash
sha256sum \
  /var/home/agent/workspace/projects/models/gemma-4-e4b-qat-mtp/gemma-4-E4B_q4_0-it.gguf \
  /var/home/agent/workspace/projects/models/gemma-4-e4b-qat-mtp/gemma-4-E4B-it-qat-assistant-MTP-Q8_0.gguf
```

If provisioning the optional projector, verify it separately:

```bash
sha256sum /var/home/agent/workspace/projects/models/gemma-4-e4b-qat-mtp/gemma-4-E4B-it-mmproj.gguf
```

The service launcher in this runbook is text-only. It does not pass `--mmproj`. Multimodal mode is not part of the tracked validation in this repository and was not included in the 32K promotion gate.

## Selected profile

| Setting | Value |
|---|---:|
| Context per request | 131,072 |
| Validation geometry | 1 isolated slot |
| Deployed geometry | 2 isolated slots, 262,144 aggregate context |
| MTP depth | 3 |
| Assistant blocks available | 4 |
| KV type | F16 K and V |
| Flash Attention | off |
| Batch / ubatch | 1024 / 256 |
| Threads | 8 |
| Model loading | mmap |
| Prompt reuse | enabled |
| Deployed RAM prompt-cache limit | 12,288 MiB, allocated on demand |

The earlier 32K gate compared F16 KV with Flash Attention off against Q8_0 KV with Flash Attention enabled in a balanced control/candidate/candidate/control sequence:

| Profile | Prompt | Generation | Wall |
|---|---:|---:|---:|
| Q8_0, Flash on | 54.08 tok/s | 23.59 tok/s | 61.06 s |
| F16, Flash off | **61.19 tok/s** | **25.30 tok/s** | **54.05 s** |

The selected profile improved prompt throughput by 13.16%, generation throughput by 7.24% and wall time by 12.97%. All repetitions produced the same required tool call and accepted 31 of 39 draft tokens.

MTP depth 4 was tested but rejected: it generated 21.50 tok/s versus 22.01 tok/s for depth 3 in the original Q8_0/Flash-on depth sweep.

## Capacity and thermal envelope

The combined validation used a 32K context, a 12,481-token prompt and an 8 GiB post-load pressure holder:

| Metric | Result |
|---|---:|
| Prompt throughput | 54.53 tok/s |
| Generation throughput | 17.92 tok/s |
| Wall time | 231.46 s |
| Draft acceptance | 32/42 |
| Peak PSS | 8,143,534 KiB |
| Process major faults | 377 |
| Peak package temperature | 86 C |

The request completed with the expected `search_repository` tool call and no material swap-in.

Raw evidence:

- `benchmarks/intel-1340p/ornith-gemma-optimization/gemma-kv-flash-gate/summary.json`
- `benchmarks/intel-1340p/ornith-gemma-optimization/promoted-validation/gemma4-d3-f16-faoff-ctx32k-p8/`

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
source tools/config/llama-gemma4-candidate.env.example
set +a
LLAMA_DRY_RUN=1 tools/run-intel-candidate.sh
```

The deployment profile command must contain:

```text
--ctx-size 262144
--parallel 2
--no-kv-unified
--cont-batching
--cache-type-k f16
--cache-type-v f16
--flash-attn off
--spec-draft-n-max 3
--model-draft ...gemma-4-E4B-it-qat-assistant-MTP-Q8_0.gguf
```

## Install the local-provider service

Use the dedicated Gemma service; do not install the deployment profile through the shared `llama-candidate.service` trial unit.

```bash
cd /var/home/agent/workspace/projects/llama-cpp
install -Dm0600 tools/config/llama-gemma4-candidate.env.example \
  ~/.config/llama-gemma-local-provider/service.env
install -Dm0644 tools/systemd/user/llama-gemma-local-provider.service \
  ~/.config/systemd/user/llama-gemma-local-provider.service
systemctl --user daemon-reload
systemctl --user enable --now llama-gemma-local-provider.service
```

The tracked profile binds to `127.0.0.1:8091` and does not configure an API key. Keep it loopback-only. Pi provider registration, loginless startup and safe update procedures are in [`gemma-local-provider-runbook.md`](gemma-local-provider-runbook.md).

## Health and API checks

These are operator procedures for a running service. The campaign validator forces one isolated slot regardless of the two-slot deployment settings, then checks loopback health, deterministic completion, exact draft acceptance, telemetry and clean shutdown. It does not install or enable a service.

Run the no-install validator:

```bash
cd /var/home/agent/workspace/projects/llama-cpp
tools/validate-intel-candidate.sh gemma4
```

```bash
curl -fsS http://127.0.0.1:8091/health | jq .
curl -fsS http://127.0.0.1:8091/slots | jq '[.[] | {id, n_ctx, speculative, is_processing}]'
curl -fsS http://127.0.0.1:8091/metrics | grep '^llamacpp:' | head
curl -fsS --compressed http://127.0.0.1:8091/ -o /tmp/gemma4-ui.html
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

Confirm MTP is active in the response timings:

```text
draft_n > 0
draft_n_accepted > 0
```

## Monitoring

```bash
systemctl --user status llama-gemma-local-provider.service
journalctl --user -u llama-gemma-local-provider.service -f
pid=$(systemctl --user show llama-gemma-local-provider.service -p MainPID --value)
grep -E 'VmRSS|VmSwap' /proc/$pid/status
cat /proc/$pid/io
cat /sys/class/thermal/thermal_zone1/temp
```

Stop new long requests if sustained package temperature approaches or exceeds the validated 90 C peak, swap-in grows, or PSS materially exceeds the validated 10.9 GiB peak.

## Operations

```bash
systemctl --user restart llama-gemma-local-provider.service
systemctl --user stop llama-gemma-local-provider.service
systemctl --user disable --now llama-gemma-local-provider.service
journalctl --user -u llama-gemma-local-provider.service --since today
```

After rebuilding `build-intel-clang`, restart the service to use the new binary.

## Troubleshooting

### Service fails before health

```bash
journalctl --user -u llama-gemma-local-provider.service -n 200 --no-pager
set -a
source ~/.config/llama-gemma-local-provider/service.env
set +a
sha256sum "$LLAMA_MODEL" "$LLAMA_DRAFT_MODEL"
```

Check both model paths and checksums. `gemma4-assistant` cannot initialise by itself; it requires the target context. Always launch it through `--model-draft` with the Gemma target.

### `Gemma4Assistant requires ctx_other to be set`

The assistant was launched without the target/assistant pairing. Restore `LLAMA_MODEL`, `LLAMA_DRAFT_MODEL` and `LLAMA_MTP_DEPTH=3` from the tracked example.

### `V cache quantization requires flash_attn`

The selected profile uses F16 KV with Flash Attention off. This error means the active environment was changed to a quantised V cache while leaving Flash Attention disabled. Restore the tracked profile.

### Performance is below the gate

Check that the active service uses:

```text
8 threads
CPUs 0-7 for model workers
F16 K/V
Flash Attention off
MTP depth 3
batch 1024 / ubatch 256
```

Also check competing processes, package temperature, swap activity and whether another llama service is running.

### Draft acceptance is zero

Inspect the server command and logs for the assistant model. The launcher must include `--model-draft`, `--spec-type draft-mtp` and `--spec-draft-n-max 3`.

## Rollback to Qwen 128K

Stop Gemma and restore the tracked Qwen service profile:

```bash
systemctl --user disable --now llama-gemma-local-provider.service
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
Gemma passed near-capacity 128K validation with 124,112 prompt tokens, 22.49 prompt tok/s, 4.49 generation tok/s, 29/42 draft acceptance, 11141 MiB peak PSS and 90 C peak package temperature. The selected profile is context 131072, batch 1024, ubatch 256, F16 KV and Flash Attention off. Qwen remains the rollback baseline.
<!-- INTEL_128K_STATUS_END -->
