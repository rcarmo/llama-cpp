# Ornith/Gemma hardening review

This boundary contains the source, tests, runbooks, profile updates and compact evidence for:

- deterministic semantic graph replay;
- forced MTP checkpoint-restore validation;
- no-install profile validation and cleanup;
- 128K geometry selection and strict near-capacity validation;
- fork-specific root README and model runbooks;
- final regression evidence.

`include-paths.txt` lists intended review roots. `files.tsv` and `sha256s.txt` inventory their contents. `excluded-paths.txt` lists unrelated or obsolete local artifacts that are intentionally outside this review.

Strict 128K results are under `validation/candidate-128k/{ornith,gemma4}-128k-b1024-u256/` and summarized by `validation/candidate-128k/summary.json`. The archived `server-complete-client-lost` Ornith run is diagnostic-only and explicitly classified.
