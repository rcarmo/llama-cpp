#!/usr/bin/env bash
set -euo pipefail
root=/var/home/agent/workspace/reports/gemma-decode-attn4-20260911
if ! test -f "$root/PROMOTED"; then exec /usr/bin/bash "$root/rollback.sh";fi
