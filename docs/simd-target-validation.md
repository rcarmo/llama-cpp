# Low-power Intel SIMD target validation

No reachable N100, N95, or U300 host was available during this pass. The known
`z83ii` node is an older Atom-class machine and was unreachable from the current
environment (`192.168.1.13`: no route to host), so it is not a valid substitute.

When target hardware is available, record this metadata before running tests:

```bash
date -Is
uname -a
lscpu
cat /proc/cpuinfo | grep -m1 microcode
cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>/dev/null || true
cat /sys/class/thermal/thermal_zone*/temp 2>/dev/null || true
c++ --version | head -1
cat /proc/loadavg
```

Then use the committed profile and load-guarded benchmark tools:

```bash
tools/simd-build-profiles.sh dispatch build
# or direct profiles when the ISA is guaranteed:
tools/simd-build-profiles.sh avx2 build
tools/simd-build-profiles.sh avx2-vnni build

./build-simd-avx2/bin/test-x86-quant-dot
./build-simd-avx2-vnni/bin/test-x86-quant-dot

tools/simd-run-bench.sh "$PWD/build-simd-avx2" 4096 /tmp/avx2-4096.log 1.0
tools/simd-run-bench.sh "$PWD/build-simd-avx2-vnni" 4096 /tmp/vnni-4096.log 1.0
```

Repeat at sizes 65,536 and 655,360 with at least five minutes between all CPU-
heavy builds/tests/benchmarks. Confirm runtime dispatch selects `haswell` as the
AVX2 fallback and `alderlake` only when CPUID exposes AVX-VNNI. Do not claim
N100/N95/U300 results until this template has been run on the actual hardware.
