# Gemma 4 E4B and Ornith 1.5 agentic comparison

Both models passed 8 of 10 deterministic checks. Gemma completed the measured work 15.7% faster and used 58.6% less peak proportional set size (PSS). Ornith produced stronger visible content in a blind review of the two truncated prose answers, but both answers remain failures under the fixed completion limit.

## Protocol

The campaign ran on the LattePanda Sigma on 22 August 2026. Each accepted service profile ran alone after a service restart. The runner used the same prompts, tools, scoring and timeouts for both models.

The measured workload contained:

- six frozen direct API cases: bounded reasoning, cached follow-up, implementation diagnosis, exact instruction following, repository planning and required tool planning;
- four real Pi tasks: repository retrieval with `read,grep`, constrained code repair with `read,edit,bash`, exact instruction following without tools and cancellation recovery;
- an independent `bun test` after each code repair;
- a three-second cancellation timeout followed by an idle-slot recovery check.

Direct API completions used the corpus limit of 1,024 generated tokens. A response failed if it leaked reasoning tags, returned empty prose, failed a semantic check or exhausted the completion limit. The code task could change only `src/clamp.ts`.

The runner sampled process and system memory, swap and package temperature once per second. It stopped an active workload at 95 C. It also waited for package temperature to fall below 70 C between the API and Pi phases. Neither final workload reached the stop threshold.

The comparison used llama.cpp build `b10579-abdbeadfb` and the accepted deployed profiles:

| Model | Model identity | Profile |
|---|---|---|
| Ornith 1.5 35B-A3B Q4_K_M | 21,713,462,848 bytes; SHA-256 `ca6ea26329c88b78ffd90a85163be2e746c2fafd1024f56db47e499f117f9a7f` | Target-only, one 131,072-token slot, Q8_0 K/V, Flash Attention, 12 threads |
| Gemma 4 E4B QAT plus MTP | Target SHA-256 `676c35070db6dbe52f93e9c864ee0fba4eddea94b9c875d9cb10daff453fbaee`; assistant SHA-256 `49d8367f8e1a507ef6196a7eeed790b2797bc649568f431c10bce03f574f6ffc` | MTP depth 3, two 131,072-token slots, F16 K/V, Flash Attention off, 8 threads |

Each model ran one complete six-case API sequence and one four-task Pi sequence after a service restart. The runner did not clear the host page cache. The cached-follow-up case deliberately reused the same server slot; other results are not cold-storage measurements. Latency and resource values are observations from one campaign arm per model, not repeated-sample estimates.

These are deployment-profile results. They do not isolate architecture from quantisation, K/V type, speculative decoding, slot count or thread count.

## Deterministic quality

| Check | Ornith | Gemma |
|---|---:|---:|
| Direct API | 4/6 | 4/6 |
| Real Pi | 4/4 | 4/4 |
| Combined | 8/10 | 8/10 |

Both models passed bounded reasoning, cached follow-up, exact API instruction following and the required tool call. Both failed implementation diagnosis and repository planning because otherwise substantive answers reached the 1,024-token completion limit. The API harness therefore exited with status 1 for each model, as designed.

Both Pi runs:

- found `tools/run-intel-candidate.sh` and explained the `LLAMA_USE_MTP=0` target-only branch;
- changed only `src/clamp.ts` and passed the independent test;
- returned exactly `GEMMA_ORNITH_AGENTIC_OK`;
- exited cancellation with status 124 and recovered every server slot.

A blind review compared the visible parts of the two truncated responses. Candidate A was Ornith and candidate B was Gemma. The reviewer preferred Ornith on both tasks because its answers were more specific, better structured and closer to the requested debugging and planning style. The review also found unsupported or doubtful technical claims in both candidates. It does not change the deterministic failures.

## Latency

Times exclude service start and the inter-phase cooldown.

| Workload | Ornith | Gemma | Difference |
|---|---:|---:|---:|
| Six API cases | 255.8 s | 165.6 s | Gemma 35.3% faster |
| Four Pi tasks | 381.3 s | 371.4 s | Gemma 2.6% faster |
| Combined | 637.1 s | 537.0 s | Gemma 15.7% faster |

| Pi task | Ornith | Gemma |
|---|---:|---:|
| Repository retrieval | 221.0 s | 210.3 s |
| Constrained edit | 64.2 s | 80.0 s |
| Exact instruction | 93.1 s | 78.1 s |
| Cancellation | 3.0 s | 3.0 s |

Gemma was faster on all six API cases and three of the four Pi tasks. Ornith completed the constrained edit 19.7% faster. API generation rates ranged from 12.4 to 13.2 tokens/s for Ornith and from 17.0 to 28.5 tokens/s for Gemma.

## Resources and temperature

| Metric | Ornith | Gemma |
|---|---:|---:|
| Peak PSS | 29.40 GiB | 12.17 GiB |
| Peak process swap | 6.99 GiB | 0 GiB |
| Minimum system memory available | 13.35 GiB | 22.53 GiB |
| Minimum system swap free | 0.86 GiB | 7.85 GiB |
| Peak package temperature during work | 92 C | 94 C |

Gemma had the stronger resource and latency result. Ornith put 6.99 GiB of its process memory in swap. Gemma used no process swap, but ran 2 C hotter and came within 1 C of the thermal gate. The below-70 C inter-phase cooldown is required for repeatable back-to-back Gemma workloads on this host.

## Historical deployment state

The campaign exited with status 0 and restored the requested state on 22 August 2026:

- `llama-ornith-local-provider.service` is enabled and active;
- `llama-gemma-local-provider.service` is disabled and inactive;
- port `8095` is the only local model listener;
- `/var/home/agent/.pi/agent/models.json` contains only `local-ornith` among local providers;
- Ornith reports `{"status":"ok"}`;
- every model weight and service file remains present.

This captured state is not a current operations record. Later work selected Gemma as the active Sigma provider and added a temporary LAN UI endpoint.

The objective quality score is a tie. Gemma wins this campaign on speed and memory use. Ornith has a qualitative edge in the failed long-form answers, but the fixed-cap results do not establish a correctness advantage for either model.

## Evidence

- `summary.json`: machine-readable aggregate results.
- `results/{ornith,gemma}/api/`: requests, responses and per-case summary.
- `results/{ornith,gemma}/pi/`: prompts, outputs, diffs, tests, timings and task summary.
- `results/{ornith,gemma}/telemetry.tsv`: one-second resource and temperature samples.
- `results/{ornith,gemma}/server-journal.txt`: server logs for each measured run.
- `blind-review/`: anonymised inputs, candidate mapping and review result.
- `state/`: campaign exit status and before/after restoration evidence.
- `run-campaign.sh`: isolated runner and restoration trap.
