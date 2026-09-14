# First Q6 pair candidate rejected at correctness gate

`q6-pair-8t` failed before any timing loop: native exit134 with `q6-native.cpp:25: int main(): Assertion '!std::memcmp(a,b,sizeof(a))' failed.` Unit186ms,8.3MiB peak,swap0; no contention or service change. All workers drained and both peers released.

The original source, build recipe and native binary were preserved before adding diagnostics: `source-history/q6-first/`, local `q6-build/test-q6-pair-first`, `evidence/q6-first-source-binary.sha256`, and the run manifest. The harness deterministically regenerates20 vector inputs, but the original assertion did not identify which case failed. Do not guess a cause from the assertion alone.

A diagnostic-only caller now prints n/family/output bits and dumps offending quantised inputs before returning failure. It links the unchanged candidate object; no arithmetic fix or tolerance change has been made. This requires a fresh <=30s1CPU256MiB build/replay admission. No follow-on timing or full-projection claim is authorised by the failed screen.

The initial assembly shows an out-of-line fp16 conversion call and heavy spills, but these explain potential performance cost, not the numerical mismatch. Source inspection identifies a likely harness omission: x86 reference reads `ggml_table_f32_f16`, which `ggml_cpu_init()` fills, while this standalone harness calls only `ggml_init()`. The diagnostic now recomputes the exact same failed input after `ggml_cpu_init()` and reports whether it matches. This hypothesis is not verified until the admitted replay runs. Locate the mismatch first; then qualify any correction against exact reference output before measuring it.
