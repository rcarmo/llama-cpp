# Maple weight inventory

Inventory date: 2026-08-06. Tensor labels are read from the current checkout's sparse `ggml_type` enum; reserved numeric gaps are preserved. The initial sequential label attempt was discarded because it mislabeled BF16, Q8_0 and TQ2_0.

## Official sources

| Repository | Revision | Role |
|---|---|---|
| `deepgrove/maple-preview` | `ac1ddd79d2b5cb4406f5d2bebdf95406ce505a07` | Official BF16 trained checkpoint, nine safetensor shards |
| `deepgrove/maple-preview-2bit-mlx` | `361db5da5e74ff6fcdd852d478e1f266ce11013a` | Official compact exact-ternary MLX representation, three shards plus flash head |
| `deepgrove-ai/mlx-lm-deepgrove` | `eba96c16158f032821b0bf374ea1421cfddef0a9` | Reference MLX runtime |

The source revisions, shard hashes, tokenizer/config hashes and reference container are pinned in `../maple-preview/reference/manifest.json`.

## Local GGUF artifacts

| Artifact | Size | Tensor layout | Provenance / decision |
|---|---:|---|---|
| `maple-preview-f32.gguf` | 80,862,072,352 | 291 F32 | BF16 checkpoint converted to F32; conversion baseline |
| `maple-preview-f32-exact.gguf` | 80,862,072,448 | 291 F32 | Exact compact checkpoint unpack; oracle source |
| `maple-preview-bf16.gguf` | 40,459,390,496 | 170 BF16 + 121 F32 | BF16 conversion candidate |
| `maple-preview-q8_0.gguf` | 21,520,633,376 | 170 Q8_0 + 121 F32 | Fast lossy baseline; rejected for exact tier |
| `maple-preview-tq2_0.gguf` | 5,765,648,000 | 168 TQ2_0 + 2 Q8_0 + 121 F32 | Generic TQ2 with Q8 embedding/head; fastest but rejected for exact tier |
| `maple-preview-tq2-exact-head.gguf` | 7,593,741,952 | 168 TQ2_0 + 123 F32 | Accepted exact compact representation |
| `maple-preview-row-alpha-tq2.gguf` | 5,841,646,560 | 168 TQ2_0 + 2 Q8_0 + 289 F32 metadata/scale tensors | Row-alpha experiment; redundant after native block-scale solution |
| `maple-preview-row-alpha-tq2-exact-head.gguf` | 7,669,740,512 | 168 TQ2_0 + 291 F32 metadata/scale tensors | Row-alpha exact-head experiment; redundant after native block-scale solution |

Recorded hashes are in `../maple-preview/conversion/*.sha256`, `../maple-preview/ternary/*.sha256`, and `../maple-preview/compact/*.sha256`. The accepted artifact is `fd68a5f315189367dfae84d44fc066386e2d37ba6544f529304f21d482f24db4`.

## Community encodings

Hugging Face metadata was queried on 2026-08-06. Repository revisions and file names are recorded in `weight-inventory-community.tsv`; 74 GGUF, MWG and safetensor objects with exact sizes and LFS/Xet hashes are recorded in `weight-inventory-community-files.tsv`.

| Repository | Revision | Encoding | Relationship |
|---|---|---|---|
| `stamsam/maple-preview-gguf` | `4ca4ce6a9c697c5d35a65b20a9f5cc12bc78335f` | F16, Q4_K_M and TQ2_0 GGUF | Repository declares a conversion of the official checkpoint; tensor equality was not reverified |
| `terasut/maple-preview-GGUF` | `0b12f23e344b2f226d8de96c2af73e458e88abbf` | Q4_K and Q8 GGUF | Repository declares a conversion of the official checkpoint; tensor equality was not reverified |
| `ProCreations/maple-preview-webgpu` | `93c57e5b91e8d1d4a8c555e99edd179931f29a1e` | WebGPU pack v1 | Lossless repack of official 2-bit MLX revision `361db...`; no new weights |
| `ProCreations/maple-preview-webgpu-v2` | `98e91be2c6226dd318c01d65dbb847316aab0653` | WebGPU tile4_rows pack v2 | Alternative lossless row layout of the same official compact weights |
| `ApacheOne/maple-preview` | `3fc807920d83fad9c7f7bfe6bc99ff5b8a2e2f83` | Safetensor mirror | Mirror/derived copy, not a distinct trained checkpoint |
| `wabibito/Onyx-maple-preview-2bit` | `cad4364d0c38de095c6c95eb55f1762cef71bb4b` | Onyx 2-bit safetensor repack | Derived compact encoding, not independently trained weights |

Repository READMEs describe these artifacts as mirrors, conversions or layout repacks of the official BF16 or compact revisions. This inventory records that declared provenance, repository revisions and object hashes. It does not prove tensor equality to the official shards. No inspected repository declares an independently trained Maple checkpoint.
