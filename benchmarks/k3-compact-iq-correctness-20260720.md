# K3 compact-IQ MoE correctness — 2026-07-20

> Historical fixture result: the 22 July campaign extended routed row coverage from 1, 4 and 5 to 1, 2, 4, 5 and 8, replaced full-row per-call packing with direct block packing and added bounded cache validation. See [the current compact-IQ IME2 report](qwen-compact-ime2-20260722/report.md).

## Fixture

`test-spacemit-iq-moe-correctness` creates deterministic two-expert `MUL_MAT_ID` graphs with:

- IQ2_XS, IQ3_XXS, IQ4_XS and IQ4_NL weights;
- 64 output rows, K=512;
- two selected experts per token;
- token/activation row counts 1, 4 and 5;
- one and eight compute threads;
- exact llama.cpp IQ quantizers and dequantizers;
- a scalar double-accumulation reference from the quantized/dequantized weights;
- explicit SpaceMIT extra-buffer allocation;
- structured trace verification.

IQ2_XS uses a deterministic all-ones importance matrix because its quantizer requires one.

## Modes

| Mode | Environment | Expected trace |
|---|---|---|
| Direct compact RVV | `IQ_IME2_TILE=0`, MoE repack off | `path=iq-compact` |
| Per-call IME2 tile | `IQ_IME2_TILE=1`, MoE repack off | `path=iq-compact` |
| Persistent IQ→Q8 repack | `IQ_MOE_REPACK=all`, tile off | `path=ime` |

Every type/row combination passed at both one and eight threads with `bad=0`.

## Accuracy

- Direct RVV IQ2/IQ3/IQ4_XS: approximately 1.47e-5 to 1.69e-5 NMSE.
- Direct RVV IQ4_NL: approximately 2.4e-14 to 3.3e-14 NMSE.
- Per-call IME2 and persistent repack: approximately 1.3e-5 to 3.0e-5 NMSE.
- Persistent repack results exactly match per-call IME2 results because both convert weights to Q8_0 tiles.
- One- and eight-thread results are identical.

## Bugs found and fixed

### Persistent trait precedence

When `GGML_RISCV64_SPACEMIT_IQ_MOE_REPACK=all` installed an IQ→Q8 repack trait, operation dispatch still selected the late-bound compact trait from the tensor's logical IQ type. It therefore interpreted Q8 repacked bytes as compact IQ and produced NaNs/huge errors.

Fix: an installed `src0->extra` persistent repack trait now takes precedence over compact type dispatch.

### One-thread MoE deadlock

The standard IME MoE fast path uses paired even/odd producer-consumer TCM barriers. With `nth=1`, it entered that path and waited forever for a partner.

Fix: the paired fast path now requires `nth >= 2`; one-thread execution uses the normal workspace fallback.

## Dispatch evidence

For each thread count:

- Direct RVV: 12 compact trace lines.
- Per-call IME2: 12 compact trace lines.
- Persistent repack: 12 standard IME trace lines.

This fixture remains the correctness gate for compact-IQ packing and crossover experiments. The current gate covers 80 compact-IQ combinations: four formats, five routed-row counts, one/eight workers and IME2 off/on.
