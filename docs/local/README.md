# Local fork documentation

Host-specific experiments and retained operating notes are under `docs/local/`. Upstream llama.cpp documentation stays under `docs/`.

**Sigma status, 23 October 2026:** model-serving units and installed model/transcription runtimes were removed. [Operating status](intel-i5-1340p/model-serving-status-20261023.md) supersedes the older deployment instructions. No model service was restored by the source merge.

**Sigma status,24 October2026:** ThinkingCap Gemma4 replaced Flint at `http://192.168.1.70:11434/`:64k physical context,8P-SMT CPU workers,unlimited output/reasoning,HTML/API smoke passed. Other removed services remain stopped; boot startup is disabled. See the [five-model comparison](intel-i5-1340p/thinkingcap-gemma4-20261024.md).

## Web UI build default

Server builds default to `LLAMA_BUILD_UI=ON`, with `LLAMA_USE_PREBUILT_UI=ON` as a verified-download fallback. The agent configure wrapper explicitly sets both options to override old disabled cache values. A requested UI build fails if no assets can be supplied. Builds with `LLAMA_BUILD_SERVER=OFF` do not provision UI assets. This policy does not replace the active ThinkingCap runtime.

## Start here

* [Flint throughput and zero-copy](intel-i5-1340p/flint-throughput-20261023.md): best measured CPU replay 50.43 prompt / 13.09 decode tok/s. [Coding evaluation](../../benchmarks/intel-1340p/flint-zero-copy-20261023/README.md) preserves the initial output-budget failures separately from the completion-driven series.

* Nemotron Lightning: [strict Intel handoff, 7 October 2026](intel-i5-1340p/nemotron-lightning-zero-copy-20261007.md), native correctness and fixed-token screen, not deployed.


* [Hardware navigation](hardware/README.md) groups the work by machine first: SpaceMIT K3, LattePanda Sigma / Intel Core i5-1340P, and RTX 3060.
* [Model navigation](models/README.md) cross-links the same material by model family.
* [Chronology](chronology/README.md) keeps the dated campaigns in order, which matters just as much as the hardware split when later reports supersede earlier ones.
* [Benchmark tree](../../benchmarks/README.md) points to the raw evidence directories and the curated benchmark reports.

## Reading order

* For Sigma's operating state, read the dated [model-serving status](intel-i5-1340p/model-serving-status-20261023.md) first. The [local model profiles runbook](intel-i5-1340p/gemma-local-provider-runbook.md) retains the former Gemma, Huihui and Bonsai configurations.
* Use the chronology to follow results across campaigns. Dated reports preserve their original measurements and service state; undated runbooks require revalidation before any future deployment.
* If you need raw logs, JSON, thermal CSVs or reproduction scripts, prefer the benchmark tree over the prose reports. The reports summarise measured outcomes; the benchmark directories keep the evidence.

## Scope notes

* Measured results are linked to the reports and evidence directories that actually recorded them.
* Proposed or rejected work stays labelled as such; nothing here upgrades a failed candidate into a success by wording alone.
* Upstream docs are unchanged apart from this navigation split.
