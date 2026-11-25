# Sigma model-serving status

Inkling 2 Mini is the active Sigma service as of 25 November 2026. Its [accepted CPU runtime](../../../benchmarks/intel-1340p/inkling2-cache-serving-20261121/production-20261122/README.md) is `c0dad48a5fdd024785e38c65b91662e99d62dec0`.

- Endpoint: `http://192.168.1.70:11434/`. Unit/container: `inkling2-mini-prod-webui-20261122`, transient, `Restart=no`.
- CPU 4/16 threads, context 65536, 768 MiB prompt cache, F16 KV, Flash Attention off, IQ4_NL model, Q8_0 CPU projector and embedded Web UI. High reasoning with no generation cap. GPU serving is disabled.
- The Bonsai maintenance windows restored the exact accepted container, configuration, limits, runtime and UI. Previous Inkling containers remain stopped for rollback; Gemma and Flint are not active. No boot or global-default setting changed.
- [Bonsai 2.5 on Sigma](../../../benchmarks/intel-1340p/bonsai25-ptq1-20261125/README.md) is experimental. At a 128-token microbatch, the [FP32 opt-in](../../../benchmarks/intel-1340p/bonsai25-ptq1-20261125/fp32/README.md) reduced 512+64 Iris Xe replay from 81.41 s to 61.55 s. The retained Inkling CPU reference took 29.08 s with a different tokeniser. Microbatch 512 still produces sparse logits. Bonsai has no deployed service.
- The [October status](model-serving-status-20261023.md) and [Gemma/Huihui/Bonsai 2 runbook](gemma-local-provider-runbook.md) are historical. Use the accepted Inkling record for rollback; do not start a retired profile from those documents.
