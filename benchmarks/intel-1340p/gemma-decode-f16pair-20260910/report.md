# F16 paired-dot candidate: correct, no decode gain

The opt-in two-row F16 helper produced **8.4285 tok/s** versus **8.4995 tok/s** for the same runtime with the flag off: **0.84% slower** in eight counterbalanced64K runs. Request wall was1.01% slower. Production remains unchanged.

## Candidate and evidence

The preceding shape profile attributed64% of instrumented node wall to F16 attention. This experiment reused the existing `ggml_vec_dot_f16_unroll` helper, which shares one right-hand vector across two output rows. It does not fuse four MTP queries.

The isolated `abdbeadfb` CPU backend patch applies only with `GGML_CPU_EXPERIMENTAL_F16_PAIR=1`, AVX2/F16C/FMA, F16 input/dot operands, eight query heads/two KV heads, one to four query columns, width512 and a long axis of at least32768. Reference execution is excluded. Remainders use the original dot routine. Existing small-target-batch `libllama`, CPU8/prefill16, draft8/16, MTP3, F16 KV and FA off stay fixed.

Eight synthetic matrix cases per mode cover score/value shapes32K/64K and query counts1/4. All pass against the unchanged CPU reference. Separate candidate traces, however, show the helper executing **only for query count1**. The retained llamafile SGEMM accepts F16 matrix products with at least two query columns, so the hot four-query cases bypass this generic fallback. Correct numerical tests alone do not establish override coverage for every tested shape.

The eight uninstrumented runs used order off/on/on/off/on/off/off/on. Every request restored the same64K state, reused64658 tokens, evaluated25, generated128 and recalled three keys. All accepted90/110 draft proposals and had identical output hashes. Tracing was disabled for timings.

| Median | Off | Paired fallback |
|---|---:|---:|
|Decode |8.4995 tok/s |8.4285 tok/s |
|Request wall |16.823 s |16.994 s |

The small negative result overlaps run variability and supplies no reason to deploy the branch. It does not test an optimised four-query GEMM.

## Build and limits

Only `ggml-cpu.c` was rebuilt and the CPU backend relinked against matching retained objects/headers. The baseline contains the already deployed small-batch target dispatch. No ABI, state layout, quantisation or production runtime changed.

The compiler reported two const-discard warnings because the legacy helper declares mutable pointer arguments although it only reads inputs. Warnings are preserved; no cleanup was mixed into the timed build. Source/build hashes and a reconstructable patch identify the measured variant.

Native tests and timing cover one model geometry and a counting/recall fixture. No additional finite-state/code-quality promotion gates were run because the speed result did not justify promotion. Prior production qualification remains valid within its own bounds.

## Safety and next target

Fresh speech clearance at23:54:24UTC covered the isolated build, native controls and conditional eight-run timing block. Speech/native/socket checks,6GiB reserve,16MiB swap ceiling and automatic current-hybrid restoration remained active. Native stages had zero trial swap. Final restoration verified current small-batch unit/config, actual CPU maps/flag, zero swap, tools/cache and idle slots. No STT configuration or private files were modified.

The actual four-query path is `llamafile/sgemm.cpp::tinyBLAS`. Its16-register path splits the four query columns into smaller tiles. A separate exact-shape2-row/4-query tile could reuse loaded rows across all queries; that hypothesis needs its own reference cases, dispatch proof and uninstrumented gate. Keep this negative fallback experiment rather than rerunning it as if it targeted the hot path.
