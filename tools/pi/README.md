# Pi llama.cpp local server profiles

This tree captures the local Pi/Piclaw llama.cpp runtime profiles used on the
RTX 3060 workstation. The files are intentionally deployment-oriented rather
than general upstream examples.

## Contents

- `PROFILES.md` — annotated tuning notes, benchmark results, model provenance, and operational checklist.
- `bin/` — annotated CUDA llama-server launch scripts.
- `systemd/user/` — matching user services plus service-operation notes.
- `config/llama-servers.json` — local Pi server registry snapshot.
- `config/llama-ui-config.json` — llama-ui MCP proxy config.
- `llama-ui-search-mcp/` — small safe web-search MCP server exposed to llama-ui.

Start with `PROFILES.md` when changing performance knobs; it explains why the
current context sizes, batch settings, MTP draft depth, flash-attention choices,
and GPU-offload modes were selected.

## Active tested profile

The active RTX 3060 profile is Qwen3.6 MoE, tuned for agentic tool cycles:

```text
llama-qwen36-27b-mtp.service
model:       Qwen3.6-35B-A3B-UD-Q2_K_XL-MTP.gguf
ctx:         32768 total, one slot
placement:   all layers on CUDA, first five MoE layers on CPU
cache:       16 profiled expert slots; q4_0 KV
execution:   four threads, batch/microbatch 1024/1024, mlock
MTP:         native NextN, --spec-draft-n-max 1
async CPU:   off (slower in matched measurements)
```

See [agentic tuning](../../docs/qwen36-agentic-tuning.md),
[MoE restoration and async comparison](../../docs/qwen36-async-retune.md), and
[CUDA graph allocation recovery](../../docs/cuda-graph-allocation-recovery.md).
Qwen3.8 is retained as a stopped rollback service. The generalised scheduler is
merged but remains default-off; its measured overlap did not yield a Qwen gain.

## Install/update on the Pi host

From a llama.cpp checkout:

```bash
./tools/pi/install.sh
systemctl --user daemon-reload
systemctl --user stop llama-qwen38-27b-ud-q4.service
systemctl --user restart llama-qwen36-27b-mtp.service
```

The installer copies launch scripts to `$HOME/.local/bin`, user units to
`$HOME/.config/systemd/user`, and config files to `/workspace/.pi` by default.
Use environment variables to override paths:

```bash
PI_CONFIG_DIR=/path/to/.pi ./tools/pi/install.sh
```

## Notes

- Model paths default to `/workspace/models/gguf-misc` inside the launch scripts.
- The services share port `8090`; run only one model service at a time unless
  ports are edited.
- The search MCP service listens on `127.0.0.1:8092` and is wired through
  llama-ui's MCP proxy config.
