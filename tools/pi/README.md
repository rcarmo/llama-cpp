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

The currently preferred interactive Gemma profile is:

```text
llama-gemma-e2b-qat.service
model:       gemma-4-E2B-it-qat-UD-Q4_K_XL.gguf
draft:       mtp-gemma-4-E2B-it-qat-Q4_0.gguf
ctx:         131072 total, parallel=2, 65536 per slot
KV:          f16/f16
MTP:         draft-mtp, --spec-draft-n-max 1
```

On the RTX 3060 this draft depth was faster than both no speculative decoding
and the earlier `--spec-draft-n-max 4` setting for the tested prompt mix.

## Install/update on the Pi host

From a llama.cpp checkout:

```bash
./tools/pi/install.sh
systemctl --user daemon-reload
systemctl --user restart llama-gemma-e2b-qat.service
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
