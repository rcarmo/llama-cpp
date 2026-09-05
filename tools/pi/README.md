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

The current installed model profile is:

```text
llama-qwen38-27b-ud-q4.service
model:       Qwen3.8-27B-UD-Q4_K_XL.gguf
ctx:         32768 total, one slot
placement:   39 GPU layers, q4_0 target/draft KV
MTP:         embedded NextN, --spec-draft-n-max 1
```

This dense model does not use the fork's MoE cache or cold-expert async CPU
scheduler. See `PROFILES.md` and `../../docs/qwen38-27b-ud-q4-rtx3060-report.md`
for the measured placement and feasibility results.

## Install/update on the Pi host

From a llama.cpp checkout:

```bash
./tools/pi/install.sh
systemctl --user daemon-reload
systemctl --user restart llama-qwen38-27b-ud-q4.service
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
