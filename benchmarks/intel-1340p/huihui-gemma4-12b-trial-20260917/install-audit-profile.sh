#!/usr/bin/env bash
# Install the qualified Huihui audit unit and local profile switcher.
set -euo pipefail
root=$(cd "$(dirname "$0")/../../.." && pwd)
runtime="$root/runtime/deployments/huihui-gemma4-security-audit-a4629719f-2a8ac52d"
[[ -x "$runtime/bin/llama-gemma-zero-copy-server" ]]
(cd "$runtime" && sha256sum -c SHA256SUMS)
install -d -m 0700 "$HOME/.config/huihui-gemma4-security-audit"
install -d -m 0755 "$HOME/.config/systemd/user" "$HOME/.local/bin"
install -m 0600 "$root/tools/config/huihui-security-audit.env.example" "$HOME/.config/huihui-gemma4-security-audit/service.env"
install -m 0644 "$root/tools/systemd/user/huihui-gemma4-security-audit.service" "$HOME/.config/systemd/user/"
ln -sfn "$root/tools/gemma-profile" "$HOME/.local/bin/gemma-profile"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=$XDG_RUNTIME_DIR/bus}"
systemctl --user daemon-reload
systemctl --user disable huihui-gemma4-security-audit.service >/dev/null 2>&1 || true
systemctl --user show huihui-gemma4-security-audit.service -p LoadState -p UnitFileState -p FragmentPath -p MemoryMax -p MemorySwapMax
