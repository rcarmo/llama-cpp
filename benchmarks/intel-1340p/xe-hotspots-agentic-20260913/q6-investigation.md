# Q6_K output projection

The retained p0 profile's largest single CPU node is the target output projection: m=262144,n=4,k=2560, Q6_K weights, 64 calls and 1.121560s aggregate node time. It is separate from the aggregate Q4 FFN hotspot and from the assistant's Q8_0 width1 projection.

`ggml-cpu.c` maps Q6_K to `ggml_vec_dot_q6_K_q8_K`. The x86 implementation in `arch/x86/quants.c:2457` asserts nrc=1. Its AVX2 branch decodes ql/qh bitplanes, applies scales and the -32 correction, accumulates with FMA, then horizontally reduces. Four query columns can repeat weight unpacking and scale construction. Q4 SGEMM changes do not affect this function.

Narrow hypothesis: reuse one weight block's unpacked vectors and scales across two query columns before widening to four. A two-column native diagnostic can compare exact accumulation order to two original calls while exposing register pressure and spills. Preserve the generic function's nrc=1 contract; do not globally change it to imply unimplemented multirow support.

Needed evidence before integration:

- Instrument the actual output projection dispatch and confirm Q8_K conversion/column strides.
- Compare finite values and exact bytes against the existing AVX2 function across QK_K multiples, mixed signs/extreme scales, two/four query columns and tails.
- Compile/disassemble a report-only candidate to check spills; measure at the actual thread count with host guards.
- Keep the full output vocabulary and logits. No approximate projection, pruning or altered softcap.
- Integrate only through an explicit Q6_K width-specific route after a retained matched diagnostic. Then measure combined Q4+Q6+handoff workflow cost, preserving small gains and regressions.

A report-only two-query candidate is now compiled (`q6-pair.cpp`) but awaits admitted native testing. The initial assembly has an out-of-line `ggml_fp16_to_fp32` call plus stack spills; the original x86 code uses an inline table lookup via `GGML_CPU_FP16_TO_FP32`. If the first candidate is slow, a separately preserved inline-conversion version has a concrete hypothesis. Do not conflate it with the unmeasured full projection.
