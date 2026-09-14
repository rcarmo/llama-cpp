#!/usr/bin/env bash
set -euo pipefail
root=/var/home/agent/workspace/reports/gemma-production-acceleration-20260910
if ! test -f "$root/SSE_UPDATE_OK"; then exec /usr/bin/bash "$root/rollback.sh"; fi
