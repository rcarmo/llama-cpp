# Maple, Gemma and Qwen campaign

This directory contains the matched quality, real Pi, performance and Maple representation evidence for the LattePanda Sigma campaign.

## Conclusions

- Gemma remains the primary local provider.
- Maple remains an explicit prompt-heavy alternative.
- Qwen is the only model that passed this campaign's repository-retrieval task, but it is much slower and supports one slot.
- The hosted Pi default is unchanged.
- No new Maple representation is promoted; the accepted exact TQ2/F32 AVX2 path passes the exact tier, and no new surviving candidate exists for the repeated end-to-end promotion gate.

## Main files

- `protocol.md`: frozen campaign controls and validation rules.
- `manifest.json`: source, build, model, corpus and service identities.
- `api/objective-summary.json`: identical six-case bounded API results.
- `pi/objective-summary.json`: identical real Pi repository tasks, reproducibly derived from raw outputs by `summarize-pi-suite.ts`.
- `blind-review/result.json`: anonymised substantive-output review.
- `performance/summary.json`: exact per-tokenizer 512/4K/32K and 64-token generation measurements with observed executable, command, profile and fixture identities.
- `weight-inventory.md`: official, local and community weight provenance.
- `maple-optimization-decision.md`: tensor/phase profile, ISA analysis, candidate gates and promotion decision.
- `report.md`: final comparative report and rollback.
- `validate-static-evidence.ts`: claim-to-source checks for profile, numerical, performance and inventory metrics.
- `validate-campaign.ts`: final structural, hash, numerical and performance evidence validation.

Raw request/response, fixture, timing, diff, telemetry and test artifacts are retained under `api/`, `pi/`, `performance/` and `blind-review/`.
