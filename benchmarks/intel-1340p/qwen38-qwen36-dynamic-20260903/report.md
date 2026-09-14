# Qwen3.8 27B UD-Q4_K_XL and Qwen3.6 35B-A3B UD-Q2_K_XL

The Qwen3.6 MoE profile is the better local deployment on this 32 GiB Intel i5-1340P host. Qwen3.8 gained one API corpus pass, but matched Qwen3.6 on the Pi suite while using 7.44 GiB more PSS, running about 5.5 to 5.9 times slower, and requiring a two-thread limit for sustained quality work.

Ornith remains the production provider. The campaign preserved all weights and left every alternative provider disabled and inactive.

## Candidates

| Field | Qwen3.8 candidate | Qwen3.6 candidate |
|---|---|---|
| GGUF | `Qwen3.8-27B-UD-Q4_K_XL.gguf` | `Qwen3.6-35B-A3B-UD-Q2_K_XL.gguf` |
| Architecture | Dense Qwen 3.8 | Qwen 3.6 MoE, 256 experts, 8 active |
| Parameters reported by server | 27,320,697,856 | 35,505,251,456 total, about 3B active |
| Target and MTP layers | 64 target + 1 embedded MTP | 40 target + 1 embedded MTP |
| Embedding width | 5,120 | 2,048 |
| Quantisation | Unsloth Dynamic `UD-Q4_K_XL` | Unsloth Dynamic `UD-Q2_K_XL` |
| File size | 17,559,178,144 bytes (16.35 GiB) | 12,574,128,416 bytes (11.71 GiB) |
| Training context in GGUF | 262,144 | 262,144 |
| SHA-256 | `3f227079003add2511437e5b1e94812e363385225bf6a9b47b0054a72bc8b01e` | `ed7cda7e38985b4fcff76475865135039641d2bfbac3c169df15ca770f37fb0c` |
| Source | `unsloth/Qwen3.8-27B-GGUF`, revision `4ca720788d1e01f1bff70c033e0d0028fd02e502` | `unsloth/Qwen3.6-35B-A3B-MTP-GGUF`, revision `5bc3e238d916f48a861bac2f8a1990a0e9b7e98d` |

Qwen3.6 `UD-Q4_K_XL` was retained as a constrained reference. Its earlier profile approached 31 GiB RSS and did not leave sufficient memory for a reliable server on this host.

## Test profiles

The matched server settings were:

- CPU-only `llama-server` build 10579 at revision `abdbeadfb`, from repository checkout `23b5cbe56b7640baca77c12ce19d36c681eb0887`;
- one slot and an 8,192-token context;
- Flash Attention enabled;
- Q4_0 K and V caches;
- batch 1,024 and micro-batch 256;
- memory-mapped weights with no model-process swap;
- deterministic prompts, seeds and response limits;
- a cool-start gate below 60 C and load average below 1.5;
- a thermal abort after three consecutive one-second samples at or above 95 C.

Performance used four target-only threads. The accepted API and Pi runs used two threads plus each GGUF's embedded MTP layer, with draft depth 1 to 3. This is a deployment-profile comparison: the architecture, quantisation and memory footprint differ.

The exact 1,024-token performance fixture was built through Qwen3.8's `/tokenize` endpoint. Both servers reported exactly 1,024 prompt tokens for the same payload.

## Correctness smoke test

Qwen3.8 passed all five isolated smoke checks before performance testing:

- deterministic chat text;
- strict JSON;
- required tool name and arguments;
- server-sent event completion;
- client cancellation and slot recovery.

## Matched four-thread performance

| Probe | Qwen3.8 | Qwen3.6 | Qwen3.6 speed-up |
|---|---:|---:|---:|
| 512-token prompt | 4.91 tok/s | 26.80 tok/s | 5.46x |
| 1,024-token prompt | 4.70 tok/s | 26.26 tok/s | 5.59x |
| 512-token prompt in generation request | 4.81 tok/s | 26.93 tok/s | 5.59x |
| 64-token generation | 2.40 tok/s | 14.05 tok/s | 5.86x |
| Peak PSS | 19.23 GiB | 11.79 GiB | 7.44 GiB less |
| Peak temperature | 95 C | 88 C | 7 C lower |
| Model-process swap | 0 MiB | 0 MiB | equal |

