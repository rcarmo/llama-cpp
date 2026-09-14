#!/bin/bash
set -euo pipefail
root=/var/home/agent/workspace/reports/xe-hotspots-agentic-20260913
repo=/var/home/agent/workspace/projects/llama-cpp
base=/var/home/agent/workspace/reports/xe-in-memory-perf-20260913/release
# No ABI/struct layout changed: reuse verified O3 objects, replace only the handoff TU.
mkdir -p "$root/build-cpu/bin"
cd "$base"
/usr/sbin/clang++ -std=c++17 -O3 -DNDEBUG -fPIC -DGGML_BACKEND_SHARED -DGGML_SHARED -DGGML_USE_CPU -DLLAMA_BUILD -DLLAMA_SHARED -Dllama_EXPORTS -I"$repo/src" -I"$repo/include" -I"$repo/ggml/include" -c "$repo/src/llama-kv-cache-handoff.cpp" -o "$root/build-cpu/handoff.o"
ninja-build -t commands bin/libllama.so.0.4.0 > "$root/build-cpu/commands.txt"
link=$(grep ' -o bin/libllama.so.0.4.0 ' "$root/build-cpu/commands.txt" | tail -1)
[ -n "$link" ]
link=${link/src\/CMakeFiles\/llama.dir\/llama-kv-cache-handoff.cpp.o/$root\/build-cpu\/handoff.o}
link=${link/ -o bin\/libllama.so.0.4.0 / -o $root\/build-cpu\/bin\/libllama.so.0.4.0 }
printf '%s\n' "$link" > "$root/build-cpu/link.sh"
bash "$root/build-cpu/link.sh"
ln -sf libllama.so.0.4.0 "$root/build-cpu/bin/libllama.so.0"
ln -sf libllama.so.0 "$root/build-cpu/bin/libllama.so"
export LD_LIBRARY_PATH="$root/build-cpu/bin:$base/bin"
for f in libggml.so libggml-base.so libggml-cpu.so; do ln -sf "$base/bin/$f" "$root/build-cpu/bin/$f"; done
/usr/sbin/clang++ -std=c++17 -O2 -I"$repo/include" -I"$repo/ggml/include" "$repo/tests/test-kv-handoff.cpp" -L"$root/build-cpu/bin" -Wl,-rpath,"$root/build-cpu/bin" -lllama -lggml -lggml-base -lggml-cpu -o "$root/build-cpu/bin/test-kv-handoff"
/usr/sbin/clang++ -std=c++17 -O2 -I"$repo/include" -I"$repo/ggml/include" "$repo/tests/test-context-handoff.cpp" -L"$root/build-cpu/bin" -Wl,-rpath,"$root/build-cpu/bin" -lllama -lggml -lggml-base -lggml-cpu -o "$root/build-cpu/bin/test-context-handoff"
"$root/build-cpu/bin/test-kv-handoff"
"$root/build-cpu/bin/test-context-handoff"
"$root/build-cpu/bin/test-context-handoff" --gemma
