# Gemma compact-SWA handoff and coding checkpoint

Experimental GPU-prefill handoff aligned with the retained CPU decoder. No production configuration is changed by this directory.

- 64663-token positional recall and append pass with finite saved KV and zero trial swap.
- Eight ABBA/BAAB coding workflows pass: total median 28.79% lower; warm median 3.42% higher.
- Isolated compact-SWA export and restricted text-only sequence-v3 to sequence-v2 conversion are retained with their tests.

Read [report.md](report.md), [handoff-alignment.md](handoff-alignment.md), [results.json](results.json) and [amendments.json](amendments.json) for exact scope and failures. The newer performance follow-up is in [../gemma-hybrid-perf-20260910/](../gemma-hybrid-perf-20260910/).

## Verification

From this directory:

```sh
sha256sum -c SHA256SUMS
bun test gemma-state-v2.test.ts aligned-route.test.ts
```

The checksum list covers the copied historical evidence; this README and manifest describe the export. `manifest.json` records original paths, byte counts, exclusions and SHA256 values. Tests here exercise the format adapter and route source invariants without inference. Full native validation is recorded under `runs/`.

## Reproduction limits

Sources are frozen campaign snapshots. Their absolute paths intentionally preserve the measured workspace (`/var/home/agent/workspace/reports/...`); they are not installation commands or portable standalone benchmarks. The native runners expect the retained model, runtime/library trees, historical fixture roots, baseline manifests and host supervision/coordination from that workspace. Audit scripts can refer to prior campaign directories. Restore and load scripts must not be run casually from this export.

For a new run, first read [the optimisation skill](../../../skills/hybrid-inference-optimization/SKILL.md), review every runtime/path/port/service assumption, allocate a new result directory and obtain maintenance clearance. Do not overwrite the recorded runs or apply patches to a deployed tree automatically.

Model weights, saved slot files, baseline environment/unit copies, build products and full copied C++ sources are excluded. Patches preserve the intended source changes. Loaded runtime identity and final service verification are recorded in text; no secrets or user media are included.

This checkpoint records the earlier stage. Its statement that no commit/push occurred was true at measurement time; this repository export was subsequently committed and pushed with owner approval. Neither action deployed the hybrid route.
