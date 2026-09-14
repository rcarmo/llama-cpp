# Usage reporting benchmark fixtures

This fixture set defines a four-phase TypeScript benchmark for a small deterministic usage-reporting library.

## Layout

- `src/`: model-visible seed implementation to repair incrementally
- `phase-0.test.ts` .. `phase-3.test.ts`: cumulative visible tests, read-only
- `hidden-0.test.ts` .. `hidden-3.test.ts`: cumulative hidden tests for offline grading
- `SPEC.md`: behaviour contract and milestones
- `phases.json`: model-visible phase prompts
- `reference/src/`: offline-only correct implementation for harness verification

## Constraints

- Edit only the root `src/` modules during the benchmark.
- Do not modify tests, `SPEC.md`, or `phases.json`.
- Keep the solution synchronous, pure, dependency-free, and deterministic in UTC.

The `reference/` tree is included only for offline qualification of the fixture itself and is not intended to be shown to the model during evaluation.
