# Shared-bank route coverage, 22 November 2026

Question: do effective layers24/36 require experts absent from the first layer6 sparse upload? The retained transfer trace does not contain logical route values, so cannot answer this. One new128/8 diagnostic will log host route masks before copying and GPU bank buffer/data identities after copies. Keep all transfer hooks, args, workload and restoration unchanged. No performance comparison, placement sweep or production change. All old namespaces stay frozen.

Admission: existing idle-production/no-foreign-native guards; build/tiny tests4GiB/swap0/2CPU; model24964497408bytes/swap0/16CPU with full backing+RSS+deduplicated DRM+256MiB supervision and2GiB reserve. Use fresh supervised profile-coverage; exact cache768 restore on every exit. No push/boot/other services/other agents.

## Prior-feature reuse checklist

- Feature: bounded transfer/controller instrumentation
  - Source: profile-transfers and copy-timing-v2, evidence3a925517f
  - Applicability: same model/graph, one unanswered route-value question
  - Status: adapted
  - Implementation: route-coverage and profile-coverage
  - Evidence: original controller/manifests preserved;12 CPU/tiny Vulkan gates repeated only for the new instrumented binary
- Feature: default sparse expert callback
  - Source: src/llama-context.cpp::sched_copy_experts
  - Applicability: logical strided I32 IDs determine copied experts even with cache0
  - Status: adapted
  - Implementation: read-only route-mask helper; GPU allocation identity log
  - Evidence: unit checks of stride holes, negative ids, bounds and malformed layouts; first-use mask must match uploaded expert coverage
- Feature: existing CPU-view and shared owner
  - Source: ggml-vulkan CPU-view API and test-vulkan-cpu-view.cpp
  - Applicability: source route buffer must be CPU-accessible; model mmap owner cannot be wrapped directly
  - Status: deferred
  - Implementation: none for model ownership
  - Evidence: keep ownership unchanged; no direct wrapping or new state handoff without lifecycle proof

Interpretation: require three route masks and bank records per prefill. Compare each mask against prior uploaded ranges, accounting for any warmup reuse only when buffer/data identity matches. Same-profile logits are a control, not quality proof. If later masks miss coverage, stop GPU qualification and retain the reproducer; do not silently change callback behaviour.
