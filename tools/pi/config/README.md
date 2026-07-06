# Pi config snapshots

These files mirror the local Pi/Piclaw llama.cpp integration config.

## `llama-servers.json`

A Piclaw-local registry of known llama-server profiles. It records service names,
URLs, slot counts, context per slot, and tuning notes. The file is not consumed by
upstream llama.cpp; it is a local orchestration convenience.

The service names assume the matching files under `../systemd/user/` have been
installed into `$HOME/.config/systemd/user`.

## `llama-ui-config.json`

Configuration passed to llama-server with:

```text
--ui-mcp-proxy --ui-config-file /workspace/.pi/llama-ui-config.json
```

It intentionally exposes only bounded custom MCP servers. Avoid broad unsafe
llama-ui agent/tool modes in this deployment.
