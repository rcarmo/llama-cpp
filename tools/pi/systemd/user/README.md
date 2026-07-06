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
systemctl --user restart llama-gemma-e2b-qat.service
systemctl --user stop llama-qwen36-27b-mtp.service llama-gemma-e4b-qat.service
```

The `llama-ui-search-mcp.service` is independent and listens on `127.0.0.1:8092`.
It can remain running while model services are switched.
