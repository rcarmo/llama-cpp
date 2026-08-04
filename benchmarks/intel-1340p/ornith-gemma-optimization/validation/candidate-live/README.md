# No-install candidate validation

`tools/validate-intel-candidate.sh` launched each tracked profile directly on loopback without installing or enabling a service.

Validated for both Ornith and Gemma:

- tracked profile and launcher dry-run;
- systemd unit syntax;
- `/health` readiness;
- one speculative slot with `n_ctx=32768`;
- deterministic `OK` completion;
- non-zero drafted and accepted tokens;
- RSS, PSS, swap, faults, I/O and package temperature capture;
- graceful shutdown and closed listening port.

Results:

- Ornith: draft 2/2 accepted, zero swap and process major faults.
- Gemma: draft 3/3 accepted, zero swap and process major faults.

No `llama-candidate.service` instance was installed, enabled or left running.
