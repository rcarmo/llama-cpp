# Independent MTP draft decode threads,10September2026

Four draft threads were4.10% slower than eight on matched64K counting/recall. Eight counterbalanced runs; target smallbatch8/largeprefill16 and draftbatch16 fixed. Same128 output tokens/110 drafted/90 accepted, all recall/cache checks passed. No production change; retain draft8.

Read report.md. Run `bash verify-offline.sh` with Bun to verify checksums, two audit tests, raw timings and restoration without inference. Models, runtime binaries, KV states and private baseline config are excluded. Historical stage scripts require fresh speech clearance and a current baseline before use.
