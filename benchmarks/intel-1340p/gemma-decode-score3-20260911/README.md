# Score-only 3x4 tile, 11 September 2026

Not deployed. Eight saved64K comparisons give +3.12% median decode over deployed ATTN4. Native11cases/mode and all row tails pass. Qualification aborted on speech queued bytes before candidate finite-state checks; ATTN4 restored and tools/cache verified. No retry/cutover.

Read report.md. Run `bash verify-offline.sh` to reconstruct the pinned source plus ATTN4 and score3 patches, check all hashes and rerun six offline tests. Models, binaries, KV states and private baseline config are excluded. campaign-measured.ts preserves the exact measured harness; campaign.ts includes the later offline-tested abort fix. Heavy scripts need fresh clearance/current baseline; do not run them automatically.
