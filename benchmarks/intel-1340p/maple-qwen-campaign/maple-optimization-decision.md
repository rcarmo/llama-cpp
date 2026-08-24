# Maple representation and Sigma optimization decision

## Accepted hotspot profile

The accepted exact compact model was profiled on build `7f3f259a1`, Intel i5-1340P, eight strict P-core threads, batch 2048 and ubatch 512. The 64-token probe reached 75.29 tok/s.

| Class | Wall time | Share of graph wall | Logical reads |
|---|---:|---:|---:|
| Routed expert `MUL_MAT_ID` | 1,251,240 us | 73.6% | 10,071,108,096 bytes |
| Dense `MUL_MAT` | 392,743 us | 23.1% | 2,844,557,312 bytes |
| All matrix operations | 1,643,983 us | 96.7% | 12,915,665,408 bytes |
| Attention | 18,506 us | 1.1% | 78,532,608 bytes |
| Other and copy | 37,397 us | 2.2% | 4,769,303,776 bytes |
| Total graph | 1,700,174 us | 100% | 17,763,501,792 bytes |

Evidence: `../maple-preview/tuning/profile-final-pp64.err` and `profile-final-pp64.jsonl`.

The profile rules out another graph-level fusion campaign. Exact TQ2/F32 matrix work, especially routed experts, is the justified hotspot. The F32 vocabulary head is about 1.24 GB and matters to decode memory traffic, but it cannot materially improve prompt ingestion because routed expert matrices dominate prompt wall time.

## ISA limits

The accepted path keeps activations in F32 to preserve exact compact-model numerics. The AVX2 kernel decodes each 2-bit ternary code to F32, applies the stored FP16 row alpha, then uses F32 FMA. It supports two weight rows and either one or two activation rows. AVX-VNNI integer dot products cannot accelerate this path without quantizing activations, which changes the declared numerical tier. VNNI remains appropriate only for lossy Q8 activation paths already rejected for exact quality.

Evidence: `ggml/src/ggml-cpu/ggml-cpu.c`, `type_traits_cpu[GGML_TYPE_TQ2_0]`, and `ggml_vec_dot_tq2_0_f32`.

## Candidate decisions

| Candidate | Performance | Numerical result | Decision |
|---|---|---|---|
| Q8_0 projections/head | 128.89 tok/s at 4K, 33.21 tok/s decode | Route divergence; hidden NRMSE 6.51e-2, logits 4.90e-2 | Reject exact tier |
| Generic TQ2/Q8_K activation and Q8 head | 201.91 tok/s at 4K, 63.87 tok/s decode | 2476/2880 routes; hidden NRMSE 6.66e-2, logits 5.25e-2 | Reject exact tier |
| External row-alpha TQ2 | Larger 459-tensor files | Correctness experiment superseded by native TQ2 block scale | Reject as redundant |
| Exact TQ2/F32, scalar/early kernel | 59.32 tok/s at 512; 18.86 tok/s decode | Exact tier | Superseded |
| Exact TQ2/F32 AVX2 2x2 dense | 74.04 tok/s at 512 | Exact tier | Retained |
| Exact TQ2/F32 AVX2 2x1 expert | 75.61 tok/s at 512; repeated decode 20.96 tok/s | 2880/2880 routes; hidden 8.69e-7; logits 9.81e-7 | Accepted |
| F32/BF16/F16/Q4 vocabulary head | Lower bandwidth but changes exact logits or increases artifact size | No plausible exact-tier gain over accepted F32 head | Do not generate |
| AVX-VNNI ternary/F32 | Requires activation quantization for integer dot | Violates exact tier | Do not implement |
| Iris Xe offload | Prior end-to-end CPU result is faster; transfer/dispatch cannot address routed CPU expert hotspot | No bandwidth case | Do not revisit |

The accepted 2x2/2x1 change exceeds 2% in both phase benchmarks: 59.32 to 75.61 tok/s is +27.5% at 512 prompt tokens, and 18.86 to a repeated 20.96 tok/s is +11.1% for decode. These are prompt and decode phase measurements, not a repeated end-to-end candidate delta. This campaign does not promote a new representation on that basis.

## Numerical gates

The accepted compact representation passes:

- route IDs: 2880/2880;
- routing-score NRMSE: 4.73e-7;
- final-hidden NRMSE: 8.69e-7;
- logit NRMSE: 9.81e-7;
- top-1: 15/15;
- mean top-32 overlap: 32/32;
- mean KL: 2.88e-12, maximum KL: 1.53e-11;
- F32 KV tokenwise/batched cache equivalence: NRMSE 2.98e-7;
- F16 KV tokenwise/batched operational equivalence: NRMSE 1.24e-4;
- deterministic benchmark repeats: decode 20.9462, 20.9720 and 20.9522 tok/s (0.0645% range).

Evidence: `../maple-preview/compact/parity-native-tq2-2x2-2x1.json`, `exact-head-vs-reference.json`, `../maple-preview/parity/cache-equivalence-f32-f32.txt`, `cache-equivalence-f32-f16.txt`, and `../maple-preview/compact/tg16-native-tq2-2x1-serial.jsonl`.

The known-next-token requirement is represented by full top-1 agreement across all 15 oracle positions and API smoke outputs after rebuild. There is no separate named single-token fixture; the stronger full-logit/top-k oracle is retained instead of inventing a redundant gate.

## Promotion decision

No new multi-gigabyte candidate should be generated. The accepted exact TQ2/F32 representation and AVX2 2x2/2x1 kernels are the only surviving exact-quality option and have passed the focused regression, API, Pi and production-context suites. The campaign's repeated end-to-end promotion threshold applies only to a new surviving candidate; none exists. Maple remains an explicit prompt-heavy alternative; Gemma remains the primary local provider.
