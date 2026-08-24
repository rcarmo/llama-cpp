# Gemma 4 E4B local Pi provider

The user service `llama-gemma-local-provider.service` exposes Gemma 4 E4B through the OpenAI Chat Completions API on `127.0.0.1:8091`. Pi registers it as `local-gemma/gemma-4-e4b-qat-mtp`. The hosted default remains unchanged.

## Deployed configuration

| Item | Value |
|---|---|
| Pi provider/model | `local-gemma/gemma-4-e4b-qat-mtp` |
| API | `openai-completions` |
| Endpoint | `http://127.0.0.1:8091/v1` |
| Context per request | 131,072 tokens |
| Aggregate server context | 262,144 tokens |
| Maximum output advertised by Pi | 32,768 tokens |
| Concurrent slots | 2 independent KV streams |
| Admission behaviour | 2 live requests; further requests enter llama.cpp's deferred queue |
| Continuous batching | Enabled |
| Prompt-state cache limit | 12,288 MiB, allocated on demand |
| Idle-slot cache admission | Enabled |
| KV reuse chunk | 256 tokens |
| Context checkpoints | 32, spaced by at least 8,192 tokens |
| Server socket timeout | 10,800 seconds |
| Slot-state directory | `~/.cache/llama-candidates/gemma4/slots/` |

`LLAMA_CTX=262144` is the total context for two non-unified streams. Each slot is 131,072 tokens, so Pi's model registry must retain `contextWindow: 131072`. The 32,768-token output cap is enforced by Pi's `models.json` entry; llama-server does not set a lower global generation cap.

Two requests execute concurrently. Three or four callers run in two-request waves. llama.cpp defers excess tasks until a slot is free; this build does not document a finite deferred-queue limit. Clients should set request deadlines and cancellation rules. `LLAMA_HTTP_TIMEOUT=10800` controls socket reads and writes; it is not a queue-admission deadline.

The service is workspace-coupled: the installed unit executes `tools/run-intel-candidate.sh`, while the environment file names the workspace build and GGUF files. Moving, rebuilding or deleting those paths changes the live service.

Validated artefacts:

| Artefact | Identity |
|---|---|
| llama.cpp source/build | commit `4196ec8088080522bb0828b2960accc59b8ee1b0`, server build 10504 |
| Target GGUF | `gemma-4-E4B_q4_0-it.gguf`, SHA-256 `676c35070db6dbe52f93e9c864ee0fba4eddea94b9c875d9cb10daff453fbaee` |
| MTP assistant GGUF | `gemma-4-E4B-it-qat-assistant-MTP-Q8_0.gguf`, SHA-256 `49d8367f8e1a507ef6196a7eeed790b2797bc649568f431c10bce03f574f6ffc` |
| Pi CLI | 0.83.0 |

The model directory also contains an `mmproj` file, but this provider is registered for text input only and does not load it.

## Selected role

Gemma remains the primary local Pi provider. In the matched 5-6 August 2026 campaign it generated at 25.77 tok/s, faster than Maple at 18.77 tok/s and Qwen at 11.40 tok/s. Prompt throughput was 65.24, 60.96 and 44.32 tok/s at exact 512, 4,096 and 32,768-token inputs.

Gemma scored 4/6 on bounded API cases and 3/4 on real Pi tasks. It alone obeyed the requested `max_results: 3` tool limit. Its repository-retrieval answer cited the wrong source path and function, so Qwen remains an explicit alternative when repository grounding matters more than latency. The blind substantive review ranked Gemma first.

Campaign report: [`../benchmarks/intel-1340p/maple-qwen-campaign/report.md`](../benchmarks/intel-1340p/maple-qwen-campaign/report.md).

Repository files:

- `tools/run-intel-candidate.sh`
- `tools/config/llama-gemma4-candidate.env.example`
- `tools/systemd/user/llama-gemma-local-provider.service`
- `docs/gemma-local-provider-runbook.md`
- `docs/gemma-local-provider-benchmark-2026-08-02.md`

Installed files:

- `~/.config/llama-gemma-local-provider/service.env`
- `~/.config/systemd/user/llama-gemma-local-provider.service`
- `$PI_CODING_AGENT_DIR/models.json`, currently `~/.pi/agent/models.json`

## Install or update the service

Build llama.cpp and place both GGUF files at the paths in `tools/config/llama-gemma4-candidate.env.example` before installing the service.

```bash
set -euo pipefail
root=/var/home/agent/workspace/projects/llama-cpp
mkdir -p ~/.config/llama-gemma-local-provider ~/.config/systemd/user
if [[ -f ~/.config/llama-gemma-local-provider/service.env ]]; then
  cp -a ~/.config/llama-gemma-local-provider/service.env \
    ~/.config/llama-gemma-local-provider/service.env.bak-$(date +%Y%m%dT%H%M%S)
fi
install -m 0600 \
  "$root/tools/config/llama-gemma4-candidate.env.example" \
  ~/.config/llama-gemma-local-provider/service.env
install -m 0644 \
  "$root/tools/systemd/user/llama-gemma-local-provider.service" \
  ~/.config/systemd/user/llama-gemma-local-provider.service

export XDG_RUNTIME_DIR=/run/user/$(id -u)
export DBUS_SESSION_BUS_ADDRESS=unix:path=$XDG_RUNTIME_DIR/bus
systemctl --user daemon-reload
systemctl --user enable --now llama-gemma-local-provider.service
```

