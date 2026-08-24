# Maple Preview local Pi provider

The user service `llama-maple-local-provider.service` exposes Maple Preview on `127.0.0.1:8093`. Pi registers the model as `local-maple/maple-preview-tq2-exact-head`. The hosted default stays unchanged.

## Configuration

| Item | Value |
|---|---|
| Endpoint | `http://127.0.0.1:8093/v1` |
| Context per request | 131,072 tokens |
| Aggregate context | 262,144 tokens |
| Slots | 2 independent KV streams |
| Model | Exact TQ2_0/F32 head |
| KV | F16 |
| Threads | 8 on logical CPUs 0-7 |
| Batch / ubatch | 2,048 / 512 |
| Prompt-state cache | 12,288 MiB |
| Context checkpoints | 32, minimum spacing 8,192 tokens |

The server restores whole prompt prefixes from the RAM prompt-state cache. Maple uses different RoPE dimensions across SWA and global layers. llama.cpp disables KV shifting and partial chunk reuse for this model. Context shifting is also disabled. Requests must fit in one 131,072-token slot.

## Selected role

Maple is the prompt-heavy local alternative. In the matched 5-6 August 2026 campaign it processed exact 512, 4,096 and 32,768-token prompts at 76.03, 71.79 and 56.91 tok/s, faster than Gemma and Qwen at all three sizes. It generated at 18.77 tok/s.

Maple scored 4/6 on bounded API cases and 3/4 on real Pi tasks. Its repository retrieval timed out after 600 seconds and kept the server busy until restart. The blind substantive review ranked Maple third. Use Maple when prompt-ingestion speed matters; keep Gemma as the primary local model for general interactive work.

The accepted exact TQ2/F32 representation retains 2880/2880 routes, hidden/logit NRMSE below 1e-6, 15/15 top-1 agreement and 32/32 mean top-32 overlap. Faster generic Q8 and TQ2/Q8-head variants failed the exact-quality tier. No additional weight conversion was promoted.

Campaign report: [`../benchmarks/intel-1340p/maple-qwen-campaign/report.md`](../benchmarks/intel-1340p/maple-qwen-campaign/report.md).

Validated source files:

- `tools/run-intel-maple-provider.sh`
- `tools/config/llama-maple-provider.env.example`
- `tools/systemd/user/llama-maple-local-provider.service`
- `benchmarks/intel-1340p/maple-preview/production-context/`

## Install or update

Stop the transient validation server before installation. Install the profile and unit, then start the user service:

```bash
set -euo pipefail
root=/var/home/agent/workspace/projects/llama-cpp
mkdir -p ~/.config/llama-maple-local-provider ~/.config/systemd/user
install -m 0600 \
  "$root/tools/config/llama-maple-provider.env.example" \
  ~/.config/llama-maple-local-provider/service.env
install -m 0644 \
  "$root/tools/systemd/user/llama-maple-local-provider.service" \
  ~/.config/systemd/user/llama-maple-local-provider.service

export XDG_RUNTIME_DIR=/run/user/$(id -u)
export DBUS_SESSION_BUS_ADDRESS=unix:path=$XDG_RUNTIME_DIR/bus
systemctl --user daemon-reload
systemctl --user enable --now llama-maple-local-provider.service
```

The unit uses `Restart=on-failure`. It starts through the user manager when lingering is enabled.

## Register Pi

Back up the authoritative registry. Merge only the `local-maple` provider:

```bash
set -euo pipefail
models="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/models.json"
cp -a "$models" "$models.bak-local-maple-$(date +%Y%m%dT%H%M%S)"
tmp=$(mktemp "${models}.tmp.XXXXXX")
trap 'rm -f "$tmp"' EXIT
jq '.providers["local-maple"] = {
  "baseUrl": "http://127.0.0.1:8093/v1",
  "api": "openai-completions",
  "apiKey": "local",
  "compat": {
    "supportsDeveloperRole": false,
    "supportsReasoningEffort": false,
    "supportsStore": false,
    "supportsStrictMode": true,
    "supportsOpenAIGrammarTools": true,
    "maxTokensField": "max_tokens",
    "thinkingFormat": "chat-template"
  },
  "models": [{
    "id": "maple-preview-tq2-exact-head",
    "name": "Maple Preview TQ2 Exact Head (Local 128K)",
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

Check discovery and hosted-default invariants:

```bash
pi --list-models local-maple
jq '{defaultProvider, defaultModel}' \
  "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/settings.json"
```

Start an isolated Pi request without changing the current session:

```bash
pi -p --provider local-maple --model maple-preview-tq2-exact-head \
  --thinking low --no-session --tools '' \
  'Reply with exactly PI_MAPLE_OK'
```

## Inspect

```bash
export XDG_RUNTIME_DIR=/run/user/$(id -u)
export DBUS_SESSION_BUS_ADDRESS=unix:path=$XDG_RUNTIME_DIR/bus
systemctl --user status llama-maple-local-provider.service
systemctl --user show llama-maple-local-provider.service \
  -p MainPID -p NRestarts -p MemoryCurrent -p MemoryPeak
curl -fsS http://127.0.0.1:8093/health | jq .
curl -fsS http://127.0.0.1:8093/slots \
  | jq '[.[] | {id, n_ctx, is_processing}]'
```

Two callers run concurrently. Further callers wait for a slot. Clients must set request deadlines and cancellation rules.

## Evidence

The production-context campaign passed on 5 August 2026:

- 65,536 tokens at 45.66 prompt tokens/s;
- 124,000 tokens with 65,536 cached and 58,464 processed at 25.10 prompt tokens/s;
- 14.70 GiB peak PSS and 22.12 GiB minimum available memory;
- zero process swap and zero process major faults;
- 94 C peak package temperature;
- two concurrent 131,072-token slots at 18.74 generation tokens/s each;
- required tool calls, tool responses, reasoning separation, incremental SSE, usage, cancellation and stop handling passed.

## Roll back

Stop and disable only the Maple provider:

```bash
export XDG_RUNTIME_DIR=/run/user/$(id -u)
export DBUS_SESSION_BUS_ADDRESS=unix:path=$XDG_RUNTIME_DIR/bus
systemctl --user disable --now llama-maple-local-provider.service
```

Remove only the Pi provider entry:

```bash
set -euo pipefail
models="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/models.json"
tmp=$(mktemp "${models}.tmp.XXXXXX")
trap 'rm -f "$tmp"' EXIT
jq 'del(.providers["local-maple"])' "$models" > "$tmp"
jq empty "$tmp"
chmod --reference="$models" "$tmp"
chown --reference="$models" "$tmp"
mv "$tmp" "$models"
trap - EXIT
```

Remove installed files only after the service stops:

```bash
rm -f ~/.config/systemd/user/llama-maple-local-provider.service
rm -rf ~/.config/llama-maple-local-provider
systemctl --user daemon-reload
```
