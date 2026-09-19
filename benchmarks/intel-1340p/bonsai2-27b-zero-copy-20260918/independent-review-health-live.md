# Live health-contract verification review

Result: **PASS**

Date: 19 September 2026
Reviewer: `github-copilot/gpt-5.4` in isolated judge contexts

The review covered `run-server-health-live-gate.sh`, the retained `server-health-live-gate/` artifacts, report additions and manifest coverage.

The first pass found one stale file-count statement in the earlier health follow-up review. It also suggested stronger busy-field absence checks, exact lifetime preservation across reset, a derived user runtime path and clearer wording for GPU ownership after restoration.

The final candidate:

- removes the stale hard-coded manifest count;
- derives `XDG_RUNTIME_DIR` from `id -u`;
- asserts that busy health responses omit all idle-only and lifetime fields;
- asserts exact preservation of `shared_bytes_total` across reset;
- distinguishes release of the experimental reservation from primary Gemma resuming normal `renderD128` ownership;
- includes the runner, report and all retained live artifacts in `SHA256SUMS`.

The final focused review returned PASS with no required findings.
