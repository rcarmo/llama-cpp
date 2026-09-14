# Full synthetic Q6 projection screen

The unchanged two-query kernel passes exact output comparison on the full262144-row x4-query x2560-inner projection. Directly generated valid quantised weights occupy550,502,400 bytes; all1,048,576 output floats are finite and bit-identical to the original x86 reference.

Eight alternating pairs: reference median27.585797ms, candidate24.358584ms (-11.70%), candidate faster in6/8 pairs. All individual timings are retained in `q6-full-8t/stdout.csv`. The unit ran1.010s,peak545.6MiB,swap0,throttle0,no competing workers,host reserve above6GiB; services unchanged and all workers drained.

This advances the candidate beyond the earlier4096-row screen, but remains a synthetic kernel test. Weight values are directly generated, not trained weights; the standalone loop approximates16-row tiling rather than executing the GGML chunk scheduler. Actual backend dispatch, activation quantisation, model MTP and task tests are still required. No deployment or production default changed.

Next isolated backend candidate uses the original activation conversion and chunk ownership, selecting the pair kernel only for Q6_K rank2 width4 with original Q8_K precision and contiguous weights/output. Other widths/types/precision retain the old path; odd chunk-column tails use the original vec_dot. Runtime enablement is explicit and fixed once at CPU initialisation. Backend on/off output equality and trace evidence must pass before a trained run.
