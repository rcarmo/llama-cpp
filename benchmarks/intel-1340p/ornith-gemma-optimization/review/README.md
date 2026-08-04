# Local review series

No patch has been committed or submitted.

1. `0001-shared-speculative-profile-and-expert-metrics.patch`
   - generic speculative phase profiling;
   - dynamic CPU expert-I/O metric lookup.
2. `0002-model-fixtures-and-mtp-graph-export.patch`
   - Qwen/Ornith/Gemma backend fixtures and backend thread control;
   - native target plus MTP graph export.
3. `0003-candidate-launcher-and-campaign-docs.patch`
   - campaign report, generic candidate launcher, two profile examples and inactive user-unit template.

`evidence-files.tsv` and `evidence-sha256s.txt` inventory the benchmark tree. Large repetitive SYCL logs are stored as verified gzip streams with original hashes in `../sycl/compressed-log-manifest.tsv`.

Excluded pre-existing local work:

- `benchmarks/intel-1340p/qwen-longctx-fieldfare/`
- `benchmarks/intel-1340p/qwen35moe-vulkan-mtp/`
- `docs/intel-1340p-qwen-longctx-runbook.md`
- `tools/Containerfile.intel-sycl`
- `tools/build-intel-sycl.sh`
- `tools/run-intel-qwen-longctx.sh`
- Qwen-specific config and service files under `tools/config/` and `tools/systemd/`
4. `0004-reproducible-campaign-harness-and-decisions.patch`
   - frozen campaign metadata and long-context workload;
   - CPU/SYCL/profile benchmark entry points;
   - machine-readable promotion/rejection decisions and final test index.
