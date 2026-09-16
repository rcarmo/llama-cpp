# Gemma ZC1 speed follow-up (16 September 2026)

Active profile-first campaign against immutable `ZC1-generation-parity`. Production and rollback binaries are not modified by these experiments.

## Current attribution

The frozen 512-token request spends about 19.04 s in `MUL_MAT`; four-row Q4_0 target projections dominate. The largest measured shape (`2560 x 10240`) accounts for about 8.42 s in the barrier-based diagnostic profile. The timing profile is attribution only.

Current target weights are held in `Vulkan_Host`, so the production CPU path bypasses the CPU-repack tensor trait. A proposed packed-Q4 biased-nibble kernel failed the real-dispatch gate and was removed before accepting any timing result.

## Rejected actual-dispatch candidates

| Candidate | OFF mean | ON mean | Change | Decision |
|---|---:|---:|---:|---|
| unsigned-nibble correction, new 2x4 tile | 22.7870 tok/s | 19.8053 tok/s | -13.09% | rejected, removed |
| unsigned-nibble correction, parent 4x2 tile | 23.5507 tok/s | 21.9867 tok/s | -6.64% | rejected, removed |

Both screens used fresh OFF/ON/ON/OFF processes and the frozen request. Every observation retained output hash `082a0bab6078b427556b7c2f77bcac945d32e90dbaeca9ddd11331431a4301e6`, work `385/382/512`, `shared_bytes=584056832`, `copied_bytes=0`, and zero peak swap. The parent 4x2 result shows that exact Q8 row-sum correction costs more than the eliminated sign operations on this CPU.

## Accepted candidate

`GGML_CPU_EXPERIMENTAL_Q4_N4_SCHEDULE=1` selects an equivalent 2x4 tinyBLAS schedule for Q4_0 x Q8_0 when the target batch is exactly four rows. It loads two A vectors once per block, then loads and consumes one B column at a time. Arithmetic, loads, shuffles, dots, accumulation, output layout, and all other shapes are unchanged; only temporary lifetimes differ.

The initial screen improved from 23.1176 to 26.3919 tok/s (+14.16%). Eight fresh counterbalanced confirmations improved from 23.1749 to 25.8539 tok/s (+11.56%); all four candidate observations exceeded all four controls. The exact historical 512-prompt/64-output fixture improved from 10.0924 to 10.6557 tok/s (+5.58%) with identical `512/64/55/43` work and hash `35f6d4194c1e9170ab5104d67b191ce47cee554fb21463d3f7d61cf86c2beddf`.

Full service qualification passed seven non-streaming cases, exact append reuse, prompt progress and incremental SSE, streamed tool calls, cancellation/reset, recovery, serial admission, embedded UI, Vulkan residency, positive shared bytes, zero copied bytes, zero restarts, and zero swap. The deployed runtime remains unchanged until an immutable candidate closure is prepared and verified.
