# Sigma model-serving status — 23 October 2026

**No model server is deployed by this work.** Earlier Gemma, Maple, Ornith, Qwen and Nemotron serving runbooks describe historical deployments or retained configurations, not current service health.

At the user's request, 14 model/transcription service or socket definitions and 118 installed runtime/launcher files (689711503 bytes) were removed. The exited `nemotron-zc-pipeline` container was also removed. Source, weights, reports, transcription data and retained configurations were preserved; unrelated infrastructure and remote access were not changed. The local removal receipts are under workspace `reports/model-server-removal-20261023/` and are not a portable deployment manifest.

The later [Flint throughput and handoff trial](flint-throughput-20261023.md) used bounded, serial, temporary containers only. The [initial coding calibration](../../../benchmarks/intel-1340p/flint-zero-copy-20261023/coding/README.md) exhausted its 1,024-token cap. A [completion-driven evaluation](../../../benchmarks/intel-1340p/flint-zero-copy-20261023/coding-unlimited/README.md) now runs without output-token or generation-time caps; final results are not established. No model-quality promotion, persistent Flint unit, server installation or service restoration follows from the source merge.

The merge also retains older experimental Nemotron state-handoff/sampler tests and a Qwen service implementation fix. Compiling these implementations is not deploying them. Model-dependent Nemotron quality qualification remains incomplete; its optional lifecycle test is not configured in the model-free combined regression run.

Future deployment requires a separate explicit request and new qualification. Do not use historical rollback instructions to restore services automatically.
