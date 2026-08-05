# Maple Preview on Intel i5-1340P

This directory contains the curated evidence for the Maple Preview implementation. Raw tensor captures and generated GGUF files are excluded from Git. The full local evidence archive is `../maple-preview-evidence-2026-08-05.tar.zst` relative to the canonical repository directory.

## Accepted compact artifact

The production-shaped artifact uses:

- 168 TQ2_0 ternary projection and expert tensors;
- FP32 routers, norms, embedding and exact vocabulary head;
- F16 KV for normal operation and F32 KV for oracle parity;
- an opt-in TQ2_0 by F32 CPU dot path for Maple;
- AVX2 2x2 dense and 2x1 expert kernels;
- no external row-scale tensors. TQ2_0 stores the original row alpha in its FP16 block scale.

Artifact:

```text
projects/models/maple-preview-tq2-exact-head.gguf
SHA-256: see compact/maple-preview-tq2-exact-head.sha256
Size: 7,587,790,848 tensor bytes
Tensors: 291 total, 168 TQ2_0 and 123 F32
```

## Numerical results

The 15-token oracle fixture uses exact input embedding and F32 KV when isolating graph parity.

| Path | Route IDs | Hidden NRMSE | Logit NRMSE | Result |
| --- | ---: | ---: | ---: | --- |
| Exact F32 graph | 2880/2880 | 8.37e-7 | 8.99e-7 | Pass |
| Generic TQ2_0/Q8_K activation | 2476/2880 | 6.66e-2 | 5.25e-2 | Reject |
| Exact TQ2_0/F32 AVX2 | 2880/2880 | 8.69e-7 | 9.81e-7 | Pass |

The accepted compact path also reaches:

- routing-score NRMSE: 4.73e-7;
- mean reference-to-compact KL: 2.88e-12;
- maximum KL: 1.53e-11;
- top-1 agreement: 15/15;
- mean top-32 overlap: 32/32.

Evidence:

- `compact/parity-native-tq2-2x2-2x1.json`
- `compact/exact-head-vs-reference.json`
- `parity/f32-exact-cache-f32-parity.json`
- `ternary/tq2-parity.json`

## Performance

Strict-affinity tests use eight P-core threads, CPU mask `0xff`, batch 2048 and ubatch 512.

| Path | Prompt | Decode | Notes |
| --- | ---: | ---: | --- |
| Q8 baseline | 128.89 tok/s at 4K | 33.21 tok/s | 21.52 GB artifact |
| Generic TQ2_0 | 201.91 tok/s at 4K | 63.87 tok/s | Rejected for quality |
| Exact TQ2_0/F32 AVX2 | 75.61 tok/s at 512 | 20.96 tok/s | Accepted correctness path; longer prompt sweep pending |

The 2x2 dense kernel improved the exact compact 512-token prompt result from 59.32 to 74.04 tok/s. The 2x1 expert kernel then reached 75.61 tok/s and improved repeated decode from 18.86 to 20.96 tok/s.

Evidence:

- `compact/pp512-native-tq2-2x2-2x1-serial.jsonl`
- `compact/tg16-native-tq2-2x1-serial.jsonl`
- `baseline/README.md`
- `ternary/pp4096.jsonl`
- `ternary/tg16.jsonl`

## Reproduction order

1. Verify the compact source hashes in `reference/manifest.json`.
2. Unpack the compact checkpoint with `tools/maple-unpack.py --dtype f32`.
3. Convert with `convert_hf_to_gguf.py --outtype tq2_0`.
4. Verify the output hash in `compact/maple-preview-tq2-exact-head.sha256`.
5. Run the focused architecture, batch-allocation and x86 quant-dot tests.
6. Run `parity/maple-parity.cpp` with F32 KV and compare with `parity/compare.py`.
7. Run strict-affinity prompt and decode benchmarks.
