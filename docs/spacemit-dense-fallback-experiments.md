# SpaceMIT dense fallback experiments (Gemma-first)

Branch: `exp/dense-fallback-profile`

Goal: stop broad assembly tweaks and convert measured Gemma dense fallback projection/attention `mul_mat` paths into narrow SpaceMIT-friendly default paths.

## Profiling setup

Fallback profiler commit:

- `68259ff spacemit: profile fallback mul_mat tensors`
- Enable with `SPACEMIT_PROFILE_FALLBACK=1`.

Representative profiling command:

```sh
SPACEMIT_PROFILE_FALLBACK=1 \
build/bin/llama-bench \
  -m /home/me/models/gguf-misc/gemma-4-E4B-it-Q4_K_M.gguf \
  -t 8 -p 0 -n 64 -r 1
```

Post-routing Gemma fallback profile (`/tmp/fallback-gemma-allflags-tg64.*`):

- `tg64`: `6.74 tok/s`
- `non_cache_count=0`
- remaining fallbacks are only F16 attention cache matmuls:
  - `2730 cache_*_l* kq-*`
  - `2730 cache_*_l* kqv-*`
  - collapsed shapes:
    - `2275 cache_v_l* dst=kqv-* f16xf32 nrows=1 ne0=256,256,2,1 ne1=256,1,8,1 nb0=2,512,131072,524288 nb1=4,1024,1024,8192`
    - `2275 cache_k_l* dst=kq-* f16xf32 nrows=1 ne0=256,256,2,1 ne1=256,1,8,1 nb0=2,1024,512,262144 nb1=4,8192,1024,8192`
    - `455 cache_v_l* dst=kqv-* f16xf32 nrows=1 ne0=256,512,2,1 ne1=256,1,8,1 nb0=2,512,262144,524288 nb1=4,1024,1024,8192`
    - `455 cache_k_l* dst=kq-* f16xf32 nrows=1 ne0=512,256,2,1 ne1=512,1,8,1 nb0=2,2048,1024,524288 nb1=4,16384,2048,16384`

## Accepted default routes

### Q4_K 32x256 route

Commit lineage: `ce64713 spacemit: gate q4k hp 32x256 path`, later defaulted after correctness/perf validation.

Status: default on SpaceMIT IME2 for Q4_K tensors with `ne[1] % 32 == 0` and `ne[0] % 256 == 0`.

The diagnostic reference switch `SPACEMIT_EXPERIMENTAL_Q4K_32X256_REF=1` remains guarded in `ime2_kernels.cpp` for targeted comparisons only.

Correctness:

```sh
build/bin/test-spacemit-q4k-correctness 8
# q4k_RC=0
```

### F16 attention fallback matvec4

Commit: `46f972d spacemit: gate f16 fallback matvec4 path`

Status: helper retained for correctness coverage and matvec8 tails; the broad runtime env-gated route was removed when the Gemma-specific matvec8 route became the default.

Original scope: generic fallback `GGML_TYPE_F16 × vec_dot_type F16`, `num_rows_per_vec_dot == 1`; computes 4 adjacent rows per vectorized helper call.

Correctness:

```sh
build/bin/test-spacemit-f16-matvec4
# f16_RC=0
```

Result: small decode win; later superseded by separately gated 8-row variant for Gemma decode experiments.

### BF16 projection Q8 route

Commit: `8f56d69 spacemit: gate bf16 projection q8 route`

Status: default on SpaceMIT IME2 when the tensor name and shape predicates match.

Scope: exact tensor name `per_layer_model_proj.weight`, BF16 2D weights, dimensions aligned to Q8_0 32x32 packing.

Correctness:

```sh
build/bin/test-spacemit-bf16-proj-q8 8
# bf16_RC=0
# target-like k=2560 NMSE ~= 2.9e-5
```

Effect:

- `per_layer_model_proj.weight` disappeared from fallback logs.
- Gemma decode improved roughly `6.10 ± 0.02 → 6.58 ± 0.04 tok/s`.
- Gemma `pp16` improved roughly `30.26 → 46.97 tok/s`.

### F32 projection Q8 route

Commit: `45ae189 spacemit: gate f32 projection q8 route`

Status: default on SpaceMIT IME2 when the tensor name and shape predicates match.

Scope: Gemma block projection tensor names only:

- `blk.*.inp_gate.weight`
- `blk.*.proj.weight`

Correctness:

```sh
build/bin/test-spacemit-f32-proj-q8 8
# f32_RC=0
# NMSE ~= 2.5e-5 .. 2.9e-5
```

Effect:

- F32 projection fallback lines disappeared.
- Gemma `tg128`: `6.59 → 6.84 tok/s`.
- Gemma `pp16`: `47.04 → 51.17 tok/s`.
- Qwen REAP short check showed only small noise in decode and no corruption.

### F16 attention fallback matvec8

Commit: `78b0372 spacemit: gate f16 fallback matvec8 path`

Status: default on RISC-V when the Gemma-style cache attention name and shape predicates match.

Scope: Gemma-style F16 cache attention fallback only: `src0` name starts with `cache_k_l` or `cache_v_l`, `dst` name starts with `kq-` or `kqv-`, and `src1->ne[2] == 8`. It computes 8 adjacent F16 rows per helper call and falls back to matvec4/tail rows inside the 16-row block. The `src1->ne[2] == 8` predicate intentionally excludes the measured Qwen REAP cache-attention shape (`src1->ne[2] == 16`).

Correctness:

```sh
build/bin/test-spacemit-f16-matvec4
# validates both ggml_vec_dot_f16_4 and ggml_vec_dot_f16_8
# f16_RC=0
```

Gemma A/B with BF16+F32 projection routes held constant:

- before narrowing: no F16 route `tg128 6.72`, `tg16 6.73`, `pp16 51.03`; matvec4 `tg128 6.80`, `tg16 6.79`, `pp16 50.87`; matvec8 `tg128 6.83`, `tg16 6.84`, `pp16 50.88`.
- after narrowing to Gemma-style cache attention: no F16 route `tg128 6.69`, `tg16 6.69`, `pp16 50.91`; matvec8 `tg128 6.81`, `tg16 6.79`, `pp16 50.76`.

Qwen REAP shape check:

- Qwen cache attention has the same `ne0=256,256,2,1` family, but `src1->ne[2] == 16`, so the narrowed matvec8 predicate does not select it.
- Qwen short benchmark remains noisy (`pp16` varied from `24.53 ± 3.44` baseline to `27.41 ± 0.28` with the flag; `tg16 7.57 → 7.46`), but the code path is Gemma-shape-gated.

Decision: make default, but keep it shape/name-restricted. It is a small Gemma decode win, not a prompt route.

## Rejected / not kept

### Generic F32/BF16 4-row dense vec-dot reuse

Reason: flat/noisy for Gemma and harmful for Qwen prompt.

Observed examples:

- Gemma E4B Q4_K BF16: `6.12 → 6.12 tok/s`
- Gemma E4B Q4_K F32: `6.11 → 6.13 tok/s` noise
- Qwen BF16 prompt regressed: `27.80 → 26.72 tok/s`

Decision: rejected; do not revive without new profiler evidence.

## Bounded validation pattern

Avoid `llama-cli` for validation; it previously dropped into an interactive prompt loop and hung.

Use bounded commands only:

- short `llama-bench`
- `timeout`-wrapped correctness tests
- non-production `llama-server` smoke on `127.0.0.1` with explicit PID cleanup

Final server smoke examples passed with all guarded routes and no stale `llama-*` processes left behind.
