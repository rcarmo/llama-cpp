# Upstream merge, 23 October 2026

The local fork integrates upstream `280141e6d4769b1e4424de999437cc72ffac33d6` from `ggml-org/llama.cpp`. The starting local master was `fdfd814abcb34915b23a5f206c88c834f0f1333f`. This update uses a merge and keeps both histories. Rui authorised committing and pushing this merge to `rcarmo/llama-cpp`. No model download, inference service change or deployment is part of this task.

## Integration decisions

The merge reconciles upstream's extended batch API, Hadamard metadata refactor, dynamic MoE cache, precision controls and Vulkan source split with the fork's retained features.

- Adapt strict hidden-state views to `llama_batch_ext` and `common_batch`. Keep the legacy hidden-span API through a compatibility adapter and add an extended-batch entry point.
- Move Vulkan CPU-shared allocation and leased views into `ggml-vulkan-buffers.cpp`; retain cached/coherent Intel UMA admission, imported-host rejection, the host visibility barrier and buffer ownership.
- Use upstream `llama_hadamard` metadata and graph memoisation. Retain the Maple TQ2 F32 precision override, packed expert conversion, and signed CUDA FWHT path. Accept both new `ffn_norm` and older `post_attention_norm` Maple weights.
- Keep static profile-selected MoE hot/cold packs alongside upstream dynamic MoE caching. Preserve masked negative expert IDs and the scheduler prefetch budget path. CUDA executable-allocation fallback replays only an unlaunched chunk.
- Adapt the fork's Gemma hybrid tools to upstream prompt, parser, speculative-batch and HTTP interfaces. Restore Qwen35MoE strict hidden-state read/write hooks after the batch migration.
- Keep fork contribution policy and existing workflow removals. New upstream Actions workflows are not enabled.

Pre-existing policy and build-path changes are separate from the merge. The original source files, binary diff and hashes were checkpointed before integration. Backup branch: `backup/pre-upstream-sync-20261023`.

## Prior-feature reuse checklist

- [x] Strict shared-state and hidden-state handoff
  - Source: `src/llama-kv-cache-handoff.cpp`, `src/llama-hidden-state.*`, `src/llama-context.cpp`, `src/models/qwen35*.cpp`.
  - Applicability: retained fork API must follow the extended batch migration.
  - Status: adapted.
  - Implementation: extended hidden-span decode, legacy adapter, allocator span and graph input paths; rotation compatibility uses upstream `n_rot_k/n_rot_v`.
  - Evidence: CPU context-handoff, Qwen strict destination/MTP roundtrip, recurrent rollback and synthetic context tests pass. Physical-device handoff was not rerun.
- [x] Async CPU scheduling and bounded expert staging
  - Source: `ggml/src/ggml-backend.cpp`, `src/llama-context.cpp`, `tests/test-sched-async-cpu.cpp`.
  - Applicability: upstream moved expert copying into a context callback.
  - Status: adapted.
  - Implementation: preserve prefetch admission and callback ordering; skip masked negative expert routes.
  - Evidence: six CPU scheduler variants, prefetch-budget and expert-I/O tests pass.
- [x] PQ/PTQ quantisation and Hadamard transforms
  - Source: CPU quantisation paths, `src/llama-model.cpp`, `src/llama-graph.cpp`, `conversion/maple.py`.
  - Applicability: both histories modify format dispatch, transformations and model loading.
  - Status: adapted.
  - Implementation: combined format cases, upstream Hadamard structures and precision controls; Maple metadata compatibility.
  - Evidence: CPU quantisation, PTQ element-map, x86 dot-product tests and generated-model/context tests pass; Vulkan compiles. CUDA and Metal have no local toolchain validation.
- [x] Prompt lookup lifecycle
  - Source: `common/ngram-cache.cpp`, `common/speculative.cpp`, `tests/test-ngram-cache-lifecycle.cpp`.
  - Applicability: upstream adds persistence while the fork validates retained-prefix reuse.
  - Status: adapted.
  - Implementation: keep prefix/rewrite/rollback checks, configured draft limits and profiling; retain dynamic-cache save.
  - Evidence: ngram-cache and lifecycle tests pass.
- [x] Fork hybrid CLI/server integration
  - Source: `tools/gemma-hybrid/in-memory.cpp`, `tools/gemma-hybrid/service.cpp`.
  - Applicability: upstream changes prompt/parser/HTTP/speculative interfaces.
  - Status: adapted.
  - Implementation: token-aware parser input, structured prompt conversion, batch adapters and current HTTP lifecycle API.
  - Evidence: full CPU tools/server build and hybrid-session policy tests pass. No live model/service test.

## Validation

Host: Sigma, Intel Core i5-1340P. Build image: existing `localhost/llama-intel-build:fedora44`, GNU compiler, native x86, Release/Ninja. Containers have no network or render-device access; each is capped at two CPUs and 4 GiB memory with no additional swap allowance. `OMP_NUM_THREADS=2` for tests.

All build/cache/temp files are under the physical workspace's `tmp/llama-cpp/`. Variants are `upstream-20261023-cpu` and `upstream-20261023-vulkan`; the source key is `llama-cpp-182732430`. Existing Make agent wrappers provide path validation and environment defaults.

| Check | Result |
| --- | --- |
| Full CPU build, tools and server included | Pass |
| Full Vulkan-enabled build and shader compilation | Pass; no physical-device execution |
| Offline CTest set | 72/72 pass |
| Generated models and synthetic llama-context tests | 2/2 pass |
| CPU semantic graph replay, explicit `-t 2` | 3/3 cases, 1/1 backends pass |
| Conversion Python syntax and wrapper Bash syntax | Pass |
| Resolution whitespace and conflict-marker checks | Pass; inherited upstream whitespace warnings retained |

The initial unfiltered CTest run exposed a fixture-pattern merge error, now corrected. It also attempted remote-download cases inside a networkless container and a Python test without `jinja2`. Those environment-dependent tests are excluded from the final offline set. The argument-parser executable includes unconditional HTTP tests and could not complete offline. The default-thread semantic replay exceeded a 120-second bound under contention; its explicit two-thread rerun passes. These initial failures remain in the working logs.

CUDA/HIP/MUSA and Metal changes are source-reviewed only on this host. No trained weights were downloaded or restored after the 9 October cleanup. No trained-model accuracy, throughput, thermal behaviour, physical-GPU handoff or service recovery was measured.

Working receipts and logs: `tmp/llama-cpp/runs/upstream-sync-20261023-fdfd814abcb3/` relative to the physical workspace. Retained selected logs are linked from `benchmarks/intel-1340p/upstream-sync-20261023/README.md`.
