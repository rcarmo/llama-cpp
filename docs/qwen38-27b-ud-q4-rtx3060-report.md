# Qwen3.8 27B Unsloth Dynamic Q4_K_XL on RTX 3060

Validated on 4–5 September 2026 against repository commit `c4682a1f5`.

## Artifact

```text
/workspace/models/gguf-misc/Qwen3.8-27B-UD-Q4_K_XL.gguf
size:   17,559,178,144 bytes
sha256: 3f227079003add2511437e5b1e94812e363385225bf6a9b47b0054a72bc8b01e
source: unsloth/Qwen3.8-27B-GGUF
```

This is an Unsloth Dynamic/adaptive quant. Its tensor mix is not uniform Q4:

| Tensor type | Count |
|---|---:|
| F32 | 360 |
| Q5_K | 191 |
| Q8_0 | 110 |
| IQ4_XS | 70 |
| Q4_K | 69 |
| Q6_K | 56 |
| IQ4_NL | 6 |
| Q3_K | 3 |
| IQ3_S | 1 |

## Subsequent scheduler extension

The [generalised async CPU scheduler](general-async-cpu.md) supersedes the
cold-expert-only implementation described in this campaign. It can submit
independent dense projection work, but the tested Qwen placements showed no
end-to-end gain. The selected service therefore keeps async CPU disabled.
The measurements below describe the original campaign, not the new scheduler.

## Architecture and splitting conclusion

The GGUF has 866 tensors and 65 blocks (`blk.0` through `blk.64`) under the
`qwen35` architecture. It alternates full-attention and gated-delta/SSM blocks,
uses dense FFNs, and embeds one NextN/MTP block.

It is **not MoE**. `src/models/qwen35.cpp` explicitly builds dense FFNs and has
no router or `MUL_MAT_ID` expert chain. Therefore:

- the profile-driven expert cache does not apply;
- `--n-cpu-moe` and expert prefetch do not apply;
- current async CPU scheduling does not apply, because it deliberately accepts
  only independent `ffn_moe_down_cold-*` splits;
- dense CPU FFNs remain on the serial per-token critical path.

Selective dense-FFN placement was tested but decode throughput fell as the graph
alternated between CPU and CUDA. Coarse contiguous layer offload was better.

## Baselines

Tiny `llama-bench` runs, q8 KV and Flash Attention:

| GPU layers | Prompt tok/s | Generation tok/s |
|---:|---:|---:|
| 0 | 18.56 | 1.88 |
| 16 | 23.15 | 2.42 |
| 24 | 29.82 | 2.97 |
| 32 | 32.02 | 3.71 |
| 40 | 44.99 | 4.27 |

The host has only six online CPU cores. Other local builds can materially affect
CPU-resident-layer throughput, so final choices use resident-server medians and
retain VRAM/CPU headroom rather than selecting a single peak sample.

## Selected profile

```text
context:             32768, one slot
GPU layers:          39
threads:             4
batch / ubatch:      1024 / 256
target KV:           q4_0 / q4_0
draft KV:            q4_0 / q4_0
Flash Attention:     auto (required for quantized V cache)
MTP:                 embedded NextN, depth 1
async CPU scheduler: off
MoE cache:            disabled / inapplicable
```

Launcher: `tools/pi/bin/run-qwen38-27b-ud-q4-cuda.sh`.

Why 39 layers instead of 40?

- 40 layers fits only after reducing `ubatch` to 256 and peaks around 11,550 MiB
  for the process, leaving little room for unrelated GPU allocations.
- 39 layers uses approximately 11,278 MiB loaded and 11,292 MiB after sustained
  requests on the measured host.
- 40 layers measured about 6.12 generation tok/s median; the safer 39-layer
  profile measured 5.59–6.49 tok/s depending on host contention.

## MTP results

The target GGUF includes its own one-layer NextN head, so a separate MTP sidecar
is not required. `--spec-type draft-mtp` creates a second context against the
same loaded model.

At 39 GPU layers and 32K context:

- plain median in the matched early sweep: about 4.23 generation tok/s;
- embedded MTP median: about 5.55 generation tok/s;
- gain: about 31%;
- representative acceptance: 38/56 drafts (67.9%).

A 128-token depth sweep with quantized target/draft KV found:

| MTP depth | VRAM | Acceptance | Median generation tok/s |
|---:|---:|---:|---:|
| 1 | 11,398 MiB | 76.4% | 6.15 |
| 2 | 11,482 MiB | 64.5% | 5.81 |
| 3 | 11,566 MiB | 47.4% | 4.82 |

Depth 1 is selected. Strict greedy tests using `top_k=1` produced identical raw
token IDs between plain and MTP decoding and across repeated MTP requests.
Default sampler chains at temperature zero can diverge near quantized-logit ties,
so deterministic validation should explicitly use `top_k=1`.

## Cache and placement results

At 32K context:

| Placement | KV | Result |
|---|---|---|
| 42 layers | q8/q8 | fails to allocate compute buffers |
| 42 layers | q4/q4 | non-MTP loads at about 11,402 MiB |
| 41 layers | q8/q8 | non-MTP loads at about 11,516 MiB |
| 40 layers | q8/q8 | non-MTP loads at about 11,256 MiB |
| 40 layers | q4 target+draft | MTP loads with ubatch 256, but tight |
| 39 layers | q4 target+draft | selected MTP profile |

`q5_0` KV regressed badly in the tested build. Quantized V cache cannot run with
Flash Attention disabled. `auto` selected the viable Flash Attention path.

Keeping early dense FFNs on CPU while offloading the remaining tensors was also
rejected: frequent CPU/CUDA graph transitions reduced decode throughput below
the contiguous layer split.

## Validation

The selected 39-layer profile passed:

- repeated deterministic token-ID checks;
- 512-token sustained generation at 5.45 tok/s with 215/295 drafts accepted;
- client cancellation and disconnect handling;
- immediate health and request recovery;
- 27,617-token near-context prompt at 207.97 prompt tok/s;
- correct final-record answer, no truncation, and immediate recovery afterward.

The repository CUDA validation passed 7/7 focused tests, including backend ops,
thread safety, async scheduler, quantization, model-load cancellation, and
expert-I/O planning.

## Feasibility verdict

Qwen3.8 27B UD-Q4_K_XL is **usable but not fast** on the RTX 3060 12 GiB host.
Expect roughly 5.5–6.5 generation tok/s at 32K, versus far higher throughput from
a sparse MoE model whose inactive experts can remain off the critical path.

The best available optimization is conventional contiguous GPU layer offload
plus embedded MTP. Expert caching and the current async CPU scheduler cannot
help this dense architecture without a fundamentally different, dependency-safe
parallel execution design.

## Rollback

Stop `llama-qwen38-27b-ud-q4.service`. Any other model service sharing port 8090
can then be started after confirming that its GGUF exists. The previous Qwen3.6
launcher is retained, but its GGUF was no longer present on this host during the
campaign and its restart loop was stopped.
