# Q6 GGML dispatch correctness

The opt-in isolated backend passes exact on/off comparison for ten cases:65 and4096 rows, query widths1,2,3,4,5, inner dimension2560. All outputs also match the direct reference exactly (NMSE0/max_abs0). Trace records exist only when enabled and only for width4; the disabled process uses the old route.

`q6-backend-check` ran4.933s,70.9MiB peak,swap0,throttle0,no competing process,services unchanged. Input conversion and GGML chunk scheduling remain in place. Per-case output hashes and CPU-library/caller identities are recorded in `q6-backend-check/summary.json`; raw outputs permit independent comparison. All workers drained and both peers were released.

The implementation is generated into an isolated build directory; production source/defaults are unchanged. It checks Q6_K/Q8_K, width4, rank2, contiguous weights/output and original precision. Chunk column pairs use the new kernel, odd tails use the original vec_dot. `GGML_XE_Q6_PAIR` is read once in CPU initialisation; tracing is separate via `GGML_XE_Q6_TRACE`.

These tests cover contiguous rank2 shapes and ordinary precision. More layout/precision/type-negative cases and trained MTP output are still required before promotion into portable repository code. The synthetic full-shape gain remains separate from model latency. No deployment occurred.
