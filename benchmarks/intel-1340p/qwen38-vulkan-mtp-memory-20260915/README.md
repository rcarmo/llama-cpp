# Qwen3.8 Vulkan embedded-MTP memory qualification

This campaign qualified the production MTP microbatch cap in commit `5f209cac0`. The target context keeps batch/uBatch 256; the embedded draft context uses batch 256 and uBatch 64. The [platform report](../../../docs/local/intel-i5-1340p/qwen38-vulkan-mtp-memory.md) records the result and scope.

## Provenance

- Date: 15 September 2026.
- Host: LattePanda Sigma, Intel Core i5-1340P, 16 logical CPUs, 31.1 GiB RAM.
- GPU: Intel Iris Xe Graphics (Raptor Lake-P), Mesa Vulkan driver, unified memory.
- Clean source: `bb04014499b7b434114ba1ae6be5c20e280f4aa2`.
- Production implementation: `5f209cac0db58f6b405bc2fc10239953d7a15109`.
- Model: `Qwen3.8-27B-GSQ-RCO-IQ2_S-mtp.gguf`, 9,607,981,120 bytes, SHA256 `e6406238a5cc0043775cd1963b6f9e5b8707400276e38d9fde742304906b1330`.
- Builds: Clang Release, one CPU-only and one Vulkan build from the clean source. The qualifier source contained measurement-only controls and was excluded from the production commit.
- Matrix: three runs per CPU/Vulkan cell at 256, 1,024 and 2,048 tokens, 18 runs total. Each run used 256-token chunks, target batch/uBatch 256, MTP batch 256, MTP uBatch 64, one output row, eight threads and no swap.
- Cache state: no page-cache reset. Model loading is outside the reported prefill rate.
- Thermal state: not recorded.

## Retained files

| Path | Contents |
| --- | --- |
| `prefill-comparison.csv` | Median CPU/Vulkan throughput and resident-memory comparison. |
| `prefill-results.json` | All 18 parsed run records, phase memory samples, cell statistics and validation flags. |
| `prefill-matrix.tsv` | Counterbalanced run order and pass status. |
| `prefill-resource-checks.tsv` | Per-run swap peak, OOM and OOM-kill counters. |
| `handoff-1k.txt` | Exact 1K handoff result and bounded cgroup summary. |
| `server-ab/` | Matched clean/candidate responses, server logs and cgroup records. |
| `service-live-20260915.txt` | Initial embedded-UI 32K LAN allocation smoke; superseded by the failed interactive trial below. |
| `service-rejection-20260915.txt` | Failed Qwen service measurements, cleanup state and accepted Gemma replacement checks. |
| `focused-tests.txt` | Seven focused context/handoff tests. |
| `constructor-clean.txt` | Clean common-constructor graph export with a 253.1348 MiB draft compute buffer. |
| `constructor-candidate.txt` | Capped common-constructor graph export with a 63.2837 MiB draft compute buffer. |
| `test-qwen-mtp-trained-handoff-extended.cpp` | Measurement-only qualifier source used to build the CPU and Vulkan test binaries. |
| `test-backend-ops-small-column-iq.patch` | Measurement-only 14-case IQ N=1/N=7 performance matrix patch. |
| `test-backend-ops-small-column-iq.txt` | Scope and disposition of the IQ performance patch. |
| `memory-run-inner.sh` | Per-run checkpoint and memory collector. |
| `run-prefill-matrix-source.sh` | Original workspace wrapper; paths identify the collection workspace and need adjustment after checkout. |
| `analyse-prefill.ts` | Original parser; set its `root` constant to a directory containing full per-run checkpoint files before reuse. |

The compact repository bundle retains parsed phase measurements instead of all raw `smaps`, DRM and cgroup snapshots. `prefill-results.json` is sufficient to reproduce the published aggregates. `prefill-resource-checks.tsv` retains the final swap/OOM gates for every run.

## Validate the retained evidence

From the repository root:

```sh
bun - <<'EOF'
const fs = require('fs');
const root = 'benchmarks/intel-1340p/qwen38-vulkan-mtp-memory-20260915';
const x = JSON.parse(fs.readFileSync(`${root}/prefill-results.json`, 'utf8'));
if (x.rows.length !== 18) throw new Error(`expected 18 rows, got ${x.rows.length}`);
for (const key of ['all_finite', 'all_positions', 'all_copy_zero', 'cpu_no_drm']) {
    if (x.checks[key] !== true) throw new Error(`${key} failed`);
}
const resources = fs.readFileSync(`${root}/prefill-resource-checks.tsv`, 'utf8').trim().split('\n').slice(1);
if (resources.length !== 18 || resources.some(line => !line.endsWith('\t0\t0\t0'))) {
    throw new Error('resource checks failed');
}
console.log(x.comparisons);
EOF
```

Validate the retained file hashes with:

```sh
(cd benchmarks/intel-1340p/qwen38-vulkan-mtp-memory-20260915 && sha256sum -c SHA256SUMS)
```

## Re-run the inference matrix

The retained qualifier is a manual benchmark tool. Copy `test-qwen-mtp-trained-handoff-extended.cpp` over `tests/test-qwen-mtp-trained-handoff.cpp` in an isolated clean-source worktree, build `test-qwen-mtp-trained-handoff` once with `GGML_VULKAN=OFF` and once with `GGML_VULKAN=ON`, then adjust the absolute paths in `run-prefill-matrix-source.sh` and `memory-run-inner.sh`.

The source wrapper expects Podman, Bun, `/dev/dri/renderD128`, the model above and an image with the build dependencies. It runs serial containers with 8 CPUs, a 24 GiB cgroup limit, no swap, a 900-second timeout and at least 6 GiB host memory available before each run. The wrapper verifies finite logits, positions, swap, OOM kills, DRM ownership and GPU cleanup.

## Rejected live service follow-up

A later 32K LAN trial used the same production source with full Iris Xe offload and active embedded MTP. The initial smoke in `service-live-20260915.txt` passed health, UI, one trivial completion and resource checks. Interactive use then measured 0.81 tok/s decode and produced incoherent output. The test service was stopped, disabled and removed.

A CPU-only target-only diagnosis reached 2.30 tok/s and produced coherent tokens, but it remained unsuitable for interactive use on Sigma. The accepted Gemma 4 E4B provider replaced the LAN endpoint after passing factual, arithmetic and JSON checks with two 131K slots.
