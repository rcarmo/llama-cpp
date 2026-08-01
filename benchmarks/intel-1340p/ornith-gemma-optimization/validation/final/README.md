# Final verification

Verified against source commit `603f26c869b6700eaa5c6d52068ed583419eeacf` with the dirty campaign working tree.

- Release build: `../final-build.log`
- Focused model operations:
  - `ornith-routed.csv`: 10/10 passed
  - `gemma-target.csv`: 20/20 passed
  - `gemma-assistant.csv`: 20/20 passed
- Native graphs:
  - `ornith-target-mtp-support.csv`: 150/150 CPU-supported
  - `gemma-target-assistant-mtp-support.csv`: 141/141 CPU-supported
- Backend thread control:
  - `backend-threads-t1.txt`: one-thread benchmark passed
  - `backend-threads-invalid.txt`: `-t 0` rejected with exit 1
- State and tails:
  - `test-batch-alloc.txt`: 30 tests, 198 assertions, zero failures
  - `test-recurrent-state-rollback.txt`: checkpoint restore and replay-logit identity passed
- Speculative profiling:
  - `profile-alias.txt`: generic and legacy environment names produced identical normalised output
  - `expert-io-metrics.txt`: CPU expert-I/O metrics were resolved dynamically and exported
- Launch artefacts:
  - `ornith-candidate-dry-run.txt`
  - `gemma4-candidate-dry-run.txt`
  - `candidate-systemd-verify.txt`
  - `candidate-service-state.txt`
- Harness safety:
  - `../invalid-preserves-output.log`: invalid options fail before output deletion

`git diff --check` passed after the final build and focused tests.
