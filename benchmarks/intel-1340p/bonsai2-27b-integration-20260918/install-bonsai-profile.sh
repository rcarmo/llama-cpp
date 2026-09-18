#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/../../.." && pwd)
runtime="$root/runtime/deployments/bonsai2-27b-pq2-cpu-bb2ea4754-ccb8e4aa"
[[ -x "$runtime/bin/llama-server" ]]
(cd "$runtime" && sha256sum -c SHA256SUMS)

install -d -m 0700 "$HOME/.config/bonsai2-27b-cpu"
install -d -m 0755 "$HOME/.config/systemd/user" "$HOME/.local/bin"
sed "s#/var/home/agent/workspace/projects/llama-cpp/runtime/deployments/bonsai2-27b-pq2-cpu-bb2ea4754-ccb8e4aa#$runtime#" \
    "$root/tools/config/bonsai2-27b-cpu.env.example" > "$HOME/.config/bonsai2-27b-cpu/service.env"
chmod 0600 "$HOME/.config/bonsai2-27b-cpu/service.env"
sed "s#/var/home/agent/workspace/projects/llama-cpp/#$root/#g" \
    "$root/tools/systemd/user/bonsai2-27b-cpu.service" > "$HOME/.config/systemd/user/bonsai2-27b-cpu.service"
chmod 0644 "$HOME/.config/systemd/user/bonsai2-27b-cpu.service"
ln -sfn "$root/tools/gemma-profile" "$HOME/.local/bin/gemma-profile"

export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=$XDG_RUNTIME_DIR/bus}"
systemctl --user daemon-reload
systemctl --user disable bonsai2-27b-cpu.service >/dev/null 2>&1 || true
systemctl --user show bonsai2-27b-cpu.service -p LoadState -p UnitFileState -p FragmentPath -p MemoryMax -p MemorySwapMax
