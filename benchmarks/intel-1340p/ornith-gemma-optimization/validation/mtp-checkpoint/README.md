# Forced MTP checkpoint restore

`GGML_SPECULATIVE_TEST_FORCE_CHECKPOINT=1` forces the existing server checkpoint path for test runs only. Default service behaviour is unchanged.

The deterministic 3K agentic workload was run normally and with forced checkpoints for both selected profiles. Normalised output compares role, content, function name/arguments, finish reason, prompt-token count and generated-token count; random tool-call IDs are excluded.

- Ornith: normal and forced output matched; forced mode restored twice, normal mode zero times.
- Gemma: normal and forced output matched; forced mode restored five times, normal mode zero times.

Draft grouping differs after a restore because rejected rows are re-evaluated. That accounting is diagnostic and is not part of output identity.
