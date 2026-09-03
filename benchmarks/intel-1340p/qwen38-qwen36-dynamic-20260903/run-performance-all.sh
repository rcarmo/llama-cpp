#!/usr/bin/env bash
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
"$here/run-performance.sh" qwen38
"$here/run-performance.sh" qwen36
