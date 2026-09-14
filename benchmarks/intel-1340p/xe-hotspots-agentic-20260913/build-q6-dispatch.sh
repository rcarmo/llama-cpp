#!/bin/bash
set -euo pipefail
root=/var/home/agent/workspace/reports/xe-hotspots-agentic-20260913
repo=/var/home/agent/workspace/projects/llama-cpp
base=/var/home/agent/workspace/reports/xe-in-memory-perf-20260913/release
dir="$root/q6-dispatch-build"
mkdir -p "$dir/bin"
cd "$base"
ninja-build -t commands bin/libggml-cpu.so.0.23.0 > "$dir/base-commands.txt"
compile=$(grep ' -c .*ggml-cpu/ggml-cpu.c' "$dir/base-commands.txt" | head -1)
[ -n "$compile" ]
compile=${compile/ -o ggml\/src\/CMakeFiles\/ggml-cpu.dir\/ggml-cpu\/ggml-cpu.c.o / -o $dir\/ggml-cpu.o }
compile=${compile/ -c $repo\/ggml\/src\/ggml-cpu\/ggml-cpu.c/ -I$repo\/ggml\/src\/ggml-cpu -c $dir\/ggml-cpu.c}
printf '%s\n' "$compile" > "$dir/compile.sh"
bash "$dir/compile.sh"
/usr/sbin/clang++ -O3 -fPIC -std=c++17 -mavx2 -mf16c -mfma -I"$repo/ggml/include" -I"$repo/ggml/src" -c "$root/q6-pair.cpp" -o "$dir/pair.o"
link=$(grep ' -o bin/libggml-cpu.so.0.23.0 ' "$dir/base-commands.txt" | tail -1)
[ -n "$link" ]
link=${link/ggml\/src\/CMakeFiles\/ggml-cpu.dir\/ggml-cpu\/ggml-cpu.c.o/$dir\/ggml-cpu.o $dir\/pair.o}
link=${link/ -o bin\/libggml-cpu.so.0.23.0 / -o $dir\/bin\/libggml-cpu.so.0.23.0 }
printf '%s\n' "$link" > "$dir/link.sh"
bash "$dir/link.sh"
ln -sf libggml-cpu.so.0.23.0 "$dir/bin/libggml-cpu.so.0"
ln -sf libggml-cpu.so.0 "$dir/bin/libggml-cpu.so"
/usr/sbin/clang++ -O2 -std=c++17 -I"$repo/ggml/include" -I"$repo/ggml/src" -I"$repo/ggml/src/ggml-cpu" "$root/q6-backend.cpp" -L"$dir/bin" -L"$base/bin" -Wl,-rpath,"$dir/bin:$base/bin" -lggml-cpu -lggml-base -lggml -o "$dir/test-q6-backend"
