# Gemma and Ornith agentic campaign

This directory contains the matched direct API and real Pi comparison run on the LattePanda Sigma on 22 August 2026.

Both models passed 8 of 10 deterministic checks. Gemma completed the measured work 15.7% faster, used 58.6% less peak PSS and used no process swap. Ornith received the stronger blind review for the two truncated prose answers. Both truncated answers remain deterministic failures.

Read `report.md` for the protocol, comparison and restored deployment state. `summary.json` contains the aggregate measurements. Raw responses, Pi outputs, tests, diffs, telemetry and server logs are retained under `results/`.

The campaign restored Ornith as the sole enabled local provider on 22 August 2026. That is historical restoration evidence, not the current service state. The current Sigma service state is documented in the hardware runbooks.

Regenerate the aggregate summary and verify the retained files from the repository root:

```sh
bun benchmarks/intel-1340p/gemma-ornith-agentic-20260822/summarize-campaign.ts \
  benchmarks/intel-1340p/gemma-ornith-agentic-20260822
(cd benchmarks/intel-1340p/gemma-ornith-agentic-20260822 && sha256sum -c SHA256SUMS)
```

The live campaign runner changes local provider registration and restarts model services. Do not rerun it on an active host without reviewing its restoration trap and current unit names.
