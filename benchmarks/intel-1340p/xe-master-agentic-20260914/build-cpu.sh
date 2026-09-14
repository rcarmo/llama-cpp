#!/bin/bash
# SCRIPT_JDOC: {"summary":"Compile fresh current-master CPU libraries, handoff tools and regression callers; no execution","kind":"mixed","weight":"heavy","role":"entrypoint"}
set -euo pipefail
repo=/var/home/agent/workspace/projects/llama-cpp
root=/var/home/agent/workspace/reports/xe-master-agentic-20260914
out="$root/build-cpu"
cmake -S "$repo" -B "$out" -G Ninja -DCMAKE_C_COMPILER=/usr/sbin/clang -DCMAKE_CXX_COMPILER=/usr/sbin/clang++ -DCMAKE_BUILD_TYPE=Release -DGGML_VULKAN=OFF -DGGML_NATIVE=ON -DGGML_CCACHE=OFF -DGGML_BACKEND_DL=OFF -DLLAMA_BUILD_COMMON=ON -DLLAMA_BUILD_TESTS=ON -DLLAMA_BUILD_TOOLS=ON -DLLAMA_BUILD_SERVER=OFF -DLLAMA_BUILD_APP=OFF -DLLAMA_BUILD_EXAMPLES=OFF -DLLAMA_OPENSSL=OFF
cmake --build "$out" --target llama-gemma-in-memory test-q6-pair test-kv-handoff test-context-handoff -j2
/usr/sbin/clang++ -std=c++17 -O3 -Wall -Wextra -I"$repo/include" -I"$repo/ggml/include" -I"$repo/common" -I"$repo/vendor" "$root/agentic-session.cpp" -L"$out/bin" -Wl,-rpath,"$out/bin" -lllama -lllama-common -lggml -lggml-base -lggml-cpu -o "$out/bin/agentic-session"
ctest --test-dir "$out" -N -R '^test-(q6-pair|kv-handoff|context-handoff(-gemma)?)$'
sha256sum "$out/bin/agentic-session" "$out/bin/llama-gemma-in-memory" "$out/bin/libllama.so.0" "$out/bin/libllama-common.so.0" "$out/bin/libggml-cpu.so.0" "$out/bin/libggml-base.so.0"
for f in memory.peak memory.swap.peak memory.events cpu.stat; do printf '%s\n' "$f"; cat "/sys/fs/cgroup/$f"; done
