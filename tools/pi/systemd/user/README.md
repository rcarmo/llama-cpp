# User systemd units

These user services wrap the launch scripts under `../bin/`.

Install with:

```bash
./tools/pi/install.sh
systemctl --user daemon-reload
```

Start one model service at a time because the model services share port `8090`
and contend for the same RTX 3060 VRAM:

```bash
systemctl --user stop llama-qwen38-27b-ud-q4.service llama-gemma-e4b-qat.service llama-gemma-e2b-qat.service
systemctl --user start llama-qwen36-27b-mtp.service
```

The `llama-ui-search-mcp.service` is independent and listens on `127.0.0.1:8092`.
It can remain running while model services are switched.

## GSQ LAN default

`llama-qwen38-gsq.service` is the current GSQ 64K/MTP4 service on port 11434,
not 8090. It uses absolute workspace paths and the repository launcher directly.
It still competes with the other model services for RTX 3060 VRAM. It binds all
interfaces without authentication: trusted LAN only. Installation, lingering,
validation and recovery are documented in the
[GSQ serving report](../../../../docs/local/rtx3060/qwen38-gsq-rco-report.md#persistent-serving-2026-09-16).
