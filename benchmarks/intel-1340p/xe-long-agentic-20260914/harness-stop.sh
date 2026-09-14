#!/bin/bash
set -u
root=/var/home/agent/workspace/reports/xe-long-agentic-20260914
podman rm -f --ignore xe-long-agentic-harness >/dev/null 2>&1 || true
bash "$root/stop.sh" "$root/evidence/harness-containers.txt"
