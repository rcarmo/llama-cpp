# Sigma model-serving status

Inkling 2 Mini is the active Sigma service as of 25 November 2026. Its [accepted CPU runtime](../../../benchmarks/intel-1340p/inkling2-cache-serving-20261121/production-20261122/README.md) is `c0dad48a5fdd024785e38c65b91662e99d62dec0`.

- Endpoint: `http://192.168.1.70:11434/`. Unit/container: `inkling2-mini-prod-webui-20261122`, transient, `Restart=no`.
- CPU 4/16 threads, context 65536, 768 MiB prompt cache, F16 KV, Flash Attention off, IQ4_NL model, Q8_0 CPU projector and embedded Web UI. High reasoning with no generation cap. GPU serving is disabled.
- The Bonsai maintenance windows restored the exact accepted container, configuration, limits, runtime and UI. Previous Inkling containers remain stopped for rollback; Gemma and Flint are not active. No boot or global-default setting changed.
- [Bonsai 2.5 on Sigma](../../../benchmarks/intel-1340p/bonsai25-ptq1-20261125/README.md) is experimental. The 512+64 Iris Xe replay took 81.39 s versus 29.08 s for the retained Inkling CPU reference. Larger microbatch logits failed. Bonsai has no deployed service.
- The [October status](model-serving-status-20261023.md) and [Gemma/Huihui/Bonsai 2 runbook](gemma-local-provider-runbook.md) are historical. Use the accepted Inkling record for rollback; do not start a retired profile from those documents.
