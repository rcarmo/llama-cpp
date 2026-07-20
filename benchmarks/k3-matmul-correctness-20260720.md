# K3 matmul correctness and edge validation — 2026-07-20

## Test build

A separate `build-k3-tests` tree was configured with:

```text
LLAMA_BUILD_TESTS=ON
GGML_CPU_RISCV64_SPACEMIT=ON
GGML_CPU_REPACK=ON
GGML_RV_ZBA=ON
GGML_RV_ZFH=ON
GGML_RV_ZVFH=ON
GGML_RV_ZICBOP=ON
GGML_RV_ZIHINTPAUSE=ON
```

The `GGML_RV_ZBA=ON` flag is required; omitting it fails the SpaceMIT compilation.

Generic `test-backend-ops` CPU cases are not sufficient evidence for this backend because they allocate ordinary CPU buffers. Valid focused tests must allocate `ggml_backend_cpu_riscv64_spacemit_buffer_type()`, assert the weight tensor trait (`extra`) was installed, and verify non-zero `SPACEMIT_MATMUL` traces.

## Existing focused tests

The following passed with both 1 and 8 compute threads:

| Test | Cases per thread count | SpaceMIT traces | Result |
|---|---:|---:|---|
| `test-spacemit-q4k-correctness` | 4 before extension | 4 | pass |
| `test-spacemit-f32-proj-q8` | 4 | 4 | pass |
| `test-spacemit-bf16-proj-q8` | 5 | 5 | pass |

All reported `bad=0`; one- and eight-thread outputs were identical.

## Q4_K edge extension

`test-spacemit-q4k-correctness` now covers:

- activation rows/tokens 1 through 9;
- activation rows 32;
- weight rows 32, 64 and 128;
- K 256, 512 and 1024;
- one and eight threads.

This exercises:

- m1 only;
- m4 only;
- mixed m4+m1 tails for 5–7 and 9 rows;
- prompt-sized m4 iteration;
- multiple aligned K/block sizes.

Results:

- 12/12 cases passed at one thread;
- 12/12 cases passed at eight threads;
- 12 SpaceMIT trace lines in each run;
- `bad=0` for every output;
- NMSE ranged from about 0.00186 to 0.00606;
- one- and eight-thread metrics were identical.

## Scheduler/edge conclusion

The current GEMM dispatcher already decomposes activation rows by repeatedly calling kernels that return 4 or 1 rows handled. No correctness gap was found at the m1/m4 boundary, so no replacement edge kernel is justified. The regression test is retained to protect this behavior while compact-IQ and crossover work proceeds.

## Platform caveats found

- `test-backend-ops` creates more affinity-indexed workers unless OpenMP is limited; this can exceed the eight preferred-core IDs and abort in the SpaceMIT affinity hook.
- Use `OMP_NUM_THREADS=8 OMP_THREAD_LIMIT=8` for K3 backend tests.
- The known post-result allocator abort in some `llama-bench` prompt runs does not affect these focused tests.
