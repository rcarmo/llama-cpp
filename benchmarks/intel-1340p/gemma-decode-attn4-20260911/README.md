# Four-query F16 attention tile, 11 September 2026

> Historical deployment snapshot (10-11 September 2026). The [15 September in-process zero-copy service](../gemma-zero-copy-service-20260915/README.md) supersedes the service identity, ports, active flags and rollback targets below. Commands in this snapshot are not current operating procedures.

Deployed 20260911-attn4: eight saved64K runs, median decode +2.90%, overlapping ranges; native/finiteKV/tools/cache pass. First cutover aborted and rolled back, diagnostic cutover passed92 samples with zero worker swap. Earlier abort cause remains unknown.

Read report.md. Run `bash verify-offline.sh` from this checkout with Bun to check hashes, reconstruct the pinned abdbeadfb source and audit saved evidence without inference. Models, runtime binaries, KV states and private baseline config are excluded. Historical heavy scripts require local retained inputs, fresh clearance and a refreshed current-production baseline; do not rerun old restoration scripts on a newer deployment.
