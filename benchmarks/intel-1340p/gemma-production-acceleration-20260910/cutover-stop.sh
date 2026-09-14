#!/usr/bin/env bash
set -euo pipefail
root=/var/home/agent/workspace/reports/gemma-production-acceleration-20260910
if ! test -f "$root/PROMOTED"; then exec /usr/bin/bash "$root/rollback.sh"; fi
