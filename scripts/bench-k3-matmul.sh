#!/usr/bin/env bash
# Reproducible model-level benchmark harness for SpaceMIT K3 matmul work.
set -euo pipefail

ROOT=$(git rev-parse --show-toplevel)
BUILD_DIR=${BUILD_DIR:-"${ROOT}/build-upstream"}
BENCH=${BENCH:-"${BUILD_DIR}/bin/llama-bench"}
RESULTS_ROOT=${RESULTS_ROOT:-"${ROOT}/benchmarks/k3-matmul"}
detected_cpu_list=$(awk '/^Cpus_allowed_list:/ { print $2 }' /proc/self/status)
THREADS=${THREADS:-8}
REPETITIONS=${REPETITIONS:-5}
PROMPTS=${PROMPTS:-"32,128,512"}
GENERATIONS=${GENERATIONS:-"32,128"}
BATCH_SIZE=${BATCH_SIZE:-2048}
UBATCH_SIZE=${UBATCH_SIZE:-512}
SERVICE=${SERVICE:-"llama-gemma-e2b-qat.service"}
LABEL=${LABEL:-baseline}
MODEL=${MODEL:-}
ALLOW_DIRTY=${ALLOW_DIRTY:-0}

usage() {
    cat <<EOF
Usage: MODEL=/path/model.gguf $0 [label]

Environment:
  BUILD_DIR       build tree (default: build-upstream)
  RESULTS_ROOT    result root (default: benchmarks/k3-matmul)
  THREADS         llama-bench threads (default: 8)
  REPETITIONS     measured repetitions (default: 5)
  PROMPTS         comma-separated prompt sizes (default: 32,128,512)
  GENERATIONS     comma-separated generation sizes (default: 32,128)
  BATCH_SIZE      logical batch size (default: 2048)
  UBATCH_SIZE     physical batch size (default: 512)
  LABEL           result label (default: baseline; positional arg overrides)
  ALLOW_DIRTY=1   permit a dirty worktree
EOF
}

