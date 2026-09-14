# O1 large-tile confirmation

The O0 large-tile probe passed numerical gates but its diagnostic samples were much slower. One O1 confirmation will determine whether the large selector belongs in the combined implementation. Default medium remains the control.

One bounded run `vulkan-o1-screen` executes six fresh processes sequentially: traced OFF, traced ON, untraced OFF/ON/ON/OFF. Same O1 plugin, caller, retained shaders, deterministic input generation, shapes and 2-thread CPU reference. Each arm validates both FFN results (finite and NMSE <=5e-4) before eight batches of four synchronised graph evaluations per shape. Diagnostic processes must record the expected medium/large pipeline for both shapes. Timing processes must emit no dispatch trace.

Bounds and cleanup: 90 seconds, 1 GiB cgroup, 16 MiB maximum swap and 6 GiB host reserve; no CPU quota, with throttle counters, placement samples and competing-worker abort. No models/compilation/services. Explicit owner-drain/close handshake before exit. Fresh three-way admission required.

Use per-process medians and retain all observations. Two untraced processes per arm establish a narrow synthetic screen, not trained speedup. Reject large as a default if both shapes regress; retain its source, correctness and workload scope as an opportunity. Do not spend trained-run time on a strongly slower candidate. If unexpectedly favourable, an O3 trained comparison is required before integration.

The final combined test will use whichever Vulkan selector qualifies, Q6 opt-in and allocation-level shared KV. Compare against the practical pre-batching/Q6-OFF implementation using identical owner/task/tool harness, with no profiling. Do not add stage percentages to estimate whole-workflow gains.
