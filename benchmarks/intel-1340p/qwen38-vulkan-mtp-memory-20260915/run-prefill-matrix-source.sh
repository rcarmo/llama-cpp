#!/bin/bash
# SCRIPT_JDOC: {"summary":"Validate matched true-CPU and clean-Vulkan optimised output/microbatch profiles","kind":"mixed","weight":"heavy","role":"entrypoint"}
set -euo pipefail
root=/var/home/agent/workspace
out="$root/reports/qwen38-vulkan-memory-comparison-20260915/optimised-matrix"
image=localhost/llama-intel-build:fedora44
model=projects/models/qwen3.8-27b-gsq-rco/Qwen3.8-27B-GSQ-RCO-IQ2_S-mtp.gguf
mkdir -p "$out/runs"
: > "$out/matrix.tsv"
printf 'sequence\trepetition\ttokens\tprofile\tstatus\n' >> "$out/matrix.tsv"
run_one(){
 local seq=$1 rep=$2 tok=$3 profile=$4 mode bin name dir rc=0
 if [[ $profile == cpu ]];then mode=cpu;bin=reports/qwen38-vulkan-memory-comparison-20260915/build-cpu-only/bin/test-qwen-mtp-trained-handoff;dev=();else mode=vulkan;bin=reports/qwen38-vulkan-memory-comparison-20260915/build-baseline/bin/test-qwen-mtp-trained-handoff;dev=(--device /dev/dri/renderD128);fi
 name=$(printf '%02d-r%d-t%d-%s' "$seq" "$rep" "$tok" "$profile");dir="$out/runs/$name";mkdir -p "$dir";[[ ! -e $dir/wrapper.exit ]]||return 3
 available=$(awk '/MemAvailable:/{print $2}' /proc/meminfo);[[ $available -ge 6291456 ]];printf '%s\n' "$available">"$dir/memavailable-before-kib";[[ -z $(fuser /dev/dri/renderD128 2>/dev/null||true) ]]
 timeout --kill-after=10s 900s podman run --rm --name "qwen-vk-opt-$seq" --network=none --security-opt label=disable --userns=keep-id "${dev[@]}" --cpus=8 --memory=24g --memory-swap=24g --pids-limit=512 -v /var/home/agent/workspace:/var/home/agent/workspace:rw -w /var/home/agent/workspace -e OMP_NUM_THREADS=8 -e QWEN_FLASH_ATTN=1 -e QWEN_MTP_UBATCH=64 -e QWEN_N_OUTPUTS_MAX=1 -e RUN_BINARY="$bin" -e RUN_MODE="$mode" -e RUN_MODEL="$model" -e RUN_TOKENS="$tok" -e RUN_CHUNK=256 -e RUN_UBATCH=256 -e RUN_OUT="${dir#$root/}" "$image" bash reports/qwen38-vulkan-memory-comparison-20260915/memory-run-inner.sh||rc=$?
 printf '%s\n' "$rc">"$dir/wrapper.exit";[[ $rc -eq 0 && $(cat "$dir/run.exit") == 0 ]];grep -q '^QUALIFY_RESULT ' "$dir/run.log";grep -q "target_pos=$tok mtp_pos=$tok" "$dir/run.log";grep -q 'logits_finite=1' "$dir/run.log";[[ $(awk '/^memory.swap.peak$/{getline;print}' "$dir/final.cgroup") == 0 ]];[[ $(awk '/^oom_kill /{print $2}' "$dir/final.cgroup") == 0 ]];if [[ $profile == cpu ]];then [[ ! -s "$dir/prefill_done.drm-fdinfo" ]];else grep -q 'drm-resident-system0:' "$dir/prefill_done.drm-fdinfo";fi;[[ -z $(fuser /dev/dri/renderD128 2>/dev/null||true) ]];printf '%d\t%d\t%d\t%s\tpass\n' "$seq" "$rep" "$tok" "$profile">>"$out/matrix.tsv";grep '^QUALIFY_RESULT ' "$dir/run.log"|sed "s/^/OPT_RESULT sequence=$seq repetition=$rep profile=$profile /"
}
seq=0
for rep in 1 2 3;do case $rep in 1)sizes=(256 1024 2048);profiles=(cpu vulkan);;2)sizes=(2048 1024 256);profiles=(vulkan cpu);;3)sizes=(1024 256 2048);profiles=(cpu vulkan);;esac;for tok in "${sizes[@]}";do for profile in "${profiles[@]}";do seq=$((seq+1));run_one "$seq" "$rep" "$tok" "$profile";done;done;done
