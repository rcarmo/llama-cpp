#!/usr/bin/env bash
# SCRIPT_JDOC: {"summary":"Package the qualified Gemma Q4 scheduling closure into an immutable local deployment","kind":"mutating","weight":"standard","role":"entrypoint"}
set -euo pipefail
root=$(cd "$(dirname "$0")/../../.." && pwd)
build="$root/build-gemma-zc-speed"
source_commit=$(git -C "$root" rev-parse HEAD)
[[ $source_commit == 2768e715cfb52354a6390a8e24e2e8298b9dbdef ]]
exe_sha=$(sha256sum "$build/bin/llama-gemma-zero-copy-server"|cut -d' ' -f1)
target="$root/runtime/deployments/gemma-q4-n4-schedule-${source_commit:0:9}-${exe_sha:0:8}"
[[ ! -e "$target" ]]
mkdir -p "$target/bin"
for f in llama-gemma-zero-copy-server libggml-base.so.0.23.0 libggml-cpu.so.0.23.0 libggml-vulkan.so.0.23.0 libggml.so.0.23.0 libllama.so.0.4.0 libllama-common.so.0.4.0 libllama-server-impl.so libmtmd.so.0.4.0;do cp -L "$build/bin/$f" "$target/bin/$f";done
ln -s libggml-base.so.0.23.0 "$target/bin/libggml-base.so.0";ln -s libggml-base.so.0 "$target/bin/libggml-base.so"
ln -s libggml-cpu.so.0.23.0 "$target/bin/libggml-cpu.so.0";ln -s libggml-cpu.so.0 "$target/bin/libggml-cpu.so"
ln -s libggml-vulkan.so.0.23.0 "$target/bin/libggml-vulkan.so.0";ln -s libggml-vulkan.so.0 "$target/bin/libggml-vulkan.so"
ln -s libggml.so.0.23.0 "$target/bin/libggml.so.0";ln -s libggml.so.0 "$target/bin/libggml.so"
ln -s libllama.so.0.4.0 "$target/bin/libllama.so.0";ln -s libllama.so.0 "$target/bin/libllama.so"
ln -s libllama-common.so.0.4.0 "$target/bin/libllama-common.so.0";ln -s libllama-common.so.0 "$target/bin/libllama-common.so"
ln -s libmtmd.so.0.4.0 "$target/bin/libmtmd.so.0";ln -s libmtmd.so.0 "$target/bin/libmtmd.so"
old="$root/runtime/deployments/gemma-generation-parity-ddb93ad19-7871f502/service.env"
sed -e "s|^LLAMA_BUILD=.*|LLAMA_BUILD=$target|" -e '/^GGML_CPU_EXPERIMENTAL_Q4_N4_SCHEDULE=/d' "$old">"$target/service.env"
printf '\nGGML_CPU_EXPERIMENTAL_Q4_N4_SCHEDULE=1\n'>>"$target/service.env"
chmod 0600 "$target/service.env"
cat >"$target/provenance.txt" <<EOF
source_commit=$source_commit
parent_runtime=$root/runtime/deployments/gemma-generation-parity-ddb93ad19-7871f502
build_image=localhost/llama-intel-build:fedora44
build_image_id=73955bdf70a7b14e89100610502f01d2e4dc231697fd17e785275f538cad6204
candidate_exe_sha256=$exe_sha
feature=GGML_CPU_EXPERIMENTAL_Q4_N4_SCHEDULE=1
EOF
(cd "$target";find bin -type f -print0|sort -z|xargs -0 sha256sum;sha256sum service.env provenance.txt)>"$target/SHA256SUMS"
chmod -R a-w "$target"
printf '%s\n' "$target"
