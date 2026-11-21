#!/bin/bash
set -euo pipefail
pid=${1:?};parser=${2:?}
# Retry vanished fdinfo entries; never substitute zero for a failed snapshot.
for ((attempt=0;attempt<3;attempt++));do
 kill -0 "$pid" 2>/dev/null || exit 1
 if sample=$(awk -f "$parser" /proc/"$pid"/fdinfo/* 2>/dev/null) && [[ "$sample" =~ ^[0-9]+[[:space:]][0-9]+[[:space:]][0-9]+[[:space:]][0-9]+$ ]];then
  printf '%s\n' "$sample";exit 0
 fi
 sleep 0.05
done
exit 1
