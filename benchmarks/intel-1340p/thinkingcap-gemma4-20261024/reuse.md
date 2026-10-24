# Prior-feature reuse checklist

- [x] Feature: Native fixed replay/finite checks
  - Source: tests/test-flint-handoff.cpp
  - Applicability: Same typed llama API and code fixture; supports additional model architectures
  - Status: adapted
  - Implementation: experimental moe-replay-v 2.cpp and moe-replay-expanded.cpp
  - Evidence: 34 cross-model observations finite; no production guard removed

- [x] Feature: CPU pool and affinity controls
  - Source: common/cpu.cpp; existing Flint campaign
  - Applicability: Applicable to CPU placements; old winning masks require retest
  - Status: adapted
  - Implementation: external harness and captured 8P service wrapper
  - Evidence: Seven placements screened; eight ABBA/BAAB confirmations;8P full-logit hashes match 4P

- [x] Feature: Compact SWA/server inheritance
  - Source: docs/local/intel-i 5-1340p/gemma-local-provider-runbook.md; llama context parameters
  - Applicability: Gemma 4 physical 64k needs compact cache rather than API full-SWA default
  - Status: adapted
  - Implementation: v 2 and expanded context setup
  - Evidence: 1920+250MiBKV matches CLI; oversized full-SWA starts preserved/excluded

- [x] Feature: Mapped raw experts without extra CPU buffers
  - Source: llama_model_params.use_extra_bufts; original ThinkingCap no-repack wrapper
  - Applicability: Full MXFP4 repack duplicates storage and fails old budget
  - Status: applied
  - Implementation: MOE_REPACK=0; live --no-repack
  - Evidence: 17.72GiB64k estimate; original coding 6/6; recommended quant retained

- [ ] Feature: GPU-prefill/state ownership handoff
  - Source: tests/test-flint-handoff.cpp; historical Gemma zero-copy evidence
  - Applicability: New Gemma 4MoE must pass telemetry, placement, lifetime and memory gates
  - Status: rejected
  - Implementation: Separate short trained pilot and 64k admission bound
  - Evidence: Short startup telemetry rejection;64k bound exceeds old 20 GiB; no valid timing/handoff

- [ ] Feature: GPU expert caches
  - Source: ggml/src/ggml-vulkan/ggml-vulkan.cpp; Flint 4 GiB cache trial
  - Applicability: Needs an admitted useful GPU parent for this quant/context
  - Status: deferred
  - Implementation: None promoted for ThinkingCap
  - Evidence: No parent qualified under 20 GiB; larger-budget tuning stopped to prioritise comparison

- [ ] Feature: Dense Q4 scheduling and E4B MTP
  - Source: benchmarks/intel-1340p/gemma-zc-speed-20260916/README.md; common/speculative.cpp
  - Applicability: Dense Q4 arithmetic and old E4B draft do not match this MoE quant/model pair
  - Status: not applicable
  - Implementation: None
  - Evidence: No matching draft supplied; MXFP4/Q5/Q6 expert types differ from denseQ4 path

- [x] Feature: UI/provisioning and rollback
  - Source: scripts/ui-assets.cmake; scripts/agent-build.sh; preserved service container
  - Applicability: Reusable assets and known baseline avoid a separate server integration
  - Status: applied
  - Implementation: DefaultUION, fail missing requestedUI; existing runtime/staticUI; preserved 4P container
  - Evidence: Path tests, offline missing-assets failure, positive embedded server build; live 8P HTML/API READY, EOG
