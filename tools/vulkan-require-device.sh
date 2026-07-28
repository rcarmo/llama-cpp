#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
# shellcheck source=/dev/null
source "$root/tools/vulkan-toolchain-env.sh"

build=${1:-$root/build-vulkan-release}
index=${2:-0}
required=${3:-NVIDIA GeForce RTX 3060}

out=$(GGML_VK_VISIBLE_DEVICES="$index" "$build/bin/llama-bench" --list-devices 2>&1)
printf '%s\n' "$out"

if grep -Eiq 'llvmpipe|lavapipe|software' <<<"$out"; then
  echo "software Vulkan device rejected" >&2
  exit 1
fi
if grep -q '^  (none)$' <<<"$out"; then
  echo "no Vulkan device selected" >&2
  exit 1
fi
if ! grep -Fq "$required" <<<"$out"; then
  echo "required Vulkan device not found: $required" >&2
  exit 1
fi
