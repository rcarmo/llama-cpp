# Intel large Q4 tile: correctness passes, diagnostic cost increases

The same O0 plugin and retained shader objects pass both FFN CPU-reference checks with the large-tile flag OFF and ON. The first-shape trace switches from `matmul_q4_0_q8_1_m` (64x64) to `matmul_q4_0_q8_1_l` (128x128), split-K 1. No production Vulkan source changed.

| Shape M x N x K | OFF NMSE | ON NMSE | OFF diagnostic sample range | ON diagnostic sample range |
|---|---:|---:|---:|---:|
| 10240 x 256 x 2560 | 2.22285e-7 | 2.22285e-7 | 5.319-12.685 ms | 18.910-20.883 ms |
| 2560 x 256 x 10240 | 2.19341e-7 | 2.19341e-7 | 5.795-6.403 ms | 18.680-19.114 ms |

Each shape passed finite output and the existing NMSE <=5e-4 gate before eight diagnostic samples of four synchronised graph evaluations. Identical aggregate error metrics do not establish byte-identical GPU outputs. The trace cap prints only the first four dispatches, all for the first shape; second-shape large dispatch needs separate confirmation.

These samples use an O0 host plugin and diagnostic tracing. They are not qualified performance results. Their large regression argues against promoting this 128x128 selector without a matched optimised, untraced confirmation. The integer MMQ source also warns of heavier register use; shared-memory fit alone does not establish throughput.

## Identity and lifecycle

- Plugin SHA256 `281b49d50d6321399453d653cd1917ba9547a4d0b64ded8c9c90981d4bbdecb2`; caller `37fddc56cc46435bfa5c4c58f1fa70651bb58bcf9a03a11e21ed14cd80562a38`.
- All 176 retained shader object hashes unchanged at build; no shader regeneration.
- Sequential OFF/ON run `vulkan-large-offon`, unit 3.400 seconds, peak 219,279,360 bytes (209.1 MiB), swap/throttle/memory events zero. 67 guard samples, minimum available 28,350,088 KiB; max sampled worker RSS 241,692 KiB. RSS and cgroup accounting differ.
- Both processes freed backend owners and emitted `OWNERS_DRAINED`, then waited for explicit controller `close`. The controller kept strict live-process swap checks until that handshake. Workers, containers and renderD128 holders were absent after completion; services unchanged.
- The earlier medium-only probe's terminal missing-VmSwap abort remains retained and excluded. No guard was retroactively relaxed.

Next: build an isolated optimised host plugin with per-shape diagnostic selection and a no-trace timing mode, verify both shapes, then decide whether to retain only the default medium selector for the final combined trained comparison. No generic Intel performance or deployment qualification.
