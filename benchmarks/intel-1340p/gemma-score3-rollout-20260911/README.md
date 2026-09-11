# Score3 production rollout, 11 September 2026

Deployed 20260911-score3-stopped after resumed 4K/finite64K/tools/cache and coldSSE gates. Earlier +3.124%decode comparison retained in the separate score3 experiment; not rerun. Deliberately stopped speech is checked fail-closed; previous ATTN4 rollback retained.

Read report.md. Run `bash verify-offline.sh` for checksums and ten offline audit/guard tests, without inference. Runtime/model/KV/private baseline config excluded. Historical scripts require current local inputs and approval.
