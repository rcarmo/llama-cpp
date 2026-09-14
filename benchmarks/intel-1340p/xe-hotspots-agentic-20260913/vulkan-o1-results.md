# Large Vulkan tiles rejected for the combined candidate

The matched O1 untraced OFF/ON/ON/OFF screen confirms a large regression for both FFN shapes. Keep the existing medium selector. The narrow opt-in candidate and its numerical evidence remain report-only.

| M x N x K | Medium process medians (ms) | Large process medians (ms) | Medium median | Large median | Time change |
|---|---|---|---:|---:|---:|
| 10240 x256 x2560 | 5.416255,5.465400 | 19.009550,19.115250 | 5.440828 | 19.062400 | +250.36% |
| 2560 x256 x10240 | 5.774210,5.789565 | 18.736350,18.938400 | 5.781888 | 18.837375 | +225.80% |

Each process median uses eight batches of four synchronised graph evaluations. Both traced preliminary processes verified the exact pipeline for both shapes: medium64x64 OFF and large128x128 ON, Q8_1 query, split-K1. All six processes pass finite output and NMSE2.22285e-7/2.19341e-7 before samples. Untraced processes contain no dispatch records. Same O1 plugin8a3f97b7, caller37fddc56 and176 retained shader objects. Two untraced processes per arm is a narrow synthetic confirmation, not trained latency evidence.

`vulkan-o1-screen` unit8.326s, cgroup peak194,969,600B/185.9MiB, swap/throttle/memory events0.169 samples,minavailable28,306,640KiB,maxworkerRSS219,492KiB. All owner-drain handshakes and exits pass; GPU/CPU workers, containers and renderD128 holders absent afterwards. Services unchanged; both peer holds released.

The host-side O1 plugin was compiled under240s/2CPU/2GiB and had no warnings. Caller hash stayed identical; shader hashes all passed. No production Vulkan source edits, model loads or service changes in this confirmation.
