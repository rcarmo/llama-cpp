#!/bin/bash
set -euo pipefail
root=/var/home/agent/workspace/reports/xe-hotspots-agentic-20260913
repo=/var/home/agent/workspace/projects/llama-cpp
base=/var/home/agent/workspace/reports/xe-in-memory-perf-20260913/release
out="$root/q6-portable-build"
mkdir -p "$out/native/bin" "$out/scalar/bin"
cd "$base"
ninja-build -t commands bin/libggml-cpu.so.0.23.0 > "$out/base-commands.txt"
for variant in native scalar; do
 dir="$out/$variant"
 compile=$(grep ' -c .*ggml-cpu/ggml-cpu.c' "$out/base-commands.txt" | head -1)
 compile=${compile/ -o ggml\/src\/CMakeFiles\/ggml-cpu.dir\/ggml-cpu\/ggml-cpu.c.o / -o $dir\/ggml-cpu.o }
 if [ "$variant" = scalar ]; then compile=${compile/-march=native/-mno-avx -mno-avx2 -mno-fma}; fi
 printf '%s\n' "$compile" > "$dir/compile.sh"; bash "$dir/compile.sh"
 flags='-march=native'; [ "$variant" = native ] || flags='-mno-avx -mno-avx2 -mno-fma'
 /usr/sbin/clang++ -O3 -fPIC -std=c++17 $flags -I"$repo/ggml/include" -I"$repo/ggml/src" -I"$repo/ggml/src/ggml-cpu" -c "$repo/ggml/src/ggml-cpu/q6-pair.cpp" -o "$dir/pair.o"
 link=$(grep ' -o bin/libggml-cpu.so.0.23.0 ' "$out/base-commands.txt" | tail -1)
 link=${link/ggml\/src\/CMakeFiles\/ggml-cpu.dir\/ggml-cpu\/ggml-cpu.c.o/$dir\/ggml-cpu.o $dir\/pair.o}
 link=${link/ -o bin\/libggml-cpu.so.0.23.0 / -o $dir\/bin\/libggml-cpu.so.0.23.0 }
 printf '%s\n' "$link" > "$dir/link.sh"; bash "$dir/link.sh"
 ln -sf libggml-cpu.so.0.23.0 "$dir/bin/libggml-cpu.so.0"
 ln -sf libggml-cpu.so.0 "$dir/bin/libggml-cpu.so"
 /usr/sbin/clang++ -O2 -std=c++17 -I"$repo/ggml/include" -I"$repo/ggml/src" "$repo/tests/test-q6-pair.cpp" -L"$dir/bin" -L"$base/bin" -Wl,-rpath,"$dir/bin:$base/bin" -lggml-cpu -lggml-base -lggml -o "$dir/test-q6-pair"
 objdump -d -C "$dir/pair.o" > "$dir/pair.asm"
done
