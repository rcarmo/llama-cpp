#!/bin/bash
set -euo pipefail
uuid=GPU-cb9db783-7465-139d-900c-bc8d6b6ced7c
mon=''
cleanup(){ if [ -n "$mon" ]; then kill "$mon" 2>/dev/null || true; fi; sudo -n nvidia-smi -i "$uuid" -pl 170; }
trap cleanup EXIT
for watts in 170 130 110; do
 sudo -n nvidia-smi -i "$uuid" -pl "$watts"
 nvidia-smi --query-gpu=timestamp,temperature.gpu,fan.speed,clocks.sm,power.draw,power.limit,clocks_event_reasons.sw_thermal_slowdown --format=csv -l 1 >"/workspace/tmp/gsq-cooling/${watts}w.csv" & mon=$!
 bun /workspace/projects/llama-gsq-opt/tools/pi/benchmarks/gsq-throughput.ts "/workspace/tmp/gsq-cooling/${watts}w.json" >"/workspace/tmp/gsq-cooling/${watts}w.log" 2>&1
 kill "$mon"; wait "$mon" 2>/dev/null || true; mon=''
done
