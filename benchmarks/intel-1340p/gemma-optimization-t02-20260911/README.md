# Gemma optimisation T02 offline fixture freeze

Reviewed and frozen T02 fixtures now have short native B0 outcomes: normaliseTags2/2, chunk2/2, retrieval2/2 and toolrounds8/8 pass. Original mergeIntervals0/2 fails its exact export contract and is retained. Native execution evidence is in ../gemma-optimization-t01-d01-20260911/; generated code runs only through the preflighted networkless/read-only256MiB/2second sandbox here. No candidate performance comparison or long-context quality claim.

## Files

- `fixtures.ts` — two coding fixtures (`normaliseTags`, `mergeIntervals`), independent reference solutions, validator source, one grounded retrieval fixture, and one four-round nonexecuting tool/cache fixture.
- `fixtures.test.ts` — offline reference and negative-control tests.
- `bun-test.log` — saved `bun test` output for this bundle.

## Fixed limits

- Seeds locked to `42` and `43`
- `maxGenerationTokens = 512`
- No fixture edits per candidate
- Retrieval/tool JSON contracts were made explicit and the candidate-versus-shipped grounding error corrected before model execution; original delegate draft retained.
- chunk-fixture.ts is a new versioned fixture after the merge export failure; chunk-freeze.json predates its native run. No alias correction of failed output.
- Generated code is never executed on the host. sandbox-preflight.json checks references/negative controls, actual256MiB cap, network/workspace isolation, read-only mounts and two-second timeout.
- frozen-fixtures.json, baseline-results.json and chunk-baseline-results.json preserve hashes and native outcome scope.
