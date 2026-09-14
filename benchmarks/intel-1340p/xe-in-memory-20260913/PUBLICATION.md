# Evidence publication

Implementation commit: `d2028882bd6bfb6d967f0538761639ca8c75599c`. The separate documentation/evidence commit follows it. Benchmarks ran against the same implementation while it was uncommitted; their manifests record actual historical binary hashes rather than retroactively assigning a commit ID.

## Read and verify

- [Measured performance](README.md): all eight valid runs, medians/ranges, stage timings, contention and limitations.
- [API/caller contract](../../../docs/in-memory-kv-handoff.md): opt-in flags, ownership, fallback and MTP lifecycle.
- [Implementation qualification](qualification/implementation-report.md): synthetic and trained tests, fixed borrower reset, failure history and scope.
- `runs/`: original per-run inputs, stage metrics, outputs, library maps and resource guards, including the aborted r4 attempt.
- `qualification/`: selected original target/MTP/synthetic outputs, manifests, guards, build/test/cleanup logs. This is not the full workspace transcript.

From the repository root, with Bun installed:

```sh
bun test benchmarks/intel-1340p/xe-in-memory-20260913/metrics.test.ts
bun benchmarks/intel-1340p/xe-in-memory-20260913/verify.ts
cd benchmarks/intel-1340p/xe-in-memory-20260913
sha256sum -c SHA256SUMS
```

`summarize.ts` regenerates `summary.json` and `results.csv` from retained raw data. It finds historical binary identity by path suffix so it runs from any checkout path. `verify.ts` does not load models, initialise Vulkan or change services. Native CMake tests are registered as `test-kv-handoff`, `test-context-handoff` and `test-context-handoff-gemma`.

`perf-main.cpp` uses repository-relative includes for publication; only those two include paths differ from the measured harness. The exact original harness hash remains in `evidence/preflight-identities.txt`. This include-only change was separately compiled and its output/registry selftest passed. The public API and inference arithmetic are unchanged.

## Historical paths and bounded runs

Raw logs intentionally preserve original absolute paths, invocation IDs, timestamps, model hashes and mapped libraries. The scoped `.gitattributes` disables whitespace warnings only for raw log/map captures, including the whitespace-only failed MTP output; source and documentation checks remain enabled. They describe the host and runtime used for measurement. Do not use an old admission record as current permission to run a benchmark.

`recipes/*.txt` are the exact historical build/run scripts and admission records, stored as transcripts rather than turnkey launchers. They refer to retained shader objects and local GGUF files outside this repository. Obtain a new resource window and adapt paths before any reproduction. The test containers did not expose GPU devices for compilation. Native measurement ran on the existing host device with systemd-owned memory/swap/time caps.

## Original delivered archives

These immutable archives were delivered separately and are not duplicated in Git:

| Archive | SHA-256 |
| --- | --- |
| `xe-in-memory-implementation-20260913.tar.gz` | `5743f341d2afe08f1007e7e16bf03b68ed21337cca1f57204e5b2ade4e1995e7` |
| `xe-in-memory-performance-20260913.tar.gz` | `a2f2408485ccae754ad496fa1fb5170514cfb721570bc48720ded43702392e42` |
| `xe-cpu-zero-copy-checkpoint-20260913.tar.gz` | `09f9a53ca946854f8fc750f4d16c2d8a1a6ca00de3e97d89876fed6f5790933f` |
| `xe-cpu-access-results-20260913.tar.gz` | `8189e82c89aeb9603dde0da1295628dd2cf9972499f2eb8964379fbfcbc8f9e6` |

No binaries, GGUF weights, mutable service state or user media are committed. All prompts/outputs here are synthetic benchmark fixtures. The original whitespace-only MTP failure is retained and explicitly excluded from quality success; the interrupted r4 benchmark is retained and excluded from the timing medians.

## Status

Published experimental implementation and measured evidence only. No deployment, server/proxy route change, clean all-shaders release certification, broad quality noninferiority claim or long-context capacity qualification. Default production identity and speech services are unchanged.
