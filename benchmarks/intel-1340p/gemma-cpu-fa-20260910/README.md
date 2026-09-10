# CPU Flash Attention SIMD checkpoint at 64K

This is an experimental CPU-FA-specific improvement, not a replacement for the faster retained FA-off hybrid route or a deployment.

- Eight ABBA/BAAB runs: request median 33.840 -> 30.594 s (-9.59%), decode 4.301 -> 4.738 tok/s (+10.16%).
- The same 64658 cached / 25 evaluated / 128 generated tokens and 90/110 MTP acceptance were recorded in every confirmation.
- Default and fused variants each pass four masked 32K/64K native attention cases against the unchanged reference.
- Standalone patch reverified: finite 64K state, recall, independent-slot tool round trip and long cached append.
- Prior FA-off screen was about 7.24 tok/s. CPU FA remains a research branch with a measured improvement, not the best default.

Read [report.md](report.md), [results.json](results.json), [amendments.json](amendments.json), [review.json](review.json) and [the optimisation skill](../../../skills/hybrid-inference-optimization/SKILL.md).

## Offline verification

```sh
sha256sum -c SHA256SUMS
bash verify-offline.sh
```

The helper reconstructs excluded source from revision `abdbeadfb` plus the retained patches in a temporary tree. It runs format/source tests and verifies the standalone patch. Model inference, builds and service changes are not performed. Native kernel and real-model results are preserved under `runs/`.

## Patch entry point

`patch/fused-only.patch` contains the standalone ops/header implementation with the reference-mode guard and int64 length. Its native build, attention tests and lifecycle were reverified after extraction. Performance confirmations used the equivalent combined backend with unrelated experimental flags off; they were not repeated after extraction.

Other `patch/cpu-fa-*.patch` files describe successive experiments and may depend on earlier patches. `patch/all-experiments.patch` plus the original header in `patch-fused-v1/` reconstructs the reference-guard-stage combined source. Full copied C++ source, model/runtime binaries, slot files and service baseline secrets/configuration are excluded.

## Reproduction limits

The campaign scripts preserve exact absolute workspace paths, retained ABI/compiler/object dependencies, host ports and service coordination. They are evidence snapshots, not portable installation commands. Audit scripts refer to local prior campaigns. A new native experiment requires a new output directory, reviewed paths/build manifests and maintenance approval; do not run load/restore scripts on an arbitrary host.

SHA256SUMS and manifest.json cover historical copied artifacts. This README, the offline helper and attribute file describe the export. The original production service was restored unchanged and verified. Small regressions and partial gains in the other CPU FA candidates remain in the evidence; none is labelled a general speedup.
