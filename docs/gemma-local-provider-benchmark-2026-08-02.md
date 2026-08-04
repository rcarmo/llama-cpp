# Gemma local-provider concurrency benchmark - 2 August 2026

Two isolated 131,072-token KV streams gave the best measured concurrent service on the Intel Core i5-1340P. This page records the frozen workload, candidates, results and acceptance limits used to select the deployed profile.

## Host and workload

| Item | Value |
|---|---|
| CPU | Intel Core i5-1340P, 12 cores / 16 logical CPUs |
| RAM | 31 GiB |
| Model | `gemma-4-e4b-qat-mtp` |
| llama.cpp | commit `4196ec8088080522bb0828b2960accc59b8ee1b0`, server build 10504 |
| Target model SHA-256 | `676c35070db6dbe52f93e9c864ee0fba4eddea94b9c875d9cb10daff453fbaee` |
| MTP model SHA-256 | `49d8367f8e1a507ef6196a7eeed790b2797bc649568f431c10bce03f574f6ffc` |
| Target backend | CPU only, 8 threads on logical CPUs `0-7` |
| Request count | 2 and 4 simultaneous HTTP requests |
| Prompt | About 1,247 tokens per request |
| Output | 128 tokens per request, `finish_reason: length` |
| Sampling | Temperature 0.4, deterministic seed per request |
| API | `POST /v1/chat/completions` |

Each request used the same system instruction and 80 numbered reference records, then asked for a numbered list of practical language-model serving measurements. All candidates used F16 KV, MTP depth 3, batch 1,024, ubatch 256 and continuous batching.

## Candidates

| Candidate | Aggregate context | Slots | KV layout | Threads |
|---|---:|---:|---|---:|
| Baseline | 131,072 | 1 | isolated | 8 |
| Unified two-slot | 131,072 | 2 | unified | 8 |
| Unified four-slot | 131,072 | 4 | unified | 8 |
| Unified four-slot, all cores | 131,072 | 4 | unified | 12 |
| **Accepted two-slot** | **262,144** | **2** | **isolated; 131,072 per slot** | **8** |

The unified profiles let every slot address a shared 131,072-token pool. The accepted profile allocates two independent 131,072-token streams. Pi therefore continues to advertise 131,072 tokens per request.

## Results

Wall time measures completion of the complete request group. Aggregate generation throughput is total generated tokens divided by group wall time. Per-request generation rates from server timing fields are not additive under continuous batching.

| Candidate | c2 wall | c2 aggregate generation | c2 mean latency | c4 wall | c4 aggregate generation | c4 mean latency |
|---|---:|---:|---:|---:|---:|---:|
| Baseline, queued | 55.45 s | 4.62 tok/s | 41.81 s | 108.30 s | 4.73 tok/s | 67.66 s |
| Unified two-slot | 58.12 s | 4.40 tok/s | 57.48 s | 115.87 s | 4.42 tok/s | 90.88 s |
| Unified four-slot | 61.86 s | 4.14 tok/s | 61.04 s | 130.58 s | 3.92 tok/s | 128.87 s |
| Unified four-slot, 12 threads | 63.81 s | 4.01 tok/s | 63.53 s | 129.53 s | 3.95 tok/s | 128.11 s |
| **Accepted two-slot** | **54.69 s** | **4.68 tok/s** | **54.01 s** | **105.37 s** | **4.86 tok/s** | **83.03 s** |

Compared with the queued baseline, the accepted profile reduced group wall time by 1.37% at c2 and 2.71% at c4. It admits two active requests. A four-request group completes in two waves.

The baseline's lower c2 mean latency reflects one early completion and one queued completion; it did not run both requests concurrently. The accepted c2 requests completed in 53.34 and 54.69 seconds while making progress together.

## Resource evidence

The accepted c4 run recorded:

- peak RSS: 12,405,008 KiB;
- peak PSS: 12,400,510 KiB;
- peak package temperature: 88 C;
- minimum `MemAvailable`: 23,269,972 KiB;
- swap-in delta: 0 pages;
- swap-out delta: 0 pages;
- major-fault delta: 0.

The deployment keeps `LLAMA_CACHE_RAM_MIB=12288` as an upper bound. Prompt-cache memory is allocated on demand, so this limit is not part of the fixed service footprint.

## Acceptance checks

After installing the accepted profile:

- `/health` returned `{"status":"ok"}`;
- `/v1/models` reported the expected model and 131,072-token context;
- `/slots` reported two speculative slots with `n_ctx: 131072`;
- required `get_weather` function calling returned `{"city":"Lisbon","unit":"celsius"}`;
- SSE returned content deltas, terminal usage and `data: [DONE]`;
- a repeated 5,747-token prompt reused 5,741 tokens and processed 6;
- `pi --list-models local-gemma` found the provider;
- an isolated Pi request returned `PI_CONCURRENT_GEMMA_OK`;
- the service recorded zero restarts and no memory, CPU or I/O pressure at final inspection.

## Limits

- Two requests can execute concurrently. Additional requests enter llama.cpp's deferred task queue until a slot becomes free.
- The server source does not impose a documented finite deferred-queue depth. Upstream clients must set their own request deadlines and cancellation policy.
- `LLAMA_HTTP_TIMEOUT=10800` configures server socket read/write timeouts. It is not a queue-admission deadline.
- Each slot is limited to 131,072 tokens. Four simultaneous near-capacity requests are unsupported.
- Four-slot profiles were rejected because they increased wall time and temperature without improving aggregate throughput.
