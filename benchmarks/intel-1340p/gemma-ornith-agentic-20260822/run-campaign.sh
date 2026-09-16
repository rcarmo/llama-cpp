#!/usr/bin/env bash
set -euo pipefail

export PATH=/var/home/agent/.pi/agent/bin:/opt/piclaw/current/bun/bin:/opt/piclaw/current/app/node_modules/.bin:/usr/local/bin:/usr/bin:/bin

root=$(cd "$(dirname "$0")/../../.." && pwd)
here=$root/benchmarks/intel-1340p/gemma-ornith-agentic-20260822
results=$here/results
state=$here/state
models=/var/home/agent/.pi/agent/models.json
pre_ornith=/var/home/agent/.pi/agent/models.json.pre-ornith-20260820
ornith_unit=llama-ornith-local-provider.service
gemma_unit=llama-gemma-local-provider.service
mkdir -p "$results" "$state"
cp "$models" "$state/models.json.before"
free -h > "$state/memory.before.txt"
systemctl --user is-enabled "$ornith_unit" > "$state/ornith-enabled.before.txt" 2>&1 || true
systemctl --user is-active "$ornith_unit" > "$state/ornith-active.before.txt" 2>&1 || true
systemctl --user is-enabled "$gemma_unit" > "$state/gemma-enabled.before.txt" 2>&1 || true
systemctl --user is-active "$gemma_unit" > "$state/gemma-active.before.txt" 2>&1 || true

restored=0
restore() {
  local rc=$?
  trap - EXIT INT TERM
  cp "$state/models.json.before" "$models"
  systemctl --user disable --now "$gemma_unit" >/dev/null 2>&1 || true
  systemctl --user enable --now "$ornith_unit" >/dev/null 2>&1 || true
  for _ in $(seq 1 360); do
    curl -fsS --max-time 2 http://127.0.0.1:8095/health >/dev/null 2>&1 && break
    sleep 1
  done
  free -h > "$state/memory.after.txt"
  systemctl --user --type=service --state=running --no-legend | grep -Ei 'llama|gemma|ornith|maple|qwen' > "$state/model-services.after.txt" || true
  ss -ltnp | awk 'NR==1 || $4 ~ /:809[0-9]$/' > "$state/model-listeners.after.txt"
  restored=1
  exit "$rc"
}
trap restore EXIT INT TERM

# Add Gemma to Pi only for the campaign. The trap restores the exact original registry.
tmp=$(mktemp)
jq --slurpfile previous "$pre_ornith" '.providers["local-gemma"] = $previous[0].providers["local-gemma"]' "$models" > "$tmp"
chmod --reference="$models" "$tmp"
mv "$tmp" "$models"

wait_healthy() {
  local endpoint=$1 unit=$2
  for _ in $(seq 1 600); do
    curl -fsS --max-time 2 "$endpoint/health" >/dev/null 2>&1 && return 0
    systemctl --user is-active --quiet "$unit" || return 1
    sleep 1
  done
  return 1
}

cool_down() {
  for _ in $(seq 1 600); do
    (( $(cat /sys/class/thermal/thermal_zone1/temp) < 70000 )) && return 0
    sleep 1
  done
  return 1
}

run_one() {
  local label=$1 unit=$2 provider=$3 model=$4 endpoint=$5
  rm -rf "$results/$label"
  mkdir -p "$results/$label"
  cool_down
  systemctl --user restart "$unit"
  wait_healthy "$endpoint" "$unit"
  pgrep -a llama-server > "$results/$label/model-processes.txt"
  [[ $(pgrep -c llama-server) == 1 ]]
  "$here/run-model.sh" "$label" "$unit" "$provider" "$model" "$endpoint" "$results/$label"
}

campaign_rc=0
run_one ornith "$ornith_unit" local-ornith ornith-1.5-35b-a3b-q4-k-m http://127.0.0.1:8095 || campaign_rc=$?
systemctl --user stop "$ornith_unit" || true
cool_down || true
run_one gemma "$gemma_unit" local-gemma gemma-4-e4b-qat-mtp http://127.0.0.1:8091 || campaign_rc=$?

if [[ -s "$results/ornith/api/summary.json" && -s "$results/ornith/pi/summary.json" && -s "$results/gemma/api/summary.json" && -s "$results/gemma/pi/summary.json" ]]; then
  bun "$here/summarize-campaign.ts" "$here" > "$here/summary.stdout"
else
  campaign_rc=1
fi
printf '%s\n' "$campaign_rc" > "$state/campaign.exit-code"
exit "$campaign_rc"