The sustained 4,096-token Qwen3.8 probe crossed the thermal gate at eight, six and four threads. Recorded peaks were 97 C, 99 C and 99 C respectively. Those failed runs remain in the results tree. Qwen3.6 was not run against that workload because a valid matched Qwen3.8 result could not be obtained.

## Matched API corpus

Both accepted API runs used two threads and completed without a sustained thermal abort.

| Case | Qwen3.8 | Qwen3.6 |
|---|---|---|
| Bounded reasoning | Pass | Pass |
| Cached follow-up | Pass | Fail: 1,024-token cap |
| Implementation debug | Fail: 1,024-token cap | Fail: 1,024-token cap |
| Instruction following | Pass | Pass |
| Repository planning | Fail: 1,024-token cap | Fail: 1,024-token cap |
| Tool planning | Pass | Pass |
| Total | **4/6** | **3/6** |

Qwen3.8 prompt throughput ranged from 2.45 to 2.47 tok/s and generation throughput from 1.31 to 1.68 tok/s in this profile. Qwen3.6 ranged from 12.96 to 13.92 prompt tok/s and 5.63 to 8.40 generation tok/s.

Embedded MTP draft acceptance across the six API cases was about 63.0% for Qwen3.8 and 56.1% for Qwen3.6. The higher Qwen3.8 acceptance rate did not offset dense-model evaluation cost.

## Matched Pi agentic suite

| Task | Qwen3.8 | Qwen3.6 |
|---|---|---|
| Repository retrieval | Fail | Fail |
| Constrained code edit and independent test | Pass | Pass |
| Exact instruction | Fail: 1,800 s timeout | Fail: no exact final marker |
| Cancellation and slot recovery | Pass | Pass |
| Total | **2/4** | **2/4** |

Both retrieval invocations exited successfully but produced no captured final answer, so neither met the path, function-name and reason checks. Both models fixed `src/clamp.ts` without changing the test or `package.json`, and the independent `bun test` passed.

Qwen3.8 took 2,350 s for retrieval and 1,189 s for the edit. Qwen3.6 took 480 s and 223 s respectively. The timing difference is operationally significant even where the pass counts match.

## Thermal and memory limits

Four-thread quality work was invalid for both candidates:

- Qwen3.8 passed one API case, then the monitor stopped the server at 97 C during the second case.
- Qwen3.6 completed its API cases, then the monitor stopped the server during Pi retrieval; peak temperature was 96 C.

The two-thread quality profiles did not accumulate three consecutive readings at or above 95 C. Qwen3.8 had a transient 97 C sample and peaked at 20.51 GiB PSS. Qwen3.6 peaked at 92 C and 12.51 GiB PSS. Neither model process used swap.

The 95 C policy therefore permits the completed two-thread results, but Qwen3.8 has little thermal margin. Qwen3.6 retains both memory and thermal headroom.

## Deployment decision

Qwen3.6 `UD-Q2_K_XL` is the preferred candidate of the two for this host. Its advantages are:

- 5.5 to 5.9 times higher matched throughput;
- 7.44 GiB lower PSS in target-only performance;
- lower sustained temperatures;
- the same Pi pass count;
- an accepted 128K agentic deployment profile from the earlier Qwen3.6 campaign.

Qwen3.8 `UD-Q4_K_XL` achieved one additional API corpus pass and loaded its embedded Dynamic MTP layer correctly. Its speed, memory use and thermal behaviour make it unsuitable as the default local provider on this host.

## Restored state

Ornith is enabled, active and healthy on port 8095. Its process reports 0 KiB `VmSwap`. `/dev/zram0` is active at 8 GiB, priority 100, with 0 bytes used. Qwen3.8, Qwen3.6, Gemma and Maple provider services are disabled and inactive.

## Result locations

- Accepted performance: `results/qwen38/performance-4t/` and `results/qwen36/performance-4t/`
- Accepted API quality: `results/qwen38/quality-2t/` and `results/qwen36/quality-2t/`
- Accepted Pi suite: `results/qwen38/pi-2t/` and `results/qwen36/pi-2t/`
- Preserved thermal failures: `results/qwen38/performance-8t-thermal-fail/`, `results/qwen38/performance-6t/`, `results/qwen38/performance-4t-4096-thermal-fail/`, `results/qwen38/quality-4t/`, and `results/qwen36/quality-4t/`
