# Negative paired-dot fallback experiment, 10 September 2026

Not deployed: paired fallback 0.84% slower in eight saved64K runs. Eight native cases pass per mode, but override traces cover n1 only. Hot n4 goes through llamafile GEMM.

Read report.md. Run `bash verify-offline.sh` from this checkout with Bun to check hashes, reconstruct the pinned abdbeadfb source and audit saved evidence without inference. Models, runtime binaries, KV states and private baseline config are excluded. Historical heavy scripts require local retained inputs, fresh clearance and a refreshed current-production baseline; do not rerun old restoration scripts on a newer deployment.
