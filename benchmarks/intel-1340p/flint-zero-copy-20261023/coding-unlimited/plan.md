# Flint coding: completion-driven series, 23 October 2026

The user rejected the original 1,024-token output budget, then explicitly requested no limit. Preserve the original six budget-exhaustion results. This is a new, separately frozen series, not an answer repair or replacement of the old records.

## Generation

- Same six case prompts, independent executable assertions, reference implementations and seed42. Case/test hashes must match the original series. One attempt per case in this new series; no answer-specific repairs or retries.
- No output-token cap and no native generation/process time limit. Generate until model EOG. The runner must contain no timeout around native inference.
- Native thinking enabled and DeepSeek-style reasoning separation requested; template/model reasoning is allowed to finish naturally. Temperature1/top-k20/top-p0.95/min-p0 unchanged.
- A finite16,384-token physical context is allocated within the existing20GiB execution cap; the model training context is262,144. No context truncation, shifting, fabricated EOG or forced reasoning close. Context exhaustion is an explicit resource/capacity failure, not a completed answer. This physical limit is reported, not hidden as an output budget.
- CPU16 allowance,16prompt threads,4P-core decode workers, explicit masks, batch/microbatch512, poll50, F16KV/FAoff, explicitMMAP/no_host and unchanged Q3_K_XL model. Host available-memory reserve>=6GiB; zero container swap; existing memory/PID/resource guards remain. No services restored, model changes or other-agent coordination.
- Persist raw token text, progress every128tokens, final raw/parsed content and reasoning, stop reason, context, startup/prefill/generation/wall timing, finite logits, model/binary/source hashes and all resource/exit receipts. Startup includes model/context setup; it is not pure model-loading time.

## Scoring

- EOG is required. Score the final answer, not its internal thought channel. Prefer native separated content; if the parser leaves one leading, fully closed `<think>...</think>` block in content, remove only that structural channel. An unfinished thought, extra explanation, multiple answer blocks or missing code fences still fails. Retain original content and record whether structural extraction occurred. No code changes, whitespace fixes, invented exports or answer repairs.
- Same hidden semantic assertions and reference functions. References and parser-boundary self-tests must pass before inference; verify hashes before and after the suite.
- The untrusted-code scorer keeps its independent10second sandbox timeout,1CPU/256MiB/64PIDs, no network, read-only mounts, capability drop and no-new-privileges. This safety boundary is not a model-generation budget.
- Report every completed/failed task independently. Do not confuse native execution with semantic correctness, compare against unmatched historical models or claim broad quality from six tasks.

## Publication

Finish the combined offline build/tests and source review after the native series drains. Build and native inference must not overlap. Merge without rebase and push only to verified rcarmo/llama-cpp; verify remote master equality. Until the completion-driven series is scored, the original0/6 result is labelled budget calibration, not the final coding verdict.
