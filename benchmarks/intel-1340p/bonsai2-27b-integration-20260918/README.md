# Bonsai 2 27B PQ2_0 integration on Intel Core i5-1340P

Bonsai 2 27B PQ2_0 runs correctly on `sigma` with a CPU-only llama.cpp profile. CPU generation reached about 1.48 tok/s. Full PQ2 Vulkan offload was correct but slower at 0.59 tok/s, so the retained test profile disables Vulkan.

The separate [PTQ1_0 qualification](ptq1-qualification/README.md) reached 25.5768 prompt tok/s with native full Vulkan offload. Its generation rate was 0.4763 tok/s, so PTQ1 source support is accepted without replacing the retained PQ2 CPU profile.

## Frozen inputs

| Item | Value |
|---|---|
| Date | 18 September 2026 |
| Host | LattePanda Sigma, Intel Core i5-1340P, 31 GiB RAM, Intel Iris Xe |
| Local base | `96055f0078b310616df294e165787c3409af77f1` |
| Integrated source | `bb2ea4754` plus the tracked profile/report commit |
| Prism fork source | `1a07bfa5f4144274c8f1c9963821dd9d9a51854b` |
| Model repository revision | `6ed5e12bf84b7a63069882c91dd9e9218647d17b` |
| Model | `Ternary-Bonsai-2-27B-PQ2_0.gguf` |
| Model size | 7,206,168,928 bytes |
| Model SHA-256 | `3907dc1658db1f78a9826bf8d5bcb8dc65db0d466388937af57f2294fae62ec1` |
| Model licence | Apache-2.0 |
| Fork licence | MIT |

The model reports 26,895,998,464 parameters and `PQ2_0 - 2.13 bpw (group 128)`. Source research and repository metadata were frozen under `/tmp/hn-49746618` during the campaign; the report retains immutable revisions and hashes rather than temporary fetched pages.

## Integrated source

The branch adds the minimum runtime chain needed by this GGUF on the current fork:

- published PQ2_0 tensor type `142` and ftype `141`, with legacy ftype naming;
- quantisation, row validation, loader detection and CPU row/matrix dispatch;
- scalar, AVX-512-VNNI and AVX-VNNI CPU dot paths;
- Hadamard weight-fold metadata, validation, graph transforms and backend hints;
- CPU, CUDA, Metal and Vulkan Hadamard compatibility needed to avoid silent backend misexecution;
- Vulkan FWHT widths through 8192, including the model's 1024-wide transform.

The broad Prism fork was not merged. Its branch was 90 commits ahead and 422 commits behind its upstream comparison point, while the local fork contained 893 commits after the common base. The integration preserved the local TurboQuant type IDs, zero-copy service, Q4 scheduling, UI/server changes and retained backend work. The independent 4096/8192 Metal expansion was removed because this model uses width 1024 and the authorised host uses CPU/Vulkan.

Focused build checks passed:

- `test-quantize-fns` on the current CPU-only build;
- `test-backend-ops test -b CPU -o MUL_MAT_HADAMARD`: 28/28;
- `test-backend-ops test -b Vulkan0 -o MUL_MAT_HADAMARD`: 28/28;
- CPU-only server rebuild after the Metal prune: byte-identical before UI embedding;
- CPU-only server rebuild with the frozen UI: quantisation and 28/28 CPU Hadamard tests passed.

## CPU and Vulkan results

Both timed requests used the same 23-token chat prompt, six generated tokens, temperature 0, a 2,048-token context, eight decode threads, 16 batch threads and no warm-up. Each returned exactly `BONSAI_OK`.

| Profile | Startup | Prompt | Generation | Request wall | Cgroup peak | Swap / OOM | Result |
|---|---:|---:|---:|---:|---:|---:|---|
| CPU, `-ngl 0` | 4 s | 2.0901 tok/s | 1.4846 tok/s | 14 s | 626.7 MB sampled; model pages mmap-backed | 0 / 0 | Accepted |
| Vulkan, `-ngl 99` | 8 s | 1.2763 tok/s | 0.5860 tok/s | 26 s | 8,173,744,128 bytes | 0 / 0 | Rejected for speed |

Full Vulkan offload reduced prompt throughput by 38.94% and generation throughput by 60.53% relative to CPU for this request. The Vulkan source has FWHT support but no `GGML_TYPE_PQ2_0` matmul/dequant path; PQ2 matrix work falls back to CPU. Further hybrid layer splits were not screened because they add backend crossings without a Vulkan PQ2 kernel.

