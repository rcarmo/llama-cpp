#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/../../.." && pwd)
workspace=$(cd "$root/.." && pwd)
storage=$workspace/.podman-llama-storage
runroot=$workspace/.podman-llama-run
image=${LLAMA_SYCL_BUILD_IMAGE:-localhost/llama-intel-sycl:oneapi-2025.3.3-l0-1.28.2}
out=$root/benchmarks/intel-1340p/ornith-gemma-optimization/sycl/correctness
mkdir -p "$out"

podman --root "$storage" --runroot "$runroot" --storage-driver vfs --cgroup-manager=cgroupfs run --rm --network=none --security-opt label=disable \
  --userns=keep-id --user "$(id -u):$(id -g)" --device /dev/dri/renderD128 --device /dev/dri/card0 \
  -v /var/home/agent/workspace:/var/home/agent/workspace -w "$root" "$image" '
set -euo pipefail
export ONEAPI_DEVICE_SELECTOR=level_zero:gpu
export ZES_ENABLE_SYSMAN=1
export GGML_SYCL_DEBUG=1
export SYCL_PROGRAM_COMPILE_OPTIONS=-cl-fp32-correctly-rounded-divide-sqrt
export LD_LIBRARY_PATH="$PWD/build-intel-sycl/bin:$PWD/build-intel-sycl/runtime:${LD_LIBRARY_PATH:-}"
out=benchmarks/intel-1340p/ornith-gemma-optimization/sycl/correctness
build-intel-sycl/bin/test-backend-ops test -b SYCL0 -o MUL_MAT_ID \
  -p "type_a=q3_K,type_b=f32,n_mats=16,n_used=8,b=0,m=(512|2048),n=(1|2|3|4|8),k=(2048|512)" \
  --output csv > "$out/ornith-routed.csv" 2> "$out/ornith-routed.log"
build-intel-sycl/bin/test-backend-ops test -b SYCL0 -o MUL_MAT \
  -p "type_a=q4_0,type_b=f32,m=(10240|2560|512|2048|4096),n=(1|2|3|4),k=(2560|10240)" \
  --output csv > "$out/gemma-target.csv" 2> "$out/gemma-target.log"
build-intel-sycl/bin/test-backend-ops test -b SYCL0 -o MUL_MAT \
  -p "type_a=q8_0,type_b=f32,m=(2048|256|1024|2560),n=(1|2|3|4),k=(256|2048|5120)" \
  --output csv > "$out/gemma-assistant.csv" 2> "$out/gemma-assistant.log"
'

for name in ornith-routed gemma-target gemma-assistant; do
  rows=$(grep -c '"test","1","",""' "$out/$name.csv" || true)
  unsupported=$(grep -c '"test","0"' "$out/$name.csv" || true)
  printf '%s passed=%s unsupported=%s\n' "$name" "$rows" "$unsupported"
done
