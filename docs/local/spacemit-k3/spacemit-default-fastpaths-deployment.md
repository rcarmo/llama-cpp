# SpaceMIT default fast paths deployment notes

Branch: `exp/dense-fallback-profile`

This note captures the post-cleanup state after making the accepted Gemma/SpaceMIT fast paths default.

## Default fast paths

The following routes no longer require runtime env flags:

- Q4_K 32x256 SpaceMIT IME2 route for Q4_K tensors with `ne[1] % 32 == 0` and `ne[0] % 256 == 0`.
- BF16 projection Q8 route for exact tensor `per_layer_model_proj.weight`.
- F32 projection Q8 route for Gemma projection tensors:
  - `blk.*.inp_gate.weight`
  - `blk.*.proj.weight`
- Gemma-style F16 attention cache matvec8 route:
  - `src0` starts with `cache_k_l` or `cache_v_l`
  - `dst` starts with `kq-` or `kqv-`
  - `src1->ne[2] == 8`

The broad F16 matvec4 env-selectable route was removed. The `ggml_vec_dot_f16_4()` helper remains as correctness coverage and a tail helper inside the default Gemma matvec8 path.

## Remaining diagnostic switches

These remain intentionally guarded:

- `SPACEMIT_PROFILE_FALLBACK=1` — print generic fallback `mul_mat` shape/tensor lines.
- `SPACEMIT_EXPERIMENTAL_Q4K_32X256_REF=1` — diagnostic Q4_K reference comparison path.

The old accepted-route switches are no longer present in code/tests/docs:

- `SPACEMIT_EXPERIMENTAL_Q4K_32X256`
- `SPACEMIT_EXPERIMENTAL_F16_MATVEC4`
- `SPACEMIT_EXPERIMENTAL_F16_MATVEC8`
- `SPACEMIT_EXPERIMENTAL_BF16_PROJ_Q8`
- `SPACEMIT_EXPERIMENTAL_F32_PROJ_Q8`

## Validation commands

Build:

```sh
/home/me/.local/lib/python3.14/site-packages/cmake/data/bin/cmake --build build \
  --target llama-bench llama-server \
           test-spacemit-f16-matvec4 \
           test-spacemit-f32-proj-q8 \
           test-spacemit-bf16-proj-q8 \
           test-spacemit-q4k-correctness \
  -j8
```

Focused correctness tests:

```sh
build/bin/test-spacemit-f16-matvec4
build/bin/test-spacemit-f32-proj-q8 8
build/bin/test-spacemit-bf16-proj-q8 8
build/bin/test-spacemit-q4k-correctness 8
```

Latest default-path result:

```text
f16_RC=0
f32_RC=0
bf16_RC=0
q4k_RC=0
```

Default fallback profile:

```sh
SPACEMIT_PROFILE_FALLBACK=1 \
build/bin/llama-bench \
  -m /home/me/models/gguf-misc/gemma-4-E4B-it-Q4_K_M.gguf \
  -t 8 -p 16 -n 16 -r 1
```

Latest result:

```text
non_cache_count=0
bf16_proj_fallback=0
f32_proj_fallback=0
```

## Default Gemma speed

No experimental flags:

```text
gemma-4-E4B-it-Q4_K_M.gguf tg128: 6.84 ± 0.00 tok/s
gemma-4-E4B-it-Q4_K_M.gguf pp16:  50.90 ± 0.05 tok/s
gemma-4-E4B-it-Q4_K_M.gguf tg16:   6.84 ± 0.00 tok/s
```

Approximate improvement over the original baseline:

- Decode: `~6.10 -> 6.84 tok/s`, about `+12%`.
- Prompt `pp16`: `~30.26 -> 50.90 tok/s`, about `+68%`.

## Production server on Milk-V

Production launch script:

```sh
/home/me/run-qwen-reap-server.sh
```

It runs:

```sh
/home/me/src/llama-cpp-turboquant-feature-turboquant-kv-cache/build/bin/llama-server \
  --models-preset /home/me/models/qwen-reap-models.ini \
  --host 0.0.0.0 \
  --port 8080 \
  --models-max 1 \
  --cache-reuse 256
```

The script calls `/home/me/bin/tcm-cleanup` first when available.

Recommended update flow:

```sh
cd /home/me/src/llama-cpp-turboquant-feature-turboquant-kv-cache
/home/me/.local/lib/python3.14/site-packages/cmake/data/bin/cmake --build build --target llama-server llama-bench -j8
# Stop any previous tmux session/process if present, then:
tmux new-session -d -s qwen-reap '/home/me/run-qwen-reap-server.sh'
curl -fsS --max-time 10 http://127.0.0.1:8080/health
```

Bounded validation should use `llama-bench` and `llama-server` smoke tests only. Avoid `llama-cli` for validation because it previously fell into an interactive prompt loop.

## Benchmark sweep method

Use short bounded `llama-bench` runs for comparability across local GGUF models:

```sh
timeout 900s build/bin/llama-bench -m "$model" -t 8 -p 16 -n 16 -r 3
```

Record failures as failures rather than retrying unboundedly; some `.gguf` files may be multimodal projectors or assistant/draft artifacts rather than standalone text models.
