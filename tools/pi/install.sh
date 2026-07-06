#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
BIN_DIR=${BIN_DIR:-$HOME/.local/bin}
USER_SYSTEMD_DIR=${USER_SYSTEMD_DIR:-$HOME/.config/systemd/user}
PI_CONFIG_DIR=${PI_CONFIG_DIR:-/workspace/.pi}
MCP_DIR=${MCP_DIR:-/workspace/tools/llama-ui-search-mcp}

mkdir -p "$BIN_DIR" "$USER_SYSTEMD_DIR" "$PI_CONFIG_DIR" "$MCP_DIR"
install -m 0755 "$ROOT"/bin/*.sh "$BIN_DIR"/
install -m 0644 "$ROOT"/systemd/user/*.service "$USER_SYSTEMD_DIR"/
install -m 0644 "$ROOT"/config/*.json "$PI_CONFIG_DIR"/
install -m 0755 "$ROOT"/llama-ui-search-mcp/*.py "$MCP_DIR"/
if [ -f "$ROOT/llama-ui-search-mcp/README.md" ]; then
  install -m 0644 "$ROOT/llama-ui-search-mcp/README.md" "$MCP_DIR"/
fi

echo "Installed Pi llama.cpp profiles. Run: systemctl --user daemon-reload"
