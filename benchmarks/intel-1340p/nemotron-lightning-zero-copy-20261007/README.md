# Nemotron Lightning strict zero-copy evidence

**Publication note, 23 October 2026:** the dated measurements and quality failures below are retained unchanged. The implementation is integrated with the current upstream merge, with the native semantic test adapted to the current chat-session API. No trained Nemotron quality rerun or service restoration occurred. [Operating status](../../../docs/local/intel-i5-1340p/model-serving-status-20261023.md) supersedes historical serving and branch-publication statements.

7 October 2026, Sigma Intel i5-1340P / Iris Xe. Experimental branch, not deployed. [Report and prior-feature reuse checklist](../../../docs/local/intel-i5-1340p/nemotron-lightning-zero-copy-20261007.md).

- Implementation checkpoint: `47368961c64c4518f1f02a77f0cfecb957f5a371`.

- Source parent: `fdfd814abcb34915b23a5f206c88c834f0f1333f`; [source manifest](evidence/source-manifest.txt).
- [Structured results](evidence/results.json): fixed token IDs, model/load/prefill/handoff/re-evaluation/continuation timing and sampled cgroup resources.
- The historical CPU suite reports 13/13 focused tests. Its `evidence/final-cpu-tests.log` capture is absent from this checkout.
- Structured `evidence/final-native-*-state.json` captures retain the six Nemotron-H/MoE rollback/lifetime tests and existing Qwen target/paired-MTP regressions. The historical `.log` names listed below are not included in this checkout; resource samples and manifests are retained.
- `evidence/handoff-p*-ref1.log`: exact Lightning mmap, positive shared bytes/zero copied bytes, finite logits, last-token re-evaluation and two exact all-vocabulary CPU continuation steps against copied state after source/GPU-model destruction.
- `evidence/*-abba*.log`: fresh-process CPU/handoff/handoff/CPU, two observations per profile, 512 and 1024 prefill tokens.
- `evidence/*-resources.tsv`, `*-memory.events`, `*-manifest.txt`: sampled host reserve, cgroup memory/swap/events, native library hashes and arguments.
- The campaign recorded an invalid serialized rollback reference; `evidence/invalid-serialized-rollback-reference.log` is absent from this checkout. Wire serialization omits historical recurrent rows; the corrected synthetic test independently computes and rolls Vulkan control state before restoring current state into CPU reference. The original report records bit-exact corrected state comparisons.

## Quality-fix investigation

[Opt-in reasoning-budget correction and retained failures](quality-fix/README.md): native sampler wiring/answer reserve fixed, but two bounded-policy candidates fail original/held-out accuracy checks and are not promoted.

## Task-quality screen

[Eight-task paired quality evidence](quality/README.md): CPU4/8, handoff5/8; policy exception/source-conflict failures on both, thinking-budget truncations on both and CPU LRU execution failure retained. One observation/profile/task, not broad quality noninferiority or promotion.

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
