# Fresh current-master task qualification

The freshly built CPU/common and O3 Vulkan runtime passes the clamp repair-and-follow-up pilot and **2/4 extension workflows**. All **4/4 extension final artifacts** pass their independent tests. Both defaults workflows reach the unchanged round limit; those remain workflow failures.

| Run | Workflow | Final artifact | Rounds | Generated / evaluated / drafted / accepted | Whole seconds |
|---|---|---|---:|---|---:|
| master-median-on0 | PASS | PASS | 10 | 587 / 1026 / 534 / 409 | 59.527 |
| master-median-off0 | PASS | PASS | 10 | 587 / 1026 / 534 / 409 | 60.515 |
| master-defaults-off0 | Round budget exhausted | PASS | 10 | 497 / 1055 / 450 / 347 | 55.951 |
| master-defaults-on0 | Round budget exhausted | PASS | 10 | 497 / 1055 / 450 / 347 | 54.873 |

## Within-runtime comparison

- **Median:** both grades pass, with identical prompts, raw output and token/MTP work. Q6 ON reduces whole-workflow time by **1.63%** and warm native time by **1.94%**. Cold handoff takes **2.568 ms longer**. This is one exploratory pair.
- **Defaults:** work matches, but neither workflow completes. No qualified timing comparison; the raw observations remain in the table.

The clamp pilot passes both grades in 9 rounds with 559 / 791 / 522 / 385 work. The old runtime used 10 rounds and 572 / 900 / 549 / 389. Output and work differ, so the old and new wall times cannot establish a speedup. The original benchmark campaign remains unchanged.

One pair per extension task does not provide a confidence interval or a broad reliability guarantee. No extra runs were added to chase successful defaults workflows. The Q6 option remains off by default.

## Build and ownership evidence

- Fixed the removed speculative `n_past` field in the live in-memory caller by setting `pos0`; commit `132706928` was pushed and remotely verified. For this text-only owner, the position remains the evaluated history length.
- Fresh 153-step CPU build, four CTests, 21 vocabulary-prefix transitions and 12 rejected conversation mutations pass. The old benchmark caller is unchanged.
- Fresh generation produced 182 shader groups and 1,478 SPIR-V files. Current O3 Vulkan plugin identity starts `41878681`. The standalone configuration failure and 2 GiB compiler OOM are retained.
- Splitting the large generated constant-array translation unit into 22 files bounded compiler memory without changing shader math. Offline ELF checks prove all 545 lengths and 20,211,776 embedded bytes match the original generated source.
- Fresh-plugin synthetic handoffs share 65,536 bytes for the plain context and 196,608 for Gemma, copying zero bytes. Rollback, source destruction and exact CPU continuation pass.
- All five trained runs retain current CPU/common/base/plugin hashes, separate CPU/GPU maps and direct cgroup evidence. Each stays within 16 GiB with zero swap, no memory events, no sampled competitors and unchanged services. Native GPU/CPU/MTP/tool workers, trial containers and render-device holders drained before every release.

Final offline validation: **22 tests and 109 assertions** pass, including verifier mutation tests that reject incorrect library identity, missing GPU maps and missing/nonzero swap or memory-event evidence.

See [the chart](charts/current-master-tasks.svg), [its data](charts/current-master-data.csv), and [qualification limits](qualification-limits.md). No deployment, service/default changes, weight writes, upstream submission or history rewriting.
