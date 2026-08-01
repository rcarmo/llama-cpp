# Qwen long-context user service

The selected service runs Qwen3.6-35B-A3B Q2_K_XL with one 128K slot, native MTP depth 3, Q4_0 KV, mmap weights and bounded Fieldfare expert advice.

The hardware-specific operational reference is [`docs/intel-1340p-qwen-longctx-runbook.md`](../../../docs/intel-1340p-qwen-longctx-runbook.md). This file retains the shorter deployment summary used by the benchmark campaign.

## Endpoint

- Web UI: `http://192.168.1.70:8090/`
- OpenAI-compatible API: `http://192.168.1.70:8090/v1/`
- Health: `http://192.168.1.70:8090/health`
- Metrics: `http://192.168.1.70:8090/metrics`
- No API key is configured. Any host that can reach the port can use the server.
- One slot is available. Concurrent requests queue.

## Profile

- model: `Qwen3.6-35B-A3B-UD-Q2_K_XL.gguf`;
- context: 131,072 tokens;
- MTP draft depth: 3;
- KV: Q4_0 K and V for target and draft contexts;
- batch/ubatch: 1024/256;
- model threads: eight on logical CPUs 0-7;
- process mask: CPUs 0-15;
- load mode: mmap;
- expert advice: bounded, miss-only, asynchronous;
- RAM prompt-state cache: disabled to avoid duplicating a 128K KV state;
- in-slot prompt reuse: enabled;
- manual slot save path: `~/.cache/llama-qwen-longctx/slots/`.

The raw fixed-slot expert cache was not implemented. Under controlled 10 GiB page pressure, cold bounded execution was only 0.64% slower than the warm bounded control, below the documented 10% acceptance gate.

## Installation

The source files are:

- `tools/run-intel-qwen-longctx.sh`;
- `tools/systemd/user/llama-qwen-longctx.service`;
- `tools/config/llama-qwen-longctx.env.example`.

Install for the current user:

```bash
install -Dm0644 tools/config/llama-qwen-longctx.env.example ~/.config/llama-qwen-longctx/service.env
install -Dm0644 tools/systemd/user/llama-qwen-longctx.service ~/.config/systemd/user/llama-qwen-longctx.service
systemctl --user daemon-reload
systemctl --user enable --now llama-qwen-longctx.service
```

The installed unit invokes the canonical workspace launcher and reads machine-local settings from `~/.config/llama-qwen-longctx/service.env`. Rebuilds and configuration changes take effect after restart.

Boot without login requires lingering:

```bash
loginctl enable-linger "$USER"
```

## Operations

```bash
systemctl --user status llama-qwen-longctx.service
systemctl --user restart llama-qwen-longctx.service
systemctl --user stop llama-qwen-longctx.service
journalctl --user -u llama-qwen-longctx.service -f
```

UI validation requires gzip support, as browsers provide:

```bash
curl -H 'Accept-Encoding: gzip' http://127.0.0.1:8090/ -o /tmp/llama-ui.html.gz
```

## Rollback

```bash
systemctl --user disable --now llama-qwen-longctx.service
```

Unset `GGML_CPU_EXPERT_IO_ADVISE_MODE` or set it to `off` to disable expert advice. The default mmap compute path remains unchanged.
