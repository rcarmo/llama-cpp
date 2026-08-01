#!/usr/bin/env bash
set -euo pipefail

root=/var/home/agent/workspace/projects/llama-cpp
accept_unit=llama-near-capacity-selected.service
accept_out=$root/benchmarks/intel-1340p/qwen-longctx-fieldfare/near-capacity/selected-99104
deploy_out=$root/benchmarks/intel-1340p/qwen-longctx-fieldfare/deployment
service=llama-qwen-longctx.service
uid=$(id -u)

mkdir -p "$deploy_out"
exec > >(tee -a "$deploy_out/post-acceptance.log") 2>&1

printf 'wait_started=%s\n' "$(date -Is)"
while systemctl is-active --quiet "$accept_unit"; do
  sleep 30
done
printf 'acceptance_unit_stopped=%s\n' "$(date -Is)"

[[ -s $accept_out/result.json ]] || { echo "missing acceptance result.json" >&2; exit 1; }
[[ -s $accept_out/response.json ]] || { echo "missing acceptance response.json" >&2; exit 1; }

prompt_tokens=$(jq '.prompt_tokens' "$accept_out/result.json")
tool_name=$(jq -r '.tool_name' "$accept_out/result.json")
[[ $prompt_tokens -ge 98304 ]] || { echo "acceptance prompt below 96K: $prompt_tokens" >&2; exit 1; }
[[ $tool_name == search_repository ]] || { echo "unexpected acceptance tool: $tool_name" >&2; exit 1; }

read -r max_pss max_rss max_maj max_swap_in max_swap_out min_swap_free < <(
  awk -F'\t' 'NR>1 {
    if ($5 > pss) pss=$5; if ($4 > rss) rss=$4; if ($8 > maj) maj=$8;
    if ($12 > si) si=$12; if ($13 > so) so=$13;
    if (free == 0 || $11 < free) free=$11
  } END {print pss+0,rss+0,maj+0,si+0,so+0,free+0}' "$accept_out/samples.tsv"
)
[[ $max_swap_in -eq 0 && $max_swap_out -eq 0 ]] || {
  echo "acceptance used swap: in=$max_swap_in out=$max_swap_out" >&2; exit 1;
}
[[ $max_maj -eq 0 ]] || { echo "acceptance process major faults: $max_maj" >&2; exit 1; }

jq -n \
  --argjson prompt_tokens "$prompt_tokens" --arg tool_name "$tool_name" \
  --argjson max_pss_kib "$max_pss" --argjson max_rss_kib "$max_rss" \
  --argjson max_major_faults "$max_maj" --argjson max_swap_in_pages "$max_swap_in" \
  --argjson max_swap_out_pages "$max_swap_out" --argjson min_swap_free_kib "$min_swap_free" \
  '{accepted:true,prompt_tokens:$prompt_tokens,tool_name:$tool_name,max_pss_kib:$max_pss_kib,max_rss_kib:$max_rss_kib,max_major_faults:$max_major_faults,max_swap_in_pages:$max_swap_in_pages,max_swap_out_pages:$max_swap_out_pages,min_swap_free_kib:$min_swap_free_kib}' \
  > "$deploy_out/acceptance-check.json"

export XDG_RUNTIME_DIR=/run/user/$uid
export DBUS_SESSION_BUS_ADDRESS=unix:path=$XDG_RUNTIME_DIR/bus
[[ -S $XDG_RUNTIME_DIR/bus ]] || { echo "user manager bus missing" >&2; exit 1; }

systemctl --user daemon-reload
rollback_armed=
rollback_on_failure() {
  local rc=$?
  if (( rc != 0 )) && [[ -n ${rollback_armed:-} ]]; then
    systemctl --user disable --now "$service" || true
  fi
  exit "$rc"
}
trap rollback_on_failure EXIT
systemctl --user enable --now "$service"
rollback_armed=1
LLAMA_VALIDATE_OUT="$deploy_out/service-validation" \
  "$root/benchmarks/intel-1340p/qwen-longctx-fieldfare/validate-service.sh" "$service"

jq -n \
  --slurpfile acceptance "$deploy_out/acceptance-check.json" \
  --slurpfile service_result "$deploy_out/service-validation/result.json" \
  --arg deployed_at "$(date -Is)" \
  '{deployed:true,deployed_at:$deployed_at,acceptance:$acceptance[0],service:$service_result[0]}' \
  > "$deploy_out/result.json"
rollback_armed=
trap - EXIT
cat "$deploy_out/result.json"
