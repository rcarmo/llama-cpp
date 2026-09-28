# Gemma 4 prompt-lookup cache optimisation screen

The Gemma vocabulary-only cache replay retained exact draft and cache hashes and reduced CPU cache-drafting time on this bounded fixture. A matched Gemma inference run showed no measurable whole-request gain. The live Gemma service was not changed.

Source: [Hayder Tirmazi's prompt-lookup article](https://jadidbourbaki.github.io/blog/prompt-lookup-llama-cpp/) and linked PRs [#2](https://github.com/jadidbourbaki/llama.cpp/pull/2), [#5](https://github.com/jadidbourbaki/llama.cpp/pull/5), [#10](https://github.com/jadidbourbaki/llama.cpp/pull/10), [#7](https://github.com/jadidbourbaki/llama.cpp/pull/7) and [#12](https://github.com/jadidbourbaki/llama.cpp/pull/12). Those results used Apple M4 Pro and WikiText-103; they are not measurements for this Intel host or this fork.

## Bounded plan

- Compare the current `common/ngram-cache.{h,cpp}` with the article's changes, starting from commit `859d2c33b69f2965e144d3f33ca40c8100459df0` on Intel Core i5-1340P, using the Gemma 4 E4B QAT vocabulary and a reproducible prompt corpus.
- Keep the existing on-disk cache format, draft ranking and thresholds, and the CPU-only test surface. Use a deterministic synthetic replay, load/save/merge parity checks and a high-fanout benchmark before a performance claim.
- Screen the no-copy cache access (#2), sorted follower vectors and fixed-length search (#10), and early threshold rejection (#12) as separate factors. Keep an improvement only if it passes parity and a matched timing test. No backend, service, default, profile or routing change.
- The outer segmented hash map (#5) adds an ankerl vendor dependency. The verified constmap (#7) adds a second vendor dependency and changes the static cache file format. Evaluate those separately; do not silently replace existing user cache files or claim their speedups without a compatibility and memory gate.
- No GPU use. Load only the Gemma vocabulary for the cache replay; use a bounded isolated CPU-only Gemma model for a separate inference comparison. Do not alter the live primary Gemma unit, model profile or service.

## Prior-feature reuse checklist

- [x] Feature: existing common n-gram drafting and cache persistence
  - Source: `common/ngram-cache.{h,cpp}`, `common/speculative.cpp`, `examples/lookup/lookup-stats.cpp`
  - Applicability: already contains context/dynamic/static caches, scoring thresholds, legacy cache files and replay flow.
  - Status: adapted
  - Implementation: `common/ngram-cache.cpp`, `tests/test-ngram-cache.cpp`; the public cache type and disk format are unchanged.
  - Evidence: exact static/dynamic/draft hashes, 11,996 drafted tokens, load/save and merge tests, and matched CPU timings in `measurements-v3.tsv`.

- [x] Feature: speculative cache lifecycle and rollback
  - Source: `common/speculative.cpp`, `examples/lookup/lookup-stats.cpp`
  - Applicability: prompt lookup runs after append/accept and must preserve continuity on reset.
  - Status: applied
  - Implementation: existing callers, unchanged
  - Evidence: repeated drafting, context update, merge and load/save checks in `test-ngram-cache`; model inference and service rollback were not exercised.

- [x] Feature: article's segmented outer map and verified constmap
  - Source: PR #5 and #7 above
  - Applicability: large static caches can benefit from fewer allocations and faster loading.
  - Status: deferred
  - Implementation: none in the first screen
  - Evidence: PR #5 vendors 4,407 lines of `unordered_dense.h`; PR #7 adds a different static cache file format and about 8,000 lines of `constmap`/`xxhash` sources. Their Apple M4 Pro measurements cannot establish a gain or safe migration for this fork's cache files. They need separate compatibility, licensing, memory and performance work.

- [x] Feature: existing primary Gemma zero-copy/MTP path
  - Source: `tools/gemma-hybrid/service.cpp`, `benchmarks/intel-1340p/gemma-zero-copy-service-20260915/README.md`
  - Applicability: use the same Gemma tokenizer for an offline cache replay and an isolated CPU-only model for inference, but leave the live service untouched.
  - Status: adapted
  - Implementation: `tests/test-ngram-cache.cpp` and `run-gemma-inference-ab.sh`; no service changes
  - Evidence: vocab-only log reported `arch=gemma4`, `vocab_only=1`, 262,144 tokens and skipped weights; eight isolated CPU inference runs matched output and accepted tokens. The primary service kept the same PID, `NRestarts=0` and zero unit swap; no deployment.

- [x] Feature: sorted follower vectors and fixed-length search from PR #10
  - Source: [PR #10](https://github.com/jadidbourbaki/llama.cpp/pull/10)
  - Applicability: a 4,096-follower static bigram is the expensive lookup case.
  - Status: rejected
  - Implementation: none; the isolated candidate was reverted.
  - Evidence: its draft hash changed from `8b1059b2683dbbcd` to `8771f8d00c216b22` on the same Gemma token stream, because sorted followers change equal-score tie iteration order. Preserving the original draft sequence takes priority over its faster high-fanout lookup.

## Results

The source commit was `859d2c33b69f2965e144d3f33ca40c8100459df0`. The fixture used `gemma-4-E4B_q4_0-it.gguf` (SHA-256 in `model.sha256`) to load only its 262,144-token vocabulary, then generated an in-memory corpus from a 43-token Gemma prompt. It constructed 8,279 static keys, including a 4,096-follower bigram, and replayed 3,000 draft/update steps plus 2,000 high-fanout and 2,000 low-confidence lookups. No model weights or GPU device were loaded. The source, compiler and CPU were fixed; no page-cache reset or thermal recording was performed. `measurements-v3.tsv` retains five runs per arm in fresh network-disabled Podman containers, limited to four CPUs, 5 GiB and no additional swap.

| Phase (median of five, microseconds) | Baseline | Candidate | Speedup |
|---|---:|---:|---:|
| 3,000 draft/update steps | 45,543 | 1,260 | 36.1x |
| 2,000 high-fanout static lookups | 316,416 | 11,238 | 28.2x |
| 2,000 low-confidence primary lookups | 486,058 | 25,356 | 19.2x |
| static cache build, save and load | 7,881 | 7,763 | 1.02x (noise) |

The baseline, by-reference and final arms had identical static/dynamic cache hashes (`9cee00ced1f3a314` / `c68e044166740d95`), 11,996 drafted tokens, draft hash `8b1059b2683dbbcd` and high-fanout result token 1000. PR #2 accounts for most of the gain. PR #12 reduced the low-confidence lookup median from 35,247 to 25,185 microseconds in the first matched screen (`measurements-v2.tsv`); it did not materially change the other cases. The cache times do not measure Gemma end-to-end inference speed or service latency. The first screen is retained for factor separation, while `measurements-v3.tsv` is the final matched comparison on the same expanded test fixture.

## Matched Gemma inference

The separate `inference/results.tsv` contains eight counterbalanced CPU-only runs (baseline/candidate/candidate/baseline/candidate/baseline/baseline/candidate). Both builds use Release, `GGML_NATIVE=ON`, `GGML_VULKAN=OFF` and the same compiler; the candidate starts from the same base commit and changes only the n-gram cache implementation. The container has four CPUs, 8 GiB memory, no additional swap, disabled network and no GPU device. The Gemma QAT model used four inference threads, context 1024, batch/uBatch 256, a 222-token repeated-phrase prompt, greedy sampling with seed 42 and 64 requested output tokens. Model weights were read in each isolated run; page cache was not reset. An empty dynamic cache file at `/dev/null` avoided persistent cross-run state.

| Median of four per arm | Baseline | Candidate |
|---|---:|---:|
| Decode time | 2,708.5 ms | 2,714.0 ms |
| Whole active request | 6,992.0 ms | 6,969.5 ms |
| Container wall time | 9,314 ms | 9,302 ms |
| Cgroup peak | 2,469,560,320 B | 2,469,697,536 B |

Every run decoded 67 tokens, drafted 57, accepted 47 and produced the same output SHA-256 `dea01e285c0604f0a07ec986d61fe9a1fe29a3aecb0a117c92c1065d51befc4f`. Cgroup swap peak and OOM kills were zero. The cache speedup does not yield a measurable whole-request improvement for this Gemma fixture; timing differences are small enough to treat as noise. This commit is a CPU prompt-lookup improvement, not a deployed Gemma service acceleration.

Reproduce the cache test with `./benchmarks/intel-1340p/prompt-lookup-20260928/reproduce.sh`. The inference comparison uses a clean base-commit worktree at `/var/home/agent/workspace/tmp/llama-lookup-baseline-20260928` and the candidate in `build-lookup-gemma`; build both with the same flags recorded above before running `run-gemma-inference-ab.sh`. The script refuses to overwrite recorded runs. Focused CTest passed in both synthetic and Gemma vocabulary-only modes. Thermal data was not recorded. Primary Gemma remained active throughout with the same PID, zero restarts and zero unit swap. No deployment or routing change.