For unattended startup after reboot, verify user lingering:

```bash
loginctl show-user "$(id -un)" -p Linger
```

The validated host reports `Linger=yes`. Enabling it on another host requires host administrator privileges:

```bash
sudo loginctl enable-linger "$(id -un)"
```

Before updating a running service, inspect `/slots` and avoid interrupting active requests:

```bash
curl -fsS http://127.0.0.1:8091/slots \
  | jq '[.[] | {id, is_processing, task_id}]'
```

Install updated files, run `systemctl --user daemon-reload`, then restart the unit only when both slots are idle:

```bash
curl -fsS http://127.0.0.1:8091/slots \
  | jq -e 'all(.[]; (.is_processing // false) == false)'
systemctl --user restart llama-gemma-local-provider.service
```

## Register the Pi provider

`PI_CODING_AGENT_DIR` is authoritative for this runtime:

```bash
printf '%s\n' "$PI_CODING_AGENT_DIR"
# /var/home/agent/.pi/agent
```

Back up the registry, then merge only the `local-gemma` provider. This preserves every unrelated provider and does not modify either settings file.

```bash
set -euo pipefail
models="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/models.json"
cp -a "$models" "$models.bak-local-gemma-$(date +%Y%m%dT%H%M%S)"
tmp=$(mktemp "${models}.tmp.XXXXXX")
trap 'rm -f "$tmp"' EXIT

jq '.providers["local-gemma"] = {
  "baseUrl": "http://127.0.0.1:8091/v1",
  "api": "openai-completions",
  "apiKey": "local",
  "compat": {
    "supportsDeveloperRole": false,
    "supportsReasoningEffort": false,
    "supportsStore": false,
    "supportsStrictMode": false,
    "supportsOpenAIGrammarTools": false,
    "maxTokensField": "max_tokens",
    "thinkingFormat": "chat-template",
    "chatTemplateKwargs": {
      "enable_thinking": {"$var": "thinking.enabled"}
    }
  },
  "models": [{
    "id": "gemma-4-e4b-qat-mtp",
    "name": "Gemma 4 E4B QAT MTP (Local 128K)",
    "reasoning": true,
    "input": ["text"],
    "contextWindow": 131072,
    "maxTokens": 32768,
    "cost": {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0}
  }]
}' "$models" > "$tmp"

jq empty "$tmp"
chmod --reference="$models" "$tmp"
chown --reference="$models" "$tmp"
mv "$tmp" "$models"
trap - EXIT
```

Check the provider and hosted-default invariants:

```bash
jq '.providers["local-gemma"]' \
  "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/models.json"
jq '{defaultProvider, defaultModel}' \
  "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/settings.json"
pi --list-models local-gemma
```

On the validated host, the authoritative default must remain `github-copilot/gpt-5.6-terra`. The workspace settings file remains `openai-codex/gpt-5.4`; it is not authoritative while `PI_CODING_AGENT_DIR=/var/home/agent/.pi/agent`.

## Operate and diagnose

```bash
export XDG_RUNTIME_DIR=/run/user/$(id -u)
export DBUS_SESSION_BUS_ADDRESS=unix:path=$XDG_RUNTIME_DIR/bus

systemctl --user status llama-gemma-local-provider.service
systemctl --user show llama-gemma-local-provider.service \
  -p MainPID -p NRestarts -p MemoryCurrent -p MemoryPeak -p TasksCurrent
journalctl --user -u llama-gemma-local-provider.service -f
```

Check the HTTP service and slot geometry:

```bash
curl -fsS http://127.0.0.1:8091/health | jq .
curl -fsS http://127.0.0.1:8091/v1/models | jq .
curl -fsS http://127.0.0.1:8091/slots \
  | jq '[.[] | {id, n_ctx, is_processing, task_id, speculative}]'
```

Healthy output contains two slots with `n_ctx: 131072` and `speculative: true`. Both `is_processing` values are `true` at saturation. Excess callers may not appear in `/slots` because they are still deferred.

Inspect host headroom:

```bash
free -h
cat /proc/pressure/cpu
cat /proc/pressure/memory
cat /proc/pressure/io
awk '{printf "package temperature: %.1f C\n", $1/1000}' \
  /sys/class/thermal/thermal_zone1/temp
```

## Validate the API

Basic Chat Completions:

```bash
curl -fsS http://127.0.0.1:8091/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "model":"gemma-4-e4b-qat-mtp",
    "messages":[{"role":"user","content":"Reply with exactly LOCAL_GEMMA_OK"}],
    "temperature":0,
    "max_tokens":32,
    "chat_template_kwargs":{"enable_thinking":false}
  }' | jq '{content:.choices[0].message.content, usage, timings}'
```

Required function calling:

