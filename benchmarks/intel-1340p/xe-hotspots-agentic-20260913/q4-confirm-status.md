# Q4 confirmation preparation

Three isolated variants and the eight-thread native harness compiled successfully under admitted `q4-confirm-build` (1CPU/1GiB/90s). No benchmark ran in that window. Compiler and container drained; both peers were released.

The timing candidate is limited to Q4_0 weight blocks with four query columns under AVX2/F16C. Q5_0/Q8_0 follow the original path. Diagnostic dispatch counting is compiled into a separate variant. Template names are distinct across objects; the linked symbol table confirms local separate reference/candidate functions. The original source already has internal anonymous-namespace linkage, so name separation is additional provenance rather than evidence of a past ODR bug.

The prepared confirmation tests two input families, widths1-5, odd row tails, both actual FFN weight dimensions and Q5/Q8 negative controls. Timing: eight alternating pairs per large shape/family,32 repetitions per sample,8 worker threads. Monitoring: systemd90s/MemoryMax1GiB/MemorySwapMax16MiB, >=6GiB host reserve,50ms resource samples, observed worker affinity and cgroup quota/throttle counters, service identity before/after. Native binary/output/model state is isolated.

Guard unit tests pass (2 tests,10 assertions); runner/summariser and shell syntax checks pass. `q4-confirm-8t` failed in the loader before execution; the separately admitted `q4-confirm-8t-r1` completed all checks after adding the existing libomp path. See `q4-confirm-results.md`: no eight-thread default gain, no kernel integration or model speedup.
