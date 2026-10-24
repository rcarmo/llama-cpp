# Flint throughput and zero-copy, 23 October 2026

Best measured Sigma configuration: CPU16 prompt threads,4 P-core decode workers, microbatch512, F16KV/FAoff, explicit mmap/no_host. Counterbalanced512/64 replay confirms50.430 prompt and13.085 decode tok/s; baseline39.211/12.560. GPU caches1/2/4GiB improve hit rates but lose throughput;4GiB reaches60.20% hits and3.013 decode tok/s.

## Results and evidence

- [Throughput report](../../../docs/local/intel-i5-1340p/flint-throughput-20261023.md), [individual CSV](throughput-results.csv) and [JSON](throughput-results.json).
- [Completion-driven coding evaluation](coding-unlimited/README.md): completed all six tasks and 1,053 assertions, with no output-token or generation-time cap. The [initial capped series](coding/README.md) retains six budget-exhaustion failures; it is calibration, not the final coding verdict. References pass 1,053 assertions.
- [Plan and prior-feature reuse checklist](plan.md), [original evidence archive](flint-throughput-evidence.tar.gz) and [archive checksum](EVIDENCE-ARCHIVE-SHA256SUMS). The archive freezes original measurements and failures; its binary identities predate the combined-branch build.
- [Combined-source verification](integration-verification.md) records the later build and tests separately; it does not replace or rerun the measured throughput campaign.
- `reproduce/` and `coding/` retain Sigma-specific scripts. They encode original workspace/run paths; recreate that layout or adjust paths and freeze a **new** series. Do not overwrite recorded labels.

The original targeted qualification passed six CTests, 600 exact synthetic continuation comparisons, and a trained 4GiB-cache handoff sharing 205520896 bytes with zero copied bytes. The earlier 384-token chat sample also failed to complete its answer. Native finiteness and zero-copy ownership are not semantic correctness.

The later temporary Flint UI was replaced by ThinkingCap with user authorisation. No broad quality qualification or global optimum was established. [Current model-serving status](../../../docs/local/intel-i5-1340p/model-serving-status-20261023.md) supersedes older service runbooks.