The first CLI smoke loaded the model but entered repeated conversation turns after the requested output limit. It is retained only as an invalid-run diagnostic and is excluded from timings.

Thermal telemetry was not collected. These are one-run smoke measurements, not sustained throughput claims.

## API and UI qualification

The accepted CPU profile passed:

- exact non-streaming output (`BONSAI_OK`, later `BONSAI_FINAL_OK`);
- streaming SSE reconstruction of `BONSAI_STREAM_OK`, followed by `[DONE]`;
- forced OpenAI-style `get_weather` tool selection with `{"city":"Lisbon"}`;
- `/health`, `/v1/models`, `/metrics` and `/slots`;
- exact model alias `bonsai-2-27b-pq2-cpu`;
- 70/70 embedded UI assets byte-for-byte against the frozen primary UI, including `/`;
- zero process/cgroup swap, zero OOM events and zero restarts;
- `primary -> bonsai -> primary` switching with health and identity checks.

The tool request was correct but slow: 287 prompt tokens at 2.1978 tok/s and 28 generated tokens at 1.4754 tok/s took 149 seconds wall-clock. The profile is suitable for explicit local tests, not interactive replacement of the primary Gemma service.

## Retained profile

The qualified runtime is ignored by Git and installed locally at:

```text
runtime/deployments/bonsai2-27b-pq2-cpu-bb2ea4754-ccb8e4aa
```

Its server SHA-256 is:

```text
ccb8e4aa5541d54d97bd3a359d30f31c01dec7d2e3645023bff36d40dfd76fca
```

The closure was built with GCC 16.1.1, `GGML_NATIVE=ON`, `GGML_OPENMP=ON` and `GGML_VULKAN=OFF`. It embeds the same 70 UI assets as archive SHA-256 `db819c42e77906ed195b2e63708c8aa38172527e86ee8fab129e0374e4d6c7bc`. `SHA256SUMS` verifies the server and seven versioned bundled libraries.

`bonsai2-27b-cpu.service` is static, has no `[Install]` section, sets `MemoryMax=28G` and `MemorySwapMax=0`, and binds the shared trusted-LAN endpoint `192.168.1.70:11434`. It is inactive by default. Use:

```bash
benchmarks/intel-1340p/bonsai2-27b-integration-20260918/install-bonsai-profile.sh
gemma-profile bonsai
gemma-profile primary
```

The final live switch took three seconds. The exact request returned in 16 seconds at 2.0904 prompt tok/s and 1.4754 generation tok/s. The service recorded a 1,121,193,984-byte memory peak, zero restarts and zero swap. The restored primary had zero restarts and zero swap.

The complete successful transition matrix also passed: primary to audit in 12 seconds, audit to Bonsai in four seconds, Bonsai to audit in ten seconds, and audit to primary in seven seconds. Every captured state had zero restarts and zero current/peak swap. A deliberate Bonsai startup failure returned exit code 1 in five seconds, restored the primary automatically, and left the real Bonsai unit static with its 28 GiB memory and zero-swap limits intact.

## Evidence map

| Directory | Contents |
|---|---|
| `cpu-server/` | bounded CPU request, response, timings, metrics, slots and container limits |
| `vulkan-backend/` | 28/28 focused Vulkan FWHT tests and cgroup counters |
| `vulkan-server/` | full-offload negative result, response and cgroup counters |
| `cpu-api/` | SSE, forced tool call, metrics and memory counters |
| `ui-verification/` | 70-path byte-for-byte asset matrix and cgroup counters |
| `final-deployment/` | final static-profile switch, model alias, root UI, exact response and rollback |
| `profile-matrix/` | successful primary/audit/Bonsai transition matrix |
| `rollback-failure/` | deliberate Bonsai startup failure and automatic primary restore |
| `cpu-smoke/` | invalid repeated-conversation CLI diagnostic |
| `ptq1-qualification/` | PTQ1 CPU/Vulkan tests, benchmarks, API/SSE/tools/UI gates and resource captures |

`artifact-inventory.tsv` lists the retained PQ2 files. `evidence.sha256` verifies all PQ2 evidence except itself. The PTQ1 directory has its own inventory and hash manifest.
