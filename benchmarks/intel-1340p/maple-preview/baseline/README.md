# Maple-Preview unoptimised CPU baseline

Date: 5 August 2026

## Configuration

- Intel Core i5-1340P, eight threads pinned to CPUs 0-7.
- Q8_0 correctness artifact: `projects/models/maple-preview-q8_0.gguf`.
- Model size: 21,520,633,376 bytes; 20,214,030,336 parameters.
- F16 K/V, Flash Attention disabled, mmap, batch 2048, ubatch 512.
- Both deployed llama services remained stopped.
- Host sensor snapshots reached 98 C after the repeated 4K run, 86 C after 32K, and 82 C after decode; these are hard thermal constraints for later tuning.

## Performance

| Workload | Repeats | Throughput | Max RSS | Process major faults | Process swaps | Highest post-run sensor |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 4,096-token prompt | 3 | 128.89 tok/s | 21,386,872 KiB | 0 | 0 | 98 C |
| 32,768-token prompt | 1 | 84.70 tok/s | 23,167,648 KiB | 0 | 0 | 86 C |
| 16-token decode | 3 | 33.21 tok/s | 21,084,264 KiB | 0 | 0 | 82 C |

Idle server PSS was 21,106,595 KiB: 21,024,307 KiB file-backed and 82,288 KiB anonymous, with zero swap. Host-wide VM counters moved during the long prompt runs, but `/usr/bin/time` recorded zero major faults and zero swaps for each benchmark process.

## Compatibility smokes

- `llama-cli`: one-token generation passed.
- `llama-completion`: one-token generation passed at 30.58 tok/s.
- `llama-imatrix`: one 64-token chunk passed and wrote a 114,332,352-byte GGUF matrix.
- `llama-quantize`: BF16-to-Q8_0 dry-run mapped all 291 tensors.
- `llama-server`: localhost health, model list, one-token OpenAI chat completion and metrics passed on port 8092; process-group cleanup left no listener.

## Profile finding

The exact output head is a dominant decode cost: it reads about 1.24 GB of Q8 weights per token. Decode reaches 33.21 tok/s despite this, while prompt processing remains bandwidth-efficient at 128.89 tok/s for 4K. Routed expert coverage in the one-chunk imatrix smoke was intentionally partial and is not a production calibration matrix.

## Evidence

Raw JSONL, `/usr/bin/time`, thermal/fault snapshots, PSS rollup, endpoint responses and tool logs are in this directory.