[[ ${1:-} != -h && ${1:-} != --help ]] || { usage; exit 0; }
[[ $# -le 1 ]] || { usage >&2; exit 2; }
[[ $# -eq 0 ]] || LABEL=$1
[[ -n "${MODEL}" ]] || { echo "MODEL is required" >&2; usage >&2; exit 2; }
[[ -r "${MODEL}" ]] || { echo "model not readable: ${MODEL}" >&2; exit 2; }
[[ -x "${BENCH}" ]] || { echo "llama-bench not executable: ${BENCH}" >&2; exit 2; }
command -v jq >/dev/null || { echo "jq is required" >&2; exit 2; }

cd "${ROOT}"
if pgrep -x llama-server >/dev/null; then
    echo "refusing to benchmark while llama-server is running" >&2
    exit 3
fi
service_state=$(systemctl --user is-active "${SERVICE}" 2>/dev/null || true)
if [[ ${service_state} == active || ${service_state} == activating ]]; then
    echo "refusing to benchmark while ${SERVICE} is ${service_state}" >&2
    exit 3
fi
if [[ ${ALLOW_DIRTY} != 1 ]] && [[ -n $(git status --porcelain) ]]; then
    echo "refusing to benchmark a dirty worktree (set ALLOW_DIRTY=1 for harness development)" >&2
    exit 3
fi

commit=$(git rev-parse --short=12 HEAD)
stamp=$(date -u +%Y%m%dT%H%M%SZ)
safe_label=$(printf '%s' "${LABEL}" | tr -cs 'A-Za-z0-9._-' '_')
out="${RESULTS_ROOT}/${stamp}-${commit}-${safe_label}"
mkdir -p "${out}"

model_real=$(readlink -f "${MODEL}")
model_size=$(stat -c %s "${model_real}")
model_sha256=$(sha256sum "${model_real}" | awk '{print $1}')

readarray -t governor_files < <(find /sys/devices/system/cpu -path '*/cpufreq/scaling_governor' -type f | sort)
{
    printf '{\n'
    printf '  "timestamp_utc": %s,\n' "$(jq -Rn --arg x "${stamp}" '$x')"
    printf '  "label": %s,\n' "$(jq -Rn --arg x "${LABEL}" '$x')"
    printf '  "git_commit": %s,\n' "$(jq -Rn --arg x "$(git rev-parse HEAD)" '$x')"
    printf '  "git_describe": %s,\n' "$(jq -Rn --arg x "$(git describe --always --dirty --tags)" '$x')"
    printf '  "git_status": %s,\n' "$(git status --porcelain=v1 | jq -Rs .)"
    printf '  "build_dir": %s,\n' "$(jq -Rn --arg x "$(readlink -f "${BUILD_DIR}")" '$x')"
    printf '  "model_path": %s,\n' "$(jq -Rn --arg x "${model_real}" '$x')"
    printf '  "model_size": %s,\n' "${model_size}"
    printf '  "model_sha256": %s,\n' "$(jq -Rn --arg x "${model_sha256}" '$x')"
    printf '  "inherited_cpu_list": %s,\n' "$(jq -Rn --arg x "${detected_cpu_list}" '$x')"
    printf '  "threads": %s,\n' "${THREADS}"
    printf '  "repetitions": %s,\n' "${REPETITIONS}"
    printf '  "prompts": %s,\n' "$(jq -Rn --arg x "${PROMPTS}" '$x')"
    printf '  "generations": %s,\n' "$(jq -Rn --arg x "${GENERATIONS}" '$x')"
    printf '  "batch_size": %s,\n' "${BATCH_SIZE}"
    printf '  "ubatch_size": %s,\n' "${UBATCH_SIZE}"
    printf '  "service_state": %s,\n' "$(jq -Rn --arg x "${service_state}" '$x')"
    printf '  "environment": '
    env | LC_ALL=C sort | jq -Rn '[inputs | select(test("^(GGML_RISCV64_SPACEMIT|SPACEMIT_)")) | capture("^(?<key>[^=]+)=(?<value>.*)$")] | from_entries'
    printf '}\n'
} >"${out}/metadata.json"

{
    echo '### uname'
    uname -a
    echo '### lscpu'
    lscpu
    echo '### memory'
    free -b
    echo '### compiler'
    "${CXX:-c++}" --version 2>&1 | head -n 2 || true
    echo '### cmake cache'
    grep -E '^(CMAKE_BUILD_TYPE|CMAKE_CXX_COMPILER|CMAKE_CXX_FLAGS|GGML_|RISCV|SPACEMIT)' "${BUILD_DIR}/CMakeCache.txt" 2>/dev/null | sort || true
    echo '### governors'
    for f in "${governor_files[@]}"; do printf '%s=' "$f"; cat "$f"; done
    echo '### current frequencies'
    for f in /sys/devices/system/cpu/cpu*/cpufreq/scaling_cur_freq; do [[ -r $f ]] && printf '%s=' "$f" && cat "$f"; done
    echo '### affinity'
    taskset -pc $$
} >"${out}/system.txt"

# SpaceMIT widens and pins its own worker threads to the IME-capable core
# mask (reported on stderr, normally ff00). Wrapping the process in taskset
# blocks that affinity change and can corrupt IME allocations.
base_cmd=("${BENCH}"
    --model "${model_real}"
    --threads "${THREADS}"
    --batch-size "${BATCH_SIZE}"
    --ubatch-size "${UBATCH_SIZE}"
    --n-gpu-layers 0
    --mmap 1
    --repetitions "${REPETITIONS}"
    --output jsonl)
IFS=',' read -ra prompt_values <<<"${PROMPTS}"
IFS=',' read -ra generation_values <<<"${GENERATIONS}"
: >"${out}/command.txt"
: >"${out}/llama-bench.stderr"
parts=()
start_ns=$(date +%s%N)

# Run every pp/tg case in a fresh process. Besides isolating measurements, this
# avoids a known SpaceMIT allocator failure when prompt and generation cases
# are torn down successively in one llama-bench process.
run_case() {
    local kind=$1 value=$2 part
    part="${out}/${kind}${value}.jsonl"
    local -a cmd=("${base_cmd[@]}")
    if [[ ${kind} == pp ]]; then cmd+=(-p "${value}")
    else cmd+=(-n "${value}" -p 0)
    fi
    printf '%q ' "${cmd[@]}" >>"${out}/command.txt"
    printf '\n' >>"${out}/command.txt"
    set +e
    "${cmd[@]}" >"${part}" 2>>"${out}/llama-bench.stderr"
    local rc=$?
    set -e
    jq -se 'length > 0' "${part}" >/dev/null
    if [[ ${rc} -ne 0 ]]; then
        if [[ ${rc} -eq 134 ]]; then
            printf 'accepted known post-result SpaceMIT teardown abort: %s%s rc=%d\n' \
                "${kind}" "${value}" "${rc}" | tee -a "${out}/warnings.txt" >&2
        else
            echo "benchmark case ${kind}${value} failed with rc=${rc}" >&2
            return "${rc}"
        fi
    fi
    parts+=("${part}")
}
for value in "${prompt_values[@]}"; do run_case pp "${value}"; done
for value in "${generation_values[@]}"; do run_case tg "${value}"; done
jq -s '.' "${parts[@]}" >"${out}/llama-bench.json"
end_ns=$(date +%s%N)

jq -n \
    --argjson elapsed_ms "$(((end_ns - start_ns) / 1000000))" \
    --slurpfile rows "${out}/llama-bench.json" \
    '{elapsed_ms: $elapsed_ms, rows: ($rows[0] | length)}' >"${out}/run.json"

printf '%s\n' "${out}"
