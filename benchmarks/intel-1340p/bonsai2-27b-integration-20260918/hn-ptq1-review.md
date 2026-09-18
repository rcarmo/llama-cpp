# HN and Prism PTQ1_0 correction

The Hacker News instructions and reported accelerated runs use `Ternary-Bonsai-2-27B-PTQ1_0.gguf`. Sigma PTQ1 qualification reached 25.5768 prompt tok/s with full Vulkan offload, while generation reached 0.4763 tok/s. The installed PQ2_0 CPU profile remains faster for generation at 1.4846 tok/s.

## Sources checked

The live [Hacker News item 49746618](https://news.ycombinator.com/item?id=49746618) had 172 comments when checked on 18 September 2026. [`hn-ptq1-sources.json`](hn-ptq1-sources.json) retains the five cited comments and exact model, release, commit and pull-request identities. The relevant comments are:

- [49747390](https://news.ycombinator.com/item?id=49747390): Simon Willison uses `Ternary-Bonsai-2-27B-PTQ1_0.gguf`, Prism release `prism-b10685-7dffb15`, `-ngl 99`, Flash Attention and a 32K context. He reports about 20 tok/s and later 44 tok/s on an M5 Pro, with an Apple Metal tensor-API warning.
- [49749255](https://news.ycombinator.com/item?id=49749255): the Apple warning is attributed to missing Metal 4.0 language selection. The linked [upstream PR 27461](https://github.com/ggml-org/llama.cpp/pull/27461) fixes Metal tensor-library compilation and discovery. It is not an Intel Vulkan requirement.
- [49752113](https://news.ycombinator.com/item?id=49752113): an RTX 3070 8 GB run uses PTQ1_0 with `-ngl 99`, Flash Attention, context 32768, batch 256 and microbatch 64. The reported rates are 165.6 prompt tok/s and 40.6 generation tok/s.
- [49755122](https://news.ycombinator.com/item?id=49755122): changing batch and microbatch sizes did not produce a significant speedup in that NVIDIA follow-up.
- [49755246](https://news.ycombinator.com/item?id=49755246): an RTX 3060 12 GB run reports 95.0 prompt tok/s and 26.5 generation tok/s. The commenter finds no draft file in the model repository and quotes the demo download script: `Bonsai 2 has no dspark drafter`.

These reports use Apple or NVIDIA hardware and are not expected Sigma rates. They identify the model format and runtime path that must be tested before drawing an Intel Vulkan conclusion.

## PTQ1 artefact and release

| Item | Value |
|---|---|
| Model | `Ternary-Bonsai-2-27B-PTQ1_0.gguf` |
| Size | 5,946,648,928 bytes |
| SHA-256 | `53107f530aa52eb00912263ab1ee29bd199261c87cd7b4ad4ca1318c1fe33ee3` |
| Model repository revision | `6ed5e12bf84b7a63069882c91dd9e9218647d17b` |
| Prism release | [`prism-b10685-7dffb15`](https://github.com/PrismML-Eng/llama.cpp/releases/tag/prism-b10685-7dffb15) |
| Release commit | `7dffb158de30ebb8ef9d64f33c6b0b2d7c1e6313` |
| Release date | 15 September 2026 |

Prism describes PTQ1_0 as a group-128 ternary packing with tensor type `143` and 1.75 bits per weight. The downloaded GGUF sets `general.file_type` to `143`. GGML's quantisation-output enum separately uses `GGML_FTYPE_MOSTLY_PTQ1_0 = 129`; it is not the value stored in this file's `general.file_type`. The format stores 128 ternary values in 24 base-3 payload bytes, two high-trit bytes and one FP16 scale. It is 1,259,520,000 bytes smaller than the 7,206,168,928-byte PQ2_0 model.

## Sigma-relevant patch chain

Two Prism commits are missing from the inspected local implementation baseline:

1. [`633168fb`](https://github.com/PrismML-Eng/llama.cpp/commit/633168fb66919408e7b649bcf7a651d065ebed3e), `hadamard: share the activation transform between folded weights that share an input (#137)`, memoises identical Hadamard activation transforms for one graph build. It is the direct parent and a performance dependency of the PTQ commit.
2. [`01fd9521c`](https://github.com/PrismML-Eng/llama.cpp/commit/01fd9521c92e7882a3fa1083bb933e3bd9305bef), `ggml: add PTQ1_0, ternary at group 128 (1.75 bpw, lossless vs PQ2_0) (#148)`, is the required format/backend patch. It adds the PTQ1 codec, type/ftype mappings, loader, row validation, generic CPU dot product and native Vulkan dequantisation/matmul shaders.

The release has no later PTQ-specific Vulkan commit. Its later Vulkan change is the wide-FWHT update `#155`, whose Sigma-relevant Vulkan part is already present in local master. The local master also contains the CPU F16 Hadamard guard equivalent to Prism `#147`.

The release contains backend-specific follow-ups that are not required for Sigma PTQ correctness:

- Metal PTQ decode/copy optimisations `#157`, `#158` and `#162` target Apple hardware.
- CUDA PTQ MMQ changes `#160` and `#164` target NVIDIA hardware.
- upstream PR `27461` targets Apple Metal tensor-API detection.

Prism `#165` adds six hybrid-attention graph fusions and reports about 2.6% decode improvement for a 27B Metal case. It is optional performance work after PTQ1 correctness, not part of the minimum format/backend chain.

## Sigma implementation and result

The isolated `feat/bonsai2-ptq1-integration` branch applies the Hadamard dependency as `685c6cdf0` and adapts PTQ1 core, CPU, loader and Vulkan support as `62f4bbb72`. The final metadata fix changes Python's public `LlamaFileType.MOSTLY_PTQ1_0` from the internal ftype value `129` to the on-disk/C++ value `143` and adds a writer/reader regression test. Commit `4a3950bb8` registers the backend-independent element-map test. Commit `e96d552c0` adds PTQ to the current unified Vulkan quantised matrix shader. Commit `a21384cf8` rejects quantised copy and set-row operations that have no released PTQ pipeline. Commit `a9ca156ea` excludes PTQ from coopmat2 pipeline creation because the released PTQ implementation has no coopmat2 decoder.

The unified shader fix was necessary. Before it, PTQ matvec cases passed, but 11 larger matrix cases produced infinite error because the unified runtime shader accepted type `143` without a PTQ buffer alias or decode branch. After the fix, focused CPU and Vulkan PTQ matmul, get-rows and Hadamard tests passed.

Standard one-repetition `llama-bench` results were:

| Profile | Prompt tok/s | Generation tok/s |
|---|---:|---:|
| PTQ1 CPU, 12 threads | 0.9854 | 0.7958 |
| PTQ1 hybrid, 16 GPU layers | 7.3774 | 0.5843 |
| PTQ1 full Vulkan, 99 GPU layers | 25.5768 | 0.4763 |

Full Vulkan prompt ingestion is 12.24 times the published PQ2_0 CPU prompt rate. PQ2_0 CPU generation remains 3.12 times the PTQ1 full-Vulkan generation rate. PTQ1 source support is accepted, but no PTQ service is installed or enabled. The existing static PQ2_0 CPU profile remains the faster Bonsai profile for generated output.

The [qualification report](ptq1-qualification/README.md) records commands, tests, resource limits, server/API/UI gates and evidence hashes.
