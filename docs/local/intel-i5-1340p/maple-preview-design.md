# Maple-Preview CPU inference design

Status: implementation design accepted for the private fork on 5 August 2026.

## Scope

- Text-only `deepgrove/maple-preview`.
- CPU support on the Intel Core i5-1340P first.
- Exact output head first.
- OpenAI-compatible serving and PiClaw integration after numerical parity.
- No upstream submission, commit, or push is part of this implementation run.

## Pinned inputs

The reference manifest is in `benchmarks/intel-1340p/maple-preview/reference/manifest.json`.

- Main model revision: `ac1ddd79d2b5cb4406f5d2bebdf95406ce505a07`.
- Compact checkpoint revision: `361db5da5e74ff6fcdd852d478e1f266ce11013a`.
- DeepGrove MLX runtime revision: `eba96c16158f032821b0bf374ea1421cfddef0a9`.

The compact checkpoint is the conversion source. Its packed 2-bit values and row scales reconstruct the native ternary weights exactly. Embeddings and the output head use the checkpoint's 4-bit affine representation. Routers remain BF16 and execute in FP32.

## Architecture references

No existing model is a direct match.

- `src/models/step35.cpp` is the primary graph reference for per-layer SWA selection, per-layer rotary dimensions, Q/K RMSNorm, and clamped expert SwiGLU.
- `src/models/qwen3next.cpp` and `src/models/qwen35moe.cpp` provide the plain softmax top-8 routed-MoE layout.
- `src/models/gemma4.cpp` provides the integrated SWA/full KV-cache input path.

Maple uses:

- 24 decoder layers;
- hidden size 2048;
- 16 query heads, 4 KV heads, head dimension 128;
- 256 experts, 8 active, expert intermediate size 512;
- SWA-512 on layers whose index modulo 4 is 0, 1, or 2;
- global attention on index modulo 4 equal to 3;
- partial RoPE over 64 dimensions on SWA layers;
- no RoPE on global layers;
- Q/K RMSNorm;
- FP32 softmax routing followed by top-8 selection and selected-weight renormalisation;
- expert gate clamp `min(gate, 7)` before SiLU;
- expert up clamp `[-7, 7]`;
- separate exact output head.

## Clamp invariant

The generic Step35 clamp path is not semantically identical. It clamps the activated gate for most architectures. Maple clamps the raw gate projection before SiLU. The existing DeepSeek 4 branch in `build_moe_ffn` has the required operation order. Maple must select that operation order without adding a new GGML operator.

## Correctness sequence

1. Convert the compact checkpoint to a high-fidelity GGUF baseline.
2. Compare tokenizer output and the long-position partial-RoPE fixture.
3. Compare every layer output, Q/K/V, routing IDs and routing weights.
4. Compare final hidden states and exact-head logits.
5. Run deterministic generation only after logits pass.
6. Add or retain compact ternary storage only after the exact graph passes.

The CPU reference program is `tools/maple-reference.py`. It reads one tensor or selected expert set at a time and does not require MLX or Apple hardware.
