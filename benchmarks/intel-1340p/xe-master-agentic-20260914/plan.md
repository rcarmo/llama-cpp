# Fresh merged-master agentic qualification

Rui explicitly resumed the completed hotspot goal. This phase addresses the unverified current-runtime boundary; it does not reopen or overwrite the completed six-run matrix, predecessor Q6 ABBA, final four-run combined matrix, or rejected Q4/Vulkan experiments.

## Initial source finding

Merged master `d2c9ee8388f80d7423a1e0ee764017936d623b4c` includes the speculative position API change from `common_speculative_draft_params.n_past` to `pos0`. Both `tools/gemma-hybrid/in-memory.cpp` and the retained report-only agentic caller still use `dp.n_past`. The earlier post-merge build covered `test-q6-pair`, not these callers. Update the tracked live caller and a separate new report caller; retain old benchmark source bytes/manifests.

For this text-only single-sequence owner, the next absolute position equals the evaluated history length. Set `pos0=past`; preserve pending sampled-token accounting, per-token positions, draft acceptance and rollback. No arbitrary conditional-ABI compatibility layer or tolerance change.

## Bounded sequence

1. Audit source/API and copy the caller into this report. Freeze the initial source revision and recipe. No completed binaries are overwritten.
2. Fresh CPU-only normal CMake build: llama, current common chat/speculative code, in-memory caller, separate agentic caller, Q6/KV/context regression targets. Start with a compile-only admission; native and vocabulary tests require separate explicit admission. Build uses2 threads/2GiB/no swap with ≤600s per admitted segment.
3. CPU correctness and vocabulary-only regressions: updated caller uses current headers/libraries, safe prefix closure and append-mutation checks remain. Do not load model tensors or GPU during vocabulary checks.
4. Establish a current compatible Vulkan plugin separately, with full shader/source/build identity. Never describe old retained plugin/new CPU mixtures as a complete fresh-master build.
5. One frozen clamp repair/follow-up pilot under600s/16GiB/16MiBswap/6GiBreserve,10x512,MTP3,256MiB tools. Compare independent grades, actual positions, prefix/MTP work and bounded cleanup. Cross-version output equality is diagnostic, not general quality acceptance.
6. If the current-runtime pilot is sound, extend task coverage using predeclared fixtures and independent grades, retaining all task-budget failures. Establish useful matched timing only after output/work comparability and current-runtime identity pass. No unchanged old matrix reruns.
7. Commit and push tested checkpoints to the owner fork, publish new reports/charts separately. No deployment, service changes, defaults changes, benchmark fixture repair or weights writes.

## Admission and retained state

Heavy builds/model/native work require fresh exact three-way admission from @whisper/@go-264, sequential ownership, strict available-memory/swap/contention guards and explicit drain/release. Prior admissions are spent. At preparation, `whisper-finitebits-release-r1` is held/ACKed; only source inspection/edits here until its release. No build/model/GPU worker has launched for this phase.
