# Q4 confirmation before integration

The first two-thread screen is retained as exploratory evidence. Do not apply its generic template change to production: `tinyBLAS_Q0_AVX` also serves other weight types, while the screen covers Q4_0 only.

Next admitted experiment:

1. Freeze the current source/binary hashes. Generate separate diagnostic and timing variants without changing the repository kernel.
2. Add a diagnostic-only dispatch counter for the new branch; assert that width4 Q4_0 shapes enter it and widths1,2,3,5 do not. Keep timing objects free of counters.
3. Confirm output bytes against the original kernel for widths1-5, odd row tails, both profiled FFN dimensions, and at least two deterministic input families. Preserve nonfinite checks and fallback results.
4. Run the timing variants at 8 threads with verified allowed CPUs, no 2-CPU quota, systemd runtime/memory/swap limits, >=6GiB host reserve, sampled contention and before/after throttle counters. Only one admitted resource owner may run.
5. Keep ABBA/BAAB paired observations, eight pairs per large shape. Report medians/ranges and each pair. Small controls are correctness cases; microsecond thread-start noise does not decide dispatch.
6. Retain a repeatable small gain even if the whole-model effect is initially hard to resolve. Report the uncertain 0.9% screen separately from the stronger first-shape result. Preserve any regression and consider a measured shape restriction instead of discarding the opportunity or widening dispatch blindly.
7. If qualified, make a Q4_0-only production-code candidate. Run backend correctness, then compare with the unmodified CPU library in an actual independently graded task, combined with the qualified allocation-level handoff. Rebuild provenance and sampled mapped-library identity must establish which kernel ran.

The native confirmation is complete:18 cases pass,three of four eight-thread timing groups regress. Step7 is not justified as an eight-thread default; retain the two-thread opportunity and limits in `q4-confirm-results.md`. Q6_K has a different vecdot path and needs its own hypothesis. Vulkan FFN tile changes need shader correctness and dispatch evidence separately. No arbitrary percentage cutoff or sum of individual speedups applies.
