# Gemma performance research above 32K

Experimental follow-up to [the aligned compact-SWA campaign](../gemma-context-coding-20260910/). These files preserve hypotheses, failures and workload-dependent opportunities; they do not enable or deploy an optimisation.

## Results

- Existing CPU8/MTP3 is best among the tested decode screens.
- GPU microbatch 1024 improves repeated 64K-tail prefill by 5.52%; one fresh64K request is 3.33% slower. Retain it for phase-specific research, not as the default.
- A bounded SWA export fixes compatibility between the larger GPU ring and retained CPU ring; fresh4K/64K state/task checks pass.
- Split-K4 has effectively neutral confirmed tail timing (+0.056%) but improves native numerical controls from 2/4 baseline passes to 4/4. Retain as an opt-in numerical candidate.
- FA-on tail is much slower and produces invalid output; mechanism remains unisolated.

See [report.md](report.md), [results.json](results.json), [opportunities.json](opportunities.json), [splitk/review.json](splitk/review.json) and [the optimisation skill](../../../skills/hybrid-inference-optimization/SKILL.md). Minor timing regressions are retained as measured costs and potential opportunities, not erased or treated as permanent dead ends.

## Verification

```sh
sha256sum -c SHA256SUMS
bash verify-offline.sh
```

`manifest.json` and `SHA256SUMS` cover copied source/evidence snapshots; this README and manifest describe the export. Native kernels, request checks, failed baselines and final production identity/tools/cache verification are retained under `runs/` and `final-verification.txt`. The verification helper reconstructs excluded C++ source from commit `4e9740248` plus the retained patches in a temporary directory, then runs offline format and source-invariant tests. Those are distinct from native tests.

## Reproduction limits

The runners preserve the exact absolute workspace, model/runtime paths, ports, host supervision and service coordination used during measurement. They are historical source snapshots, not portable deployment commands. A new experiment requires a reviewed launcher, model/build manifests, private local saved states and baseline controls, a new output directory and authorised maintenance. Imported helpers and audits may refer to the earlier workspace campaigns. Do not execute the restoration or load scripts on an arbitrary host.

Large slot files, model weights, runtime libraries, baseline environment/unit copies, build objects, archives and full copied C++ sources are excluded. Source patches are retained; original local paths and file hashes are in the manifest. The full64K baseline comes from the previous campaign rather than another fresh full prompt rerun.

The default remains the previously validated aligned profile. The opt-in split-K gate is broader than the tested Iris Xe device and needs narrowing plus additional validation before promotion. Fully populated dual128K fallback, broad task-quality equivalence and native serving crash recovery are still unqualified. Production was restored unchanged after every supervised stage.
