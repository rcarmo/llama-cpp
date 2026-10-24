# Benchmark tree

**Sigma status, 24 October 2026:** user-authorised ThinkingCap is live with 64k context and eight P-core SMT workers. Other Sigma deployment statements below describe historical profiles. The [dated operating status](../docs/local/intel-i5-1340p/model-serving-status-20261023.md) supersedes their startup and rollback instructions; other hosts are unchanged.

This index is for the local fork's benchmark evidence, not for upstream benchmarking guidance. It keeps the navigation symmetrical with `docs/local/`: hardware first, but with enough chronology and model hints that later campaigns do not bury earlier evidence.

## Hardware entry points

* [ThinkingCap and five-model comparison, 24 October](intel-1340p/thinkingcap-gemma4-20261024/README.md) -- current 64k service and completed CPU measurements.

* Nemotron Lightning: [Intel strict handoff, 7 October 2026](intel-1340p/nemotron-lightning-zero-copy-20261007/README.md), experimental state/lifetime and fixed-token evidence.


* [SpaceMIT K3](k3/README.md)
* [LattePanda Sigma / Intel Core i5-1340P](intel-1340p/README.md) -- current ThinkingCap operations, five-model comparison, and retained Gemma, Huihui, Bonsai, Qwen, Ornith, Maple and Intel Xe evidence.
* [RTX 3060 12 GB](rtx3060/README.md)

## Cross-links back into docs

* [Local documentation index](../docs/local/README.md)
* [Model navigation](../docs/local/models/README.md)
* [Chronology](../docs/local/chronology/README.md)

## Evidence policy in practice

* Raw logs, JSON, TSV, CSV and helper scripts stay where they were collected.
* Curated README/report pages point to those raw paths instead of duplicating them.
* A few older top-level benchmark reports now forward into subdirectories so the tree reads like a tree instead of a dumping ground.
