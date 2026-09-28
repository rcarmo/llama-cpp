# Gemma 4 prompt-lookup benchmark correction

**Correction (28 September 2026):** I gave the synthetic loop ratios undue prominence. The fixture deliberately manufactured thousands of followers for the same bigram. It measured a cache-copy worst case, not normal Gemma inference. In matched CPU-only `llama-lookup` runs, the raw lookup timers were 0.11-0.36 ms per 7-20 second request and were no lower for the candidate. The deployed Gemma service uses MTP, not prompt-lookup drafting; it did not run this code or change.

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

The source commit was `859d2c33b69f2965e144d3f33ca40c8100459df0`. The fixture loaded only the 262,144-token vocabulary from `gemma-4-E4B_q4_0-it.gguf` (SHA-256 in `model.sha256`). The test then **manufactured** an in-memory corpus from a 43-token prompt: 8,279 static keys, a 4,096-follower bigram and 10,000 repetitions of one follower. It replayed 3,000 draft/update steps plus 2,000 high-fanout and 2,000 low-confidence lookups. The corpus is not a Gemma-generated conversation or a representative request. No model weights or GPU device were loaded. The source, compiler and CPU were fixed; no page-cache reset or thermal recording was performed. `measurements-v3.tsv` retains five runs per arm in fresh network-disabled Podman containers, limited to four CPUs, 5 GiB and no additional swap.

| Synthetic cache phase (median of five, microseconds) | Baseline | Candidate | Loop speed ratio |
|---|---:|---:|---:|
| 3,000 draft/update steps | 45,543 | 1,260 | 36.1x |
| 2,000 high-fanout static lookups | 316,416 | 11,238 | 28.2x |
| 2,000 low-confidence primary lookups | 486,058 | 25,356 | 19.2x |
| static cache build, save and load | 7,881 | 7,763 | 1.02x (noise) |

The baseline, by-reference and final arms had identical static/dynamic cache hashes (`9cee00ced1f3a314` / `c68e044166740d95`), 11,996 drafted tokens, draft hash `8b1059b2683dbbcd` and high-fanout result token 1000. PR #2 accounts for most of this synthetic loop gain. PR #12 reduced the low-confidence lookup median from 35,247 to 25,185 microseconds in the first screen (`measurements-v2.tsv`); it did not materially change the other cases. The first screen is retained for factor separation. None of these loop ratios estimates a real Gemma request or service acceleration.

## Matched Gemma inference

The separate `inference/results.tsv` contains eight counterbalanced CPU-only runs (baseline/candidate/candidate/baseline/candidate/baseline/baseline/candidate). Both builds use Release, `GGML_NATIVE=ON`, `GGML_VULKAN=OFF` and the same compiler; the candidate starts from the same base commit and changes only the n-gram cache implementation. The container has four CPUs, 8 GiB memory, no additional swap, disabled network and no GPU device. The Gemma QAT model used four inference threads, context 1024, batch/uBatch 256, a 222-token repeated-phrase prompt, greedy sampling with seed 42 and 64 requested output tokens. Model weights were read in each isolated run; page cache was not reset. An empty dynamic cache file at `/dev/null` avoided persistent cross-run state.

| Median of four per arm | Baseline | Candidate |
|---|---:|---:|
| Decode time | 2,708.5 ms | 2,714.0 ms |
| Whole active request | 6,992.0 ms | 6,969.5 ms |
| Container wall time | 9,314 ms | 9,302 ms |
| Cgroup peak | 2,469,560,320 B | 2,469,697,536 B |

Every run decoded 67 tokens, drafted 57, accepted 47 and produced the same output SHA-256 `dea01e285c0604f0a07ec986d61fe9a1fe29a3aecb0a117c92c1065d51befc4f`. The exact output lines are retained as `inference/NN-arm/output.txt`. Cgroup swap peak and OOM kills were zero. **The raw `t_draft` counters in `inference/cache-time-audit.tsv` were 0.11-0.12 ms for baseline and 0.13-0.14 ms for candidate.** That is about 0.0016-0.0020% of the 6.94-7.02 second request. These counters are rounded to 0.01 ms and cannot resolve a speedup at this scale. The approximately 22.5 ms difference between whole-request medians is timing noise, not a speedup. This run used no static cache (`-lcd /dev/null` for the dynamic cache); it does not validate a static-cache inference gain.

A longer repeated-prompt check in `inference-audit-long/results.tsv` ran baseline/candidate/candidate/baseline with context 2048, batch 512, microbatch 256 and 128 requested output tokens. All four runs decoded 131 tokens, drafted 114, accepted 92 and produced identical output. `t_draft` was 0.33-0.36 ms within 19.59-20.44 second requests (at most 0.0018% of total time). Whole-request and decode timing varied by more than any lookup difference, so this check also found no model-level benefit. Each cgroup recorded zero swap peak and zero OOM kills. These fixtures are repeated phrases designed to make lookup draft, not representative interactive sessions. Neither test exercised the live MTP service or a large static cache.

Reproduce the synthetic cache test with `./benchmarks/intel-1340p/prompt-lookup-20260928/reproduce.sh`. The original inference comparison on `master` used a clean base-commit worktree at `/var/home/agent/workspace/tmp/llama-lookup-baseline-20260928` and the candidate in `build-lookup-gemma`; build both with the same flags recorded above before running `run-gemma-inference-ab.sh`. The script refuses to overwrite recorded runs. For the selective port onto `main`, a fresh CPU-only Release build in `build-prompt-lookup-main` passed focused CTest and the Gemma vocabulary-only test with the same cache and draft hashes. No new model-level inference A/B was run on `main`; the historical measurements are evidence about the original `master` change, not a speedup claim for this port. Thermal data was not recorded. Primary Gemma remained active throughout the original evaluation with the same PID, zero restarts and zero unit swap. No deployment or routing change. Original commit `ebe5ab94e` remains a code-level cache optimisation, without a validated Gemma inference benefit.
