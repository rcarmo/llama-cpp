# Trusted-reference feasibility checkpoint

Date: 2026-10-08. Stage: establish provenance/feasibility; no hosted inference request and no weights downloaded.

## Frozen local candidate
- Exact candidate repository/revision: ggml-org/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-GGUF @ `8a08a1c81dadcc75d35dbb96016cfd344b632e67`, Q4_0 file 18,898,091,584 bytes, verified SHA256 `61f87e75974e4b535dcdf9aad056541a9514f1dfa4538b463b081d19b7a00e3c`.
- Original and A/B held-out suites/results copied byte-identically into this checkpoint. Their checksums are below.
- Official reference repository `nvidia/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-BF16`, API revision `a9904d24bcc1d289a1950fa9d2b978c47cf903b9`. Its card identifies BF16 as the reference weights and recommends an 80GB H100/A100; BF16 GGUF file is63,181,504,576 bytes.
- Downloaded official `chat_template.jinja` from that immutable revision. After trimming terminal whitespace, official and GGUF repository templates match exactly:9,867 bytes and SHA256 `58933db77d3099b4f78c55a38347a72e1ea05b97d6bd8f38775303dc0194e0a9`. Backend-specific Jinja/tokenization rendering parity is not yet established.

## Blocker
Only Q4 Nemotron weights are local; no BF16/FP8/safetensors/cache. `/var/home` had61,598,363,648 bytes free (~57.4GiB); host32.58GB RAM (~30.5GB available). The official BF16 GGUF is63.18GB, exceeds free space before staging/build, and exceeds current20GiB model-run cap. Official card targets80GB GPU. Project policy forbids using host swap for model-fit. Do not start download, widen caps, or repurpose unrelated Maple weights. Local exact BF16 comparison is infeasible under current resource and preserve-data constraints.

Hugging Face API lists a live Fireworks provider for this model ID, but provider weights are not pinned to NVIDIA's revision, loaded precision/template behavior is unverified, and no Fireworks credential is configured. Thus it is not a trusted same-checkpoint reference. No prompts were submitted. Ask for a provisioned authorized exact-reference endpoint or additional isolated compute/storage to proceed.

Conclusion: provenance/template checked, diagnostics frozen. Reference-versus-Q4 inference is blocked, not passed; do not attribute errors to Q4. Original schema-transition experiment was also attempted then rejected/reverted: ten original/held-out CPU+handoff attempts plus three CPU retries failed before a generated turn (`</think>` and `{` emptied the grammar stack). Artifacts are under `schema-transition/`; the sampler change was reverted. Common grammar CTests pass but don't verify staged reasoning→answer schema activation.

Independent safeguards now verified: deterministic evaluator confirms scoped expense and return exceptions, keeps unresolved source facts `unknown`, and rejects invented `R20`; an evidence-directed single repair changes the B handoff LRU falsy-value existence guard and CPU/handoff each pass the frozen260 assertions. Rerunning the unchanged original 8-task suite once/profile scoresCPU3/8,H5/8; CPU has new LRU and duplicate-edge topo regressions, policy/conflict failures and incident truncation remain. Details are in `../quality-fix/README.md` and its `repeat-R1/` evidence.

Compute was drained and DRM/lm ports checked empty after tests. No services restored. Qwen/Gemma/speech remain OFF. No publication/deployment.

## Checksums
58933db77d3099b4f78c55a38347a72e1ea05b97d6bd8f38775303dc0194e0a9  /var/home/agent/workspace/reports/nemotron-lightning-20261007/reference/official-chat-template.jinja
7050b34343f80cd66c26034a7761eccbb20d23adf314e764fc3a0602b4594bc6  /var/home/agent/workspace/reports/nemotron-lightning-20261007/reference/gguf-repo-chat-template.jinja
1ade0ad7f3b31502aa2f86485b41ee216f1617273544bbabec8d3c4a989e3a04  /var/home/agent/workspace/reports/nemotron-lightning-20261007/reference/suite-original-A.json
5476c53ff9b697a9fe687a5fbfbeee58b75cc94224a4aafc30389e4c2608f59e  /var/home/agent/workspace/reports/nemotron-lightning-20261007/reference/suite-A+B-heldouts.json
7ca1804a70a3070561b9781abb1d0b45b80371965c03ac82e49a0a02f140bda7  /var/home/agent/workspace/reports/nemotron-lightning-20261007/reference/results-A.json
c0118ca37ff0b9b70f3fc3d62337a1a60649f90d1ed7281386da272a6d50e17c  /var/home/agent/workspace/reports/nemotron-lightning-20261007/reference/results-B.json
