# Maple, Gemma and Qwen campaign report

Campaign date: 2026-08-05 to 2026-08-06. Source commit: `78616cbadf8f6aa488f4913e98f1073c22f81017`. Build commit: `7f3f259a1` (build 10573, Clang 22.1.8).

## Decision

Keep Gemma 4 E4B as the primary local Pi provider. Keep Maple exact compact as an explicit prompt-heavy alternative. Keep Qwen as a repository-grounded but slow one-slot option. Do not change the hosted default. Do not replace any installed provider profile.

No new Maple representation is promoted. The accepted exact TQ2/F32 AVX2 representation is the only candidate that passes the exact-quality tier. Its phase benchmarks exceed 2%, but this campaign did not measure a repeated end-to-end candidate delta and therefore does not use that result as a new promotion gate.

## Matched quality

| Model | Bounded API | Real Pi | Blind substantive review |
|---|---:|---:|---|
| Maple | 4/6 | 3/4 | 3rd |
| Gemma | 4/6 | 3/4 | 1st |
| Qwen | 3/6 | 4/4 | 2nd |

All three passed refusal, strict JSON and valid required-tool syntax. Gemma alone obeyed `max_results: 3`. Qwen alone retrieved the explicit repository disable site correctly. All three passed constrained edit plus independent test, exact instruction and cancellation recovery. All three failed at least one long-answer convergence or factual-quality gate. The blind mapping was A=Qwen, B=Maple, C=Gemma; the independent order was gemma > qwen > maple.

## Matched performance

Prompts come from one source and are exact 512, 4,096 and 32,768 tokens under each model's tokenizer. Services ran serially with eight strict P-core threads, accepted batch/KV/MTP profiles, a below-60 C and load-below-1.5 start gate, and a three-sample 97 C abort. First-token latency is server prompt time plus one generated token. Generation uses an exact 512-token prompt and 64 output tokens.

| Model | pp512 tok/s | pp4K tok/s | pp32K tok/s | tg64 tok/s | TTFT 512 | TTFT 4K | TTFT 32K | Configured slots |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Maple | 76.03 | 71.79 | 56.91 | 18.77 | 6.73 s | 57.06 s | 575.79 s | 2 |
| Gemma | 65.24 | 60.96 | 44.32 | 25.77 | 7.85 s | 67.19 s | 739.31 s | 2 |
| Qwen | 31.89 | 26.87 | 10.95 | 11.40 | 16.06 s | 152.45 s | 2993.38 s | 1 |

Maple is the fastest prompt processor at every matched size. Gemma is the fastest generator. Qwen's first 2,400-second 32K attempt reached 28,672 tokens before timeout; the reported row comes from the later completed trial.

## Resources

| Model | Peak RSS GiB | Peak PSS GiB | Process swap KiB | Process major faults | Host swap in/out pages | Peak temp |
|---|---:|---:|---:|---:|---:|---:|
| Maple | 11.85 | 11.85 | 0 | 0 | 1 / 0 | 90 C |
| Gemma | 11.79 | 11.79 | 0 | 0 | 0 / 0 | 91 C |
| Qwen | 13.21 | 13.20 | 0 | 2 | 6169 / 0 | 94 C |

Host swap deltas are reported separately from process swap. Small host swap-in or global fault deltas can come from unrelated host pages. At least one matched process wrote swap or incurred a major fault; inspect the telemetry before accepting the run.

## Cached long-prefix operation

Cached results are not presented as matched because profile support differs.

| Model | Operational evidence |
|---|---|
| Maple | 65,536-token cold prompt at 45.66 tok/s; 124,000-token extension restored 65,536 and processed 58,464 at 25.10 tok/s; a separate two-request trial used both 131,072-token slots at 18.74 generation tok/s each; peak PSS 14.70 GiB |
| Gemma | Dedicated 12,288 MiB prompt-state cache; prefix test reused 5,753/5,761 tokens and processed 8 on the second request; two 131,072-token slots |
| Qwen | Separate RAM prompt-state cache intentionally disabled; one 131,072-token slot and same-slot reuse only, preserving memory headroom |

## Maple representation decision

The official BF16, official compact MLX and runtime revisions are pinned. Eight local GGUF layouts and community GGUF/WebGPU/Onyx packs are inventoried in `weight-inventory.md`. Community repository READMEs declare mirrors, conversions or layout repacks; this campaign records their revisions and object hashes but does not reverify tensor equality.

The accepted pp64 profile attributes 96.7% of graph wall time to matrices: 73.6% routed experts and 23.1% dense matrices. The accepted exact TQ2/F32 AVX2 2x2 dense and 2x1 expert kernels improve pp512 from 59.32 to 75.61 tok/s (+27.5%) and decode from 18.86 to a repeated 20.96 tok/s (+11.1%). These are phase benchmarks, not a repeated end-to-end candidate comparison. AVX-VNNI requires activation quantization and therefore cannot accelerate the declared exact F32 activation path.

The accepted model passes 2880/2880 routes, hidden/logit NRMSE below 1e-6, 15/15 top-1, 32/32 mean top-32 overlap, mean/max KL 2.88e-12/1.53e-11, F32/F16 KV equivalence, deterministic repeats, focused native regressions, API/SSE/tools/cancellation, production context, Pi and agentic acceptance. Generic Q8 and TQ2/Q8-head candidates are faster but fail route and state/logit quality gates.

See `maple-optimization-decision.md` for the complete candidate disposition.

## Rollback

- Maple rollback: commits `7f3f259a17` and `78616cbad`, model SHA-256 `fd68a5f315189367dfae84d44fc066386e2d37ba6544f529304f21d482f24db4`, service `llama-maple-local-provider.service`, endpoint `127.0.0.1:8093`.
- Primary local provider remains `local-gemma/gemma-4-e4b-qat-mtp`.
- Hosted default remains unchanged.
- No automated push or pull request is part of this campaign.
