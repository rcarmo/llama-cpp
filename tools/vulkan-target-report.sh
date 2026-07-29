#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
out=${1:-vulkan-target-report.txt}
# shellcheck source=/dev/null
source "$root/tools/vulkan-toolchain-env.sh"

probe=${TMPDIR:-/tmp}/llama-vulkan-capability-probe
cc -O2 "$root/tools/vulkan-capability-probe.c" -lvulkan -o "$probe"

{
  printf 'timestamp='; date -Is
  printf 'uname='; uname -a
  printf '\nload='; cat /proc/loadavg
  printf '\nlscpu:\n'; lscpu
  printf '\ncompiler:\n'; c++ --version | head -1
  printf '\nmicrocode:\n'; grep -m1 '^microcode' /proc/cpuinfo || true
  printf '\nthermal:\n'; for f in /sys/class/thermal/thermal_zone*/temp; do [[ -r "$f" ]] && printf '%s=' "$f" && cat "$f"; done
  printf '\npower/governor:\n'; for f in /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor /sys/class/drm/card*/device/power_dpm_force_performance_level; do [[ -r "$f" ]] && printf '%s=' "$f" && cat "$f"; done
  printf '\nvulkan capability probe:\n'; "$probe"
  printf '\nvulkaninfo summary:\n'; vulkaninfo --summary
  if [[ -x "$root/build-vulkan-release/bin/llama-bench" ]]; then
    printf '\nllama devices:\n'; "$root/build-vulkan-release/bin/llama-bench" --list-devices
  fi
} >"$out" 2>&1

if grep -Eiq 'device\[[0-9]+\]=.*(llvmpipe|lavapipe|software)' "$out" && ! grep -Eiq 'device\[[0-9]+\]=.*(Intel|NVIDIA|AMD|Mali|Adreno|Qualcomm|PowerVR|Immortalis)' "$out"; then
  echo "only software Vulkan device detected" >&2
  exit 1
fi

printf 'report=%s\n' "$out"
