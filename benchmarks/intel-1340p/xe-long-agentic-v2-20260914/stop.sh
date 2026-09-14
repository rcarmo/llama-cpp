#!/bin/bash
set -eu
file=${1:?container ledger}
if [ -f "$file" ]; then
 while read -r name; do
  case "$name" in xe-agentic-test-*) /usr/bin/podman rm -f --ignore "$name" >/dev/null 2>&1 || true;; esac
 done < "$file"
fi
