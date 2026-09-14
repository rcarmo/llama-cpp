# Experimental Q6_K paired CPU projection

`GGML_CPU_Q6_PAIR=1` enables a narrow paired-query CPU dot product on AVX2/FMA backend variants. It is off by default and read once during CPU backend initialisation. Set it before creating a CPU backend or context.

The path reuses Q6_K weight unpacking and scales across two Q8_K query columns. It keeps each output's integer correction, block FMA and horizontal reduction order. The original one-result vec_dot interface is unchanged. Unsupported builds and shapes use the existing route.

Selection requires Q6_K weights, Q8_K activation precision, width 4, rank 2, contiguous weights/output, ordinary precision and non-reference execution. Activation conversion and GGML chunk ownership are unchanged. Odd column-chunk tails use the original one-column dot product. Explicit `GGML_PREC_F32`, other types/widths, padded weights and higher-rank tensors do not select the pair path. Strided query input remains supported through the existing conversion/stride rules.

Build and check:

```sh
cmake -B build -DGGML_VULKAN=OFF -DGGML_NATIVE=ON -DLLAMA_BUILD_TESTS=ON
cmake --build build --target test-q6-pair -j2
ctest --test-dir build --output-on-failure -R '^test-q6-pair$'
```

The test runs separate opt-in off/on processes and compares every output byte over 42 graph cases at 1 and 8 threads, including tails, strided query, direct Q8_K, padded weights, batch broadcast, explicit precision and another weight type. It prints both SHA256 hashes. Backend-DL configurations do not register this statically linked CPU test.

The normal CMake CPU-only build passes all 42 OFF/ON cases with 5710 bit-identical floats (SHA256 `c67cf18881a9276643408605b27bb9fa7d53c24b992f0b58eceee3692d97325b`). Native and non-AVX builds of the changed helper/dispatcher also pass; other backend objects in that fallback check remain native. These checks establish numerical parity, not a speedup or full generic-backend qualification.

On the Intel i5-1340P experimental library, a full-shape synthetic projection took 11.70% less time in median; a matched four-run trained clamp workflow showed 1.20% lower total time and 1.57% lower warm native time. All four task outputs and MTP work matched. Two repetitions per arm on one task do not establish a broad guarantee. Those timings used an isolated predecessor library. The promoted helper/dispatcher library subsequently passed one 10-round trained clamp repair and follow-up, both hidden grades, and exact predecessor prompts, raw output and work (572 generated, 900 evaluated, 549 drafted, 389 accepted tokens). Its loaded library and implementation hashes were verified. That run qualifies task behaviour; combined-backend timing is untested.

Evidence: [matched trained result](../benchmarks/intel-1340p/xe-hotspots-agentic-20260913/q6-agentic-results.md), [full synthetic shape](../benchmarks/intel-1340p/xe-hotspots-agentic-20260913/q6-full-results.md). No serving deployment is implied by the opt-in flag.
