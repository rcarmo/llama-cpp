# Local fork documentation

This fork has accumulated a lot of host-specific work -- enough that the old flat `docs/` list was getting in the way. The local material now sits under `docs/local/`, while the upstream llama.cpp documentation stays at `docs/`.

## Start here

* [Hardware navigation](hardware/README.md) groups the work by machine first: SpaceMIT K3, LattePanda Sigma / Intel Core i5-1340P, and RTX 3060.
* [Model navigation](models/README.md) cross-links the same material by model family.
* [Chronology](chronology/README.md) keeps the dated campaigns in order, which matters just as much as the hardware split when later reports supersede earlier ones.
* [Benchmark tree](../../benchmarks/README.md) points to the raw evidence directories and the curated benchmark reports.

## Reading order

* For the current Sigma serving setup, start with the [local model profiles runbook](intel-i5-1340p/gemma-local-provider-runbook.md). It covers the primary Gemma service and static Huihui/PQ2 Bonsai profiles. Dated benchmark reports preserve the service state observed during their campaign; they are not current rollback instructions.
* If you are trying to understand how a result evolved, use the chronology page first and treat undated runbooks as current operational state, not as dated benchmark claims.
* If you need raw logs, JSON, thermal CSVs or reproduction scripts, prefer the benchmark tree over the prose reports. The reports summarise measured outcomes; the benchmark directories keep the evidence.

## Scope notes

* Measured results are linked to the reports and evidence directories that actually recorded them.
* Proposed or rejected work stays labelled as such; nothing here upgrades a failed candidate into a success by wording alone.
* Upstream docs are unchanged apart from this navigation split.
