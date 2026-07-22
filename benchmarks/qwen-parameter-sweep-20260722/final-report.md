# Qwen service parameter sweep

The fastest stable interactive profile uses eight workers, MTP draft maximum 1, batch 2,048, microbatch 512 and prompt caching.

## Fixed settings

All tests used the same Qwen3.6-35B-A3B Q4_K_M MTP model, one 4,096-token slot, Q8_0 KV cache, automatic SpaceMIT matmul scheduling and direct recurrent-state writes. Thinking and built-in tools were disabled.

The short sweep used the first three prompts from the five-prompt engineering corpus. Each configuration loaded the model once and processed the prompts in the same order.

## Draft depth

| Draft maximum | Prompt tok/s | Generation tok/s | Accepted drafts | Result |
|---:|---:|---:|---:|---|
| 3 | 22.789 | 7.328 | 175/326, 53.7% | Slower |
| 2 | 22.901 | 7.315 | 159/247, 64.4% | Slower |
| **1** | **23.143** | **7.916** | **126/157, 80.3%** | Selected |
| Disabled | 24.040 | 6.464 | — | Slower generation |

Draft maximum 1 improves mean generation by 8.0% over draft maximum 3 and by 22.5% over target-only decoding. It also reduces rejected draft work.

## Batch geometry

Draft maximum 1 and eight workers were fixed for this stage.

| Batch / microbatch | Prompt tok/s | Generation tok/s | Available memory after run |
|---|---:|---:|---:|
| 512 / 128 | 23.106 | 7.912 | 8,742,502,400 bytes |
| 1,024 / 256 | 23.166 | 7.915 | 8,729,985,024 bytes |
| **2,048 / 512** | **23.143** | **7.916** | 8,721,952,768 bytes |

Short-prompt results are within noise. Cached long-prompt behaviour selected 2,048/512.

## Worker count

| Workers | Prompt tok/s | Generation tok/s | Result |
|---:|---:|---:|---|
| 6 | 19.425 | 7.133 | Rejected |
| **8** | **23.143** | **7.916** | Selected |

Eight workers improve generation by 11.0% and prompt ingestion by 19.1% over six workers.

## Prompt caching

Both batch finalists processed a 3,042-token README request followed by a dependent request with the same prefix.

| Batch / microbatch | Phase | Cached tokens | Prompt tok/s | Generation tok/s |
|---|---|---:|---:|---:|
| 512 / 128 | Initial | 0 | 8.258 | 3.196 |
| 512 / 128 | Follow-up | 3,038 | 4.332 | 3.168 |
| **2,048 / 512** | Initial | 0 | **8.357** | **3.219** |
| **2,048 / 512** | Follow-up | **3,038** | **4.564** | **3.201** |

Prompt caching reused 3,038 tokens and processed 54 new tokens. The larger batch was 5.3% faster for cached prompt processing and about 1% faster for generation.

## Final live validation

The live launcher now uses:

```text
--threads 8
--threads-batch 8
--threads-draft 8
--threads-batch-draft 8
--spec-draft-n-min 1
--spec-draft-n-max 1
--batch-size 2048
--ubatch-size 512
--cache-prompt
GGML_CPU_GDN_DIRECT_STATE=1
```

Five varied prompts averaged 23.294 prompt tok/s and 7.855 generation tok/s. Draft acceptance was 206/266, or 77.4%.

The final cache check reused 3,038 tokens, processed 54 new tokens and returned the slot idle. Available memory was 7,949,008,896 bytes. The embedded chat UI returned HTTP 200 and the service journal contained no inference errors.

The previous launcher is preserved at `/home/me/.local/bin/run-qwen36-35b-a3b.sh.bak-parameter-sweep-20260722`.
