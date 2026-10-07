# Nemotron Lightning strict zero-copy evidence

7 October 2026, Sigma Intel i5-1340P / Iris Xe. Experimental branch, not deployed. [Report and prior-feature reuse checklist](../../../docs/local/intel-i5-1340p/nemotron-lightning-zero-copy-20261007.md).

- Implementation checkpoint: `47368961c64c4518f1f02a77f0cfecb957f5a371`.

- Source parent: `fdfd814abcb34915b23a5f206c88c834f0f1333f`; [source manifest](evidence/source-manifest.txt).
- [Structured results](evidence/results.json): fixed token IDs, model/load/prefill/handoff/re-evaluation/continuation timing and sampled cgroup resources.
- [CPU suite](evidence/final-cpu-tests.log): 13/13 focused tests.
- `evidence/final-native-*.log`: six Nemotron-H/MoE rollback/lifetime tests and existing Qwen target/paired-MTP regressions.
- `evidence/handoff-p*-ref1.log`: exact Lightning mmap, positive shared bytes/zero copied bytes, finite logits, last-token re-evaluation and two exact all-vocabulary CPU continuation steps against copied state after source/GPU-model destruction.
- `evidence/*-abba*.log`: fresh-process CPU/handoff/handoff/CPU, two observations per profile, 512 and 1024 prefill tokens.
- `evidence/*-resources.tsv`, `*-memory.events`, `*-manifest.txt`: sampled host reserve, cgroup memory/swap/events, native library hashes and arguments.
- [Invalid serialized rollback reference](evidence/invalid-serialized-rollback-reference.log): retained failure. Wire serialization omits historical recurrent rows; the corrected synthetic test independently computes and rolls Vulkan control state before restoring current state into CPU reference. All corrected state comparisons are bit-exact.

## Semantic supplement

[Native semantic and interruption evidence](semantic/README.md): ten CPU/handoff observations, executable code, thinking/recall/tool warm append and SIGKILL/fresh recovery. No service deployment or broad quality/performance claim.

## Reproduction

The [qualifier](reproduce/qualifier-mmap.cpp) is an isolated extension of `tests/test-qwen-target-trained-handoff.cpp`. Both model owners explicitly use `LLAMA_LOAD_MODE_MMAP`. `NEMOTRON_COPY_REFERENCE=1` enables full-vocabulary logit equality for a copied reference after rollback. Timed observations omit that diagnostic. Legacy `QWEN_*` environment names belong to the reused harness; no Qwen model or service is involved.

The [guarded launcher](reproduce/run-model-gate.sh) captures the exact local paths and limits. Adapt its workspace, source/build path and model filename to the existing project-scoped path wrappers before reuse. Never restore services automatically. Reserve the Intel compute window, verify 6 GiB host reserve and stopped services, use CPU4 / 20 GiB / no swap / physical renderD128 / 180-second deadline. Builds use CPU4 / 4 GiB. Set tool temporary/cache paths under workspace `tmp/llama-cpp` before compiling.

```sh
# Compile inside the retained Fedora toolchain; export workspace-scoped paths first.
c++ -std=c++17 -O3 -I"$SOURCE/include" -I"$SOURCE/ggml/include" \
    reproduce/qualifier-mmap.cpp -L"$BUILD/bin" -Wl,-rpath,"$BUILD/bin" \
    -lllama -lggml -lggml-base -o "$RUN/qualifier-mmap"

# Arguments: profile prefill chunk microbatch copied-reference [unique observation suffix]
bash reproduce/run-model-gate.sh handoff 257 127 127 1
bash reproduce/run-model-gate.sh cpu     512 128 128 0 abba1
bash reproduce/run-model-gate.sh handoff 512 128 128 0 abba2
bash reproduce/run-model-gate.sh handoff 512 128 128 0 abba3
bash reproduce/run-model-gate.sh cpu     512 128 128 0 abba4
```

Model data, runtimes, caches and model snapshots are not stored here. Original interrupted launches, build logs and complete diagnostics remain under local workspace `tmp/llama-cpp/runs/nemotron-zero-copy-fdfd814abcb3/llama-cpp-182732430/source/`. No full CI, natural-prompt quality, serving cancellation/crash, warm-prefix or production capacity claim is established.
