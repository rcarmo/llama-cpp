# Handoff aligned with the retained CPU decoder

The compact GPU saved state now restores into the original `b10579-abdbeadfb` CPU service binary. A4,348-token native check reused4,347 tokens, evaluated one and passed target/MTP recall plus a cached append. Production files are unchanged.

## Why direct restore failed

The candidate `4e9740248` server writes sequence-statev3; the retained CPU accepts v2. Two changes matter:

1. Sequence versions changed with KV-cell extension/token tracking. Gemma E4B's tested text/F16/no-extension payload uses the same metadata and tensor layout on these two revisions; models with extended cells are outside this converter's contract.
2. The newer server token section has a marker, wrapper version, token vector and media vector. The old server expects a plain token vector. A version-word-only rewrite would pass the wrong prompt tokens and was not attempted.

`gemma-state-v2.ts` parses the complete file with bounds checks. It accepts exactly two caches (four global layers,20 SWA layers), F16 K/V, transposed V, expected row widths, compatible stream counts, one occupied sequence, contiguous positions and sufficient retained sliding-window history. It rejects media, unknown wrapper versions, malformed counts, unexpected cell metadata and trailing data.

For the validated text-only subset, it unwraps the token vector and writes av2 header. It compares token IDs and SHA256 of the entire KV payload before publishing the converted file. No tensor conversion, new positions or speculative state are invented. The original CPU loader and coverage guard remain unchanged.

## Compact-SWA export

`patch/compact-swa-padding.patch` is built only in an isolated library. With `LLAMA_EXPERIMENTAL_SWA_SAVE_PADDING`, explicit standard-SWA sequence saves include all existing valid cells in the padded ring. Partial checkpoint saves retain their original behaviour. Empty or foreign-sequence cells remain excluded.

Without this change, the4K control saves512 sliding cells and re-evaluates the full4,348-token prompt after restore. With it, the export retains768 cells and restore evaluates only one token. Both states are finite. GPU-to-candidate-CPU and GPU-to-retained-CPU recall/append checks pass.

## Evidence and limits

- `padding.test.ts`, `gemma-state-v2.test.ts`: eight tests/22 assertions, including malformed/truncated state and text wrapper conversion.
- `runs/compact4-{cpu-off,cpu-on,hybrid-on}-r1/`: original and padded export controls.
- `runs/compact4-hybrid-baseline-r1/`: original native version-rejection failure, retained.
- `state-format-validation.json`: explicit converted-file schema and KV hash evidence.
- `runs/aligned-baseline-replay/`: replay of retained GPU state on unchanged original CPU, avoiding another GPU prefill.
- `long64.ts`: larger-context validation using the aligned path; inspect its run result before asserting success.
- `aligned-route.ts`: coding experiment uses this same converter; warm turns remain on retained CPU, with optional GPU unload after cold transfer.

This is a narrow experimental compatibility adapter, not a generic state migration facility. Identity/layout must be established by the supervised launcher; the slot file does not authenticate a model. Live concurrency, native crash recovery and arbitrary external state files are not qualified. Independent delegated review timed out, so the current converter has local review and tests only.
