#!/bin/bash
set -euo pipefail
run=$1;model=$2;projector=$3;limit=$4;shift 4
label="serve-cache768-$(date -u +%Y%m%dT%H%M%S%N)"
printf '%s\n' "$label" > "$run/latest-serve-label.txt"
exec /bin/bash "$run/guard.sh" "$run" "$label" "$model" "$projector" "$limit" 0 "$@"