```bash
curl -fsS http://127.0.0.1:8091/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "model":"gemma-4-e4b-qat-mtp",
    "messages":[{"role":"user","content":"Get Lisbon weather in Celsius"}],
    "tools":[{"type":"function","function":{
      "name":"get_weather","description":"Get weather",
      "parameters":{"type":"object","properties":{
        "city":{"type":"string"},
        "unit":{"type":"string","enum":["celsius","fahrenheit"]}
      },"required":["city","unit"],"additionalProperties":false}
    }}],
    "tool_choice":"required","temperature":0,"max_tokens":256,
    "chat_template_kwargs":{"enable_thinking":false}
  }' | jq '.choices[0].message.tool_calls'
```

SSE streaming:

```bash
curl -fsS -N http://127.0.0.1:8091/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "model":"gemma-4-e4b-qat-mtp",
    "messages":[{"role":"user","content":"Reply with exactly STREAM_OK"}],
    "temperature":0,"max_tokens":32,"stream":true,
    "stream_options":{"include_usage":true},
    "chat_template_kwargs":{"enable_thinking":false}
  }'
```

The stream must contain content deltas, a terminal usage object and `data: [DONE]`.

## Select the model in Pi

List the model without changing the current session:

```bash
pi --list-models local-gemma
```

Start a new interactive session explicitly with Gemma:

```bash
pi --provider local-gemma --model gemma-4-e4b-qat-mtp
```

Run an isolated smoke request:

```bash
pi -p --provider local-gemma --model gemma-4-e4b-qat-mtp \
  --thinking off --no-session --tools '' \
  'Reply with exactly PI_CONCURRENT_GEMMA_OK'
```

In Piclaw, select `local-gemma/gemma-4-e4b-qat-mtp` for the intended chat. Do not edit `defaultProvider` or `defaultModel` when the hosted default must remain in place.

## Roll back concurrency only

To restore the original single-slot geometry while retaining the provider, edit the installed environment file:

```bash
sed -i \
  -e 's/^LLAMA_CTX=262144$/LLAMA_CTX=131072/' \
  -e 's/^LLAMA_PARALLEL=2$/LLAMA_PARALLEL=1/' \
  ~/.config/llama-gemma-local-provider/service.env
```

Wait for both slots to become idle, then restart the service. When an existing environment file is replaced, the install/update procedure creates a timestamped `service.env.bak-*` file; a first installation has no prior file to back up. A full-file restore may discard later environment changes, so inspect the selected backup before installing it.

## Remove the provider

Stop and disable the local server:

```bash
export XDG_RUNTIME_DIR=/run/user/$(id -u)
export DBUS_SESSION_BUS_ADDRESS=unix:path=$XDG_RUNTIME_DIR/bus
systemctl --user disable --now llama-gemma-local-provider.service
```

Remove only the Pi provider entry:

```bash
set -euo pipefail
models="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/models.json"
cp -a "$models" "$models.bak-before-local-gemma-removal-$(date +%Y%m%dT%H%M%S)"
tmp=$(mktemp "${models}.tmp.XXXXXX")
trap 'rm -f "$tmp"' EXIT
jq 'del(.providers["local-gemma"])' "$models" > "$tmp"
jq empty "$tmp"
chmod --reference="$models" "$tmp"
chown --reference="$models" "$tmp"
mv "$tmp" "$models"
trap - EXIT
```

Timestamped `models.json.bak-local-gemma-*` files exist from installation. Restoring a full backup can discard unrelated provider edits made later; prefer the targeted deletion.

Remove installed service files:

```bash
rm -f ~/.config/systemd/user/llama-gemma-local-provider.service
rm -rf ~/.config/llama-gemma-local-provider
systemctl --user daemon-reload
```

The prompt-cache limit is in RAM. `~/.cache/llama-candidates/gemma4/slots/` stores only explicitly saved slot-state files and is empty on the validated host. Remove it only after the service stops and only when saved states are no longer needed:

```bash
rm -rf ~/.cache/llama-candidates/gemma4/slots/
```

Removing the provider does not remove workspace builds, model GGUF files or repository changes.

## Acceptance evidence

Validated on 2 August 2026:

- health, model discovery and two-slot geometry passed;
- basic generation, required function calling and SSE passed;
- a repeated 5,747-token prompt reused 5,741 tokens and processed 6;
- two isolated 131,072-token slots admitted two live requests with no swap activity;
- fixed-workload c2 wall time changed from 55.45 s queued to 54.69 s concurrent;
- fixed-workload c4 wall time changed from 108.30 s to 105.37 s in two waves;
- the accepted c4 run peaked at 12,400,510 KiB PSS and 88 C, with no swap-in, swap-out or major faults;
- `pi --list-models local-gemma` discovered the model;
- an isolated Pi request returned `PI_CONCURRENT_GEMMA_OK`;
- the service remained active with zero restarts and the hosted defaults stayed unchanged.

Detailed workload and candidate results are in [gemma-local-provider-benchmark-2026-08-02.md](gemma-local-provider-benchmark-2026-08-02.md).
