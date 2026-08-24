#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/../../.." && pwd)
cd "$root"

if pgrep -f '[l]lama-server' >/dev/null; then
  echo "llama-server still running; refusing final regression" >&2
  exit 2
fi

BUILD_JOBS=2 tools/build-intel-1340p.sh

workspace=$(cd .. && pwd)
storage=${PODMAN_STORAGE:-$workspace/.podman-llama-storage}
runroot=${PODMAN_RUNROOT:-$workspace/.podman-llama-run}
image=${LLAMA_BUILD_IMAGE:-localhost/llama-intel-build:fedora44}
podman --root "$storage" --runroot "$runroot" --storage-driver vfs --cgroup-manager=cgroupfs \
  run --rm --network=host --security-opt label=disable --userns=keep-id \
  -v "$(dirname "$workspace"):/var/home/agent/workspace" -w "$PWD" "$image" bash -lc '
    set -euo pipefail
    export LD_LIBRARY_PATH="$PWD/build-intel-clang/bin:$PWD/build-intel-clang/runtime"
    cmake --build build-intel-clang --target test-backend-ops test-batch-alloc test-recurrent-state-rollback -j2
    cp -L /usr/lib64/libomp.so build-intel-clang/runtime/libomp.so
    ctest --test-dir build-intel-clang -R "^test-backend-ops-semantic-replay$" --output-on-failure
  '

export LD_LIBRARY_PATH="$PWD/build-intel-clang/bin:$PWD/build-intel-clang/runtime"
validation=benchmarks/intel-1340p/ornith-gemma-optimization/validation/final-hardening
mkdir -p "$validation"

for rep in 1 2; do
  for name in ornith-target-mtp gemma-target-assistant-mtp; do
    taskset -c 0-7 build-intel-clang/bin/test-backend-ops test -b CPU -t 8 \
      --test-file "benchmarks/intel-1340p/ornith-gemma-optimization/validation/final/$name.ops" --output csv \
      > "$validation/$name-r$rep.csv" 2> "$validation/$name-r$rep.log"
    rows=$(grep -c '^"CPU"' "$validation/$name-r$rep.csv")
    pass=$(grep '^"CPU"' "$validation/$name-r$rep.csv" | grep -c ',"test","1","",""$')
    [[ $rows == "$pass" ]]
  done
done

build-intel-clang/bin/test-batch-alloc > "$validation/test-batch-alloc.txt" 2>&1
grep -Eq 'failures[[:space:]]*:[[:space:]]*0' "$validation/test-batch-alloc.txt"

test -s build-intel-clang/tests/test-models/qwen35-dense.gguf
build-intel-clang/bin/test-recurrent-state-rollback \
  -m "$PWD/build-intel-clang/tests/test-models/qwen35-dense.gguf" \
  > "$validation/test-recurrent-state-rollback.txt" 2>&1
grep -q 'recurrent rollback checkpoint restored successfully' "$validation/test-recurrent-state-rollback.txt"

MTP_CHECKPOINT_VALIDATE_ZERO=1 \
MTP_CHECKPOINT_OUT_ROOT="$validation/mtp-checkpoint" \
  benchmarks/intel-1340p/ornith-gemma-optimization/validate-mtp-checkpoint.sh \
  > "$validation/mtp-checkpoint.stdout"

for profile in ornith gemma4; do
  VALIDATION_OUT_ROOT="$validation/candidate-live" \
  VALIDATION_RUN_NAME="$profile-32k" \
    tools/validate-intel-candidate.sh "$profile" \
    > "$validation/$profile-candidate.stdout"
done

benchmarks/intel-1340p/ornith-gemma-optimization/summarize-128k-validation.ts \
  benchmarks/intel-1340p/ornith-gemma-optimization/validation/candidate-128k \
  > "$validation/summary-128k.stdout"

bash -n tools/validate-intel-candidate.sh \
  benchmarks/intel-1340p/ornith-gemma-optimization/run-128k-validation.sh \
  benchmarks/intel-1340p/ornith-gemma-optimization/validate-mtp-checkpoint.sh
systemd-analyze verify tools/systemd/user/llama-candidate.service tools/systemd/user/llama-qwen-longctx.service

git diff --check
printf 'final_hardening_validation=passed\n' | tee "$validation/result.txt"
