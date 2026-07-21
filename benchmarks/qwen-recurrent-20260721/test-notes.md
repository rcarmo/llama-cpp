# Recurrent profiler test notes

The broad `DUP,CPY,CONT,GATED_DELTA_NET,SSM_CONV` CPU run reports 15 existing
reference failures in permuted/view `CPY` and `CONT` cases with
`GGML_CPU_RECURRENT_PROFILE` unset. These are not profiler regressions.

The promotion gate for this branch is the focused `GATED_DELTA_NET,SSM_CONV`
suite at one and eight harness workers with profiling both disabled and enabled.
