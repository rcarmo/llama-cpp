# Qwen long-context Fieldfare service refinement

## Outcome

Deploy one boot-started llama.cpp user service with the embedded Web UI on `0.0.0.0:8090`, no API key, one active slot, native Qwen MTP, and the largest stable context from 128K, 112K and 96K.

## Decisions

- The service may reserve the machine and stop other model services.
- One active slot is acceptable; additional requests queue.
- The embedded llama.cpp Web UI is required.
- Bind to the LAN without an API key. This deliberately exposes inference and the UI to hosts that can reach port 8090.
- Start at boot without an interactive login by enabling the user unit and systemd user lingering.
- Reject any profile with sustained swap growth during steady inference.
- Prefer the largest stable context before throughput.
- At the same stable context, select Q4_K_XL when its agentic throughput is within 10% of Q2_K_XL; otherwise select Q2_K_XL.
- Keep mmap enabled and use the existing router-aware Fieldfare expert-I/O path.
- Test Q8_0, Q5_0 and Q4_0 KV where supported. Prefer the highest-precision KV type that fits and passes long-context agentic validation.
- Use a repeatable 2-4K-token agentic tool-planning prompt for the parameter sweep and a generated near-capacity retrieval prompt for final context validation.
- No autonomous commit or push is allowed by the repository policy.

## Existing Fieldfare baseline

The following commits are ancestors of canonical HEAD `603f26c869b6700eaa5c6d52068ed583419eeacf`:

- `fc8e68490` expert-I/O observability;
- `2b3dc4bbb` bounded expert range planner;
- `8edb0e196` miss-only page advice;
- `6bee9c7e7` bounded asynchronous worker;
- `20c3ef95b` adaptive modes;
- `fbe683994` advice without profiler barriers;
- `ae9ba0854` shared residency scan;
- `8146b1d29` safe same-block lookahead;
- `addae6164` platform advice abstraction;
- `ac68e9793` persistent-server A/B;
- `c4462f34e` adoption report.

The implementation uses mmap addresses, `mincore()` residency checks and asynchronous `madvise(MADV_WILLNEED)` on Linux. It already targets Qwen routed `MUL_MAT_ID` nodes. Qwen3.6-35B-A3B Q2_K_XL has 41 routed layers, 256 experts per layer and three stable ranges per expert.

## Conditional raw-expert cache

Implement a bounded raw-expert fixed-slot cache only when this 31 GiB host demonstrates both:

1. residual expert storage I/O of at least 10% of token wall time after bounded advice; and
2. useful routed-expert reuse under page pressure.

If the gate passes, the raw cache must:

- remain separate from the SpaceMIT compute-ready packed-tile cache;
- use an independent byte/slot budget and telemetry;
- plan all hits, reservations and evictions before reads;
- use bounded asynchronous reads and queue depth;
- preserve mmap/default fallback;
- remain off by default;
- reject invalid/noncontiguous expert layouts;
- avoid pinned memory unless measurements justify it.

If the gate fails, deploy the best mmap plus bounded/adaptive advice profile without raw slots.

## Sweep dimensions

- weights: Q2_K_XL and Q4_K_XL;
- context: 131072, 114688 and 98304 tokens, in that priority order;
- KV: Q8_0, Q5_0, Q4_0 for K and V where supported;
- MTP draft depth: 1, 2 and 3, plus target-only control;
- batch/ubatch: focused candidates derived from 512/128 and 2048/512;
- CPU: eight model threads on logical CPUs 0-7; process may use 0-15;
- expert I/O: off, bounded and adaptive; raw-cache modes only after the gate;
- quant selection: Q4 within 10% of Q2 at the same stable context, else Q2.

## Required measurements

- prompt and generation throughput;
- request wall time and non-streaming prompt time proxy;
- MTP drafted/accepted tokens and acceptance rate;
- RSS/PSS, available memory and swap deltas;
- process read bytes, major/minor faults and system `pgmajfault`/swap counters;
- expert selection/reuse/residency/advice counters;
- model load and warm-up time;
- temperatures and load;
- deterministic output/tool-call correctness;
- health, UI, restart and boot-unit behavior.

## Completion

The task is complete when the selected service is healthy at `http://<sigma-LAN-IP>:8090/`, starts through the user manager without login, exposes the UI and metrics, survives restart, passes the near-capacity agentic retrieval test, has no sustained swap growth, and has a raw evidence/report directory describing every accepted and rejected profile.
