# Reference initialisation hypothesis

The admitted replay confirms the reference-initialisation omission. At n=256/family1, pre-init reference output was0,0 while candidate output was `-0x1.4c3e26p+4,-0x1.7610bcp+3`. After `ggml_cpu_init()`, the same reference output is bit-identical (`exact=1`) with the candidate/kernel object unchanged. Exact quantised bytes and hashes are in `q6-mismatch-diagnostic/`. No timing ran.

The first standalone Q6 test called `ggml_init()` but not `ggml_cpu_init()`. In this tree, the x86 reference's `GGML_CPU_FP16_TO_FP32` uses the global `ggml_table_f32_f16`, populated only by `ggml_cpu_init()` in ggml-cpu.c:4155. The candidate instead calls `ggml_fp16_to_fp32`, which computes the conversion directly. Therefore the first mismatch may be an uninitialised reference fixture rather than incorrect candidate arithmetic.

The pending diagnostic links the unchanged candidate object and prints exact outputs/input metadata, writes the first failing quantised buffers, calls `ggml_cpu_init()`, and recomputes the same reference output once. It returns the original diagnostic failure rather than continuing into timings. This establishes cause without erasing the original assertion or changing tolerances.

The diagnostic guard `Q6_DIAGNOSTIC_ONLY` also exits before the matrix if no mismatch occurs unexpectedly. The startup call is now corrected in source. A caller-only rebuild and all20 vector/matrix checks still require separate fresh admissions; no corrected full-suite result exists yet. A single corrected case is insufficient. The first screen remains excluded, and potential register spills/out-of-line conversion overhead remain independent performance questions.
