# Score3 production rollout, 11 September 2026

> Historical deployment snapshot (10-11 September 2026). The [15 September in-process zero-copy service](../gemma-zero-copy-service-20260915/README.md) supersedes the service identity, ports, active flags and rollback targets below. Commands in this snapshot are not current operating procedures.

Deployed 20260911-score3-stopped after resumed 4K/finite64K/tools/cache and coldSSE gates. Earlier +3.124%decode comparison retained in the separate score3 experiment; not rerun. Deliberately stopped speech is checked fail-closed; previous ATTN4 rollback retained.

Read report.md. Run `bash verify-offline.sh` for checksums and ten offline audit/guard tests, without inference. Runtime/model/KV/private baseline config excluded. Historical scripts require current local inputs and approval.
