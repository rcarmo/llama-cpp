# Q6 pair screen passes after reference-initialisation fix

The corrected caller passes20 vector cases with exact bytes/output-stride canaries, then passes the complete4096-row x4-query x2560-inner matrix comparison. The candidate kernel object is unchanged from the first failed fixture. The failure was traced to the reference lookup table not being initialised; that assertion and before/after replay are preserved.

Eight-thread reduced-row screen: reference median0.518480ms, candidate0.4516085ms, -12.90%; candidate faster in all8 pairs. Reference range0.508414-0.547169ms; candidate0.359580-0.500513ms. Sixteen samples,16 invocations/sample. Unit663ms,58.4MiB peak,swap0,throttle0,hostreserveabove6GiB,no competing worker,services unchanged. All workers drained and both peers released.

This is a short resident synthetic screen, not full output-projection or trained latency. The tested row count is4096 versus262144 in the measured model; both k2560 and query width4 match. The simple standalone thread schedule is not the GGML scheduler. Full-shape and actual dispatch tests are required before integration. Preserve the benefit as a candidate even if end-to-end improvement is initially small.

`q6-pair.cpp` still uses an out-of-line half-conversion helper and spills. Those costs did not prevent this screen's gain, but any inline-conversion supplement must preserve exactness and be measured separately. Do not erase the first candidate to improve reported numbers.

Evidence: `q6-pair-8t-r1/`, `q6-summary.json`, `summarize-q6.ts`, `q6-mismatch-diagnostic/`, `verify-q6-diagnostic.ts`. No model/GPU/service deployment or production-kernel modification occurred.
