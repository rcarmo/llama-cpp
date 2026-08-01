# Intel i5-1340P Qwen3.6 128K service runbook

This runbook defines the validated Qwen3.6-35B-A3B service on `sigma`: one 131,072-token slot, native MTP, an embedded Web UI and a LAN endpoint on port 8090.

## Hardware and software

| Item | Value |
|---|---|
| Host | `sigma` |
| CPU | Intel Core i5-1340P |
| Logical CPUs | 0-15 |
| P-core SMT pairs | 0-7 |
| E-cores | 8-15 |
| RAM | 31 GiB |
| Swap | 8 GiB zram |
| Model storage | NVMe/btrfs under `/var/home` |
| Repository | `/var/home/agent/workspace/projects/llama-cpp` |
| Build | `build-intel-clang` |
| Compiler | Clang 22.1.8, native ISA, OpenMP |
| llama.cpp revision | `603f26c86` during validation |
| Model | `Qwen3.6-35B-A3B-UD-Q2_K_XL.gguf` |
| Model size | 12,574,128,416 bytes |

The service is host-specific. Its CPU masks, paths and memory limits should not be copied to another machine without a fresh sweep.

## Prerequisites and model

Required host tools:

- `git`, `curl`, `jq`, `systemd`, `loginctl` and `taskset`;
- rootless Podman for `tools/build-intel-1340p.sh`;
- enough local storage for the 12.6 GB GGUF and the build tree;
- a user account allowed to enable lingering.

Check the build prerequisite:

```bash
podman --version
```

Provision the model at the path configured by `LLAMA_MODEL`:

```text
/var/home/agent/workspace/projects/models/qwen3.6/Qwen3.6-35B-A3B-UD-Q2_K_XL.gguf
```

The validated file is 12,574,128,416 bytes with SHA-256:

```text
ed7cda7e38985b4fcff76475865135039641d2bfbac3c169df15ca770f37fb0c
```

Verify an existing copy:

```bash
sha256sum /var/home/agent/workspace/projects/models/qwen3.6/Qwen3.6-35B-A3B-UD-Q2_K_XL.gguf
```

This runbook does not prescribe a download source. Use a trusted source and verify the checksum before starting the service.

## Endpoint

| Endpoint | URL |
|---|---|
| Web UI | `http://192.168.1.70:8090/` |
| OpenAI-compatible API | `http://192.168.1.70:8090/v1/` |
| Health | `http://192.168.1.70:8090/health` |
| Slots | `http://192.168.1.70:8090/slots` |
| Metrics | `http://192.168.1.70:8090/metrics` |

The service binds to `0.0.0.0` and has no API key because this was explicitly requested. Any host that can reach TCP port 8090 can use the model, occupy its only slot and read its metrics. Restrict access at the network/firewall layer if the LAN is not trusted.

## Local configuration

The machine-local configuration is:

```text
~/.config/llama-qwen-longctx/service.env
```

The tracked example is:

```text
tools/config/llama-qwen-longctx.env.example
```

The user unit loads the local file with:

```ini
EnvironmentFile=-%h/.config/llama-qwen-longctx/service.env
```

The leading `-` makes the file optional. `tools/run-intel-qwen-longctx.sh` contains the same validated values as fallback defaults.

Current local configuration:

```bash
LLAMA_ROOT=/var/home/agent/workspace/projects/llama-cpp
LLAMA_BUILD=/var/home/agent/workspace/projects/llama-cpp/build-intel-clang
LLAMA_MODEL=/var/home/agent/workspace/projects/models/qwen3.6/Qwen3.6-35B-A3B-UD-Q2_K_XL.gguf
LLAMA_HOST=0.0.0.0
LLAMA_PORT=8090
LLAMA_CTX=131072
LLAMA_MTP_DEPTH=3
LLAMA_KV=q4_0
LLAMA_BATCH=1024
LLAMA_UBATCH=256
LLAMA_THREADS=8
LLAMA_CPUS=0-7
LLAMA_PROCESS_CPUS=0-15
LLAMA_CACHE_RAM_MIB=0
LLAMA_SLOT_DIR=/var/home/agent/.cache/llama-qwen-longctx/slots/
LLAMA_HTTP_TIMEOUT=28800
GGML_CPU_EXPERT_IO_PROFILE=1
GGML_CPU_EXPERT_IO_ADVISE_MODE=bounded
```

After editing the file on an installed system:

```bash
systemctl --user restart llama-qwen-longctx.service
```

For first installation, use the ordered steps under [Install and boot startup](#install-and-boot-startup).

## Selected inference profile

| Setting | Value | Reason |
|---|---:|---|
| Weight quantisation | Q2_K_XL | Fits 128K with operational headroom |
| Context | 131,072 | Largest configured and accepted profile |
| Validated input | 99,104 tokens | Uninterrupted agentic request; exceeds 96K requirement |
| Slots | 1 | Native MTP profile and full context for one user |
| MTP depth | 3 | Best measured generation throughput |
| KV type | Q4_0 K and V | Best stable KV result |
| Batch | 1024 | Best measured batch candidate |
| Ubatch | 256 | Best measured ubatch candidate |
| Model threads | 8 on CPUs 0-7 | Best prior i5-1340P topology result |
| Process mask | CPUs 0-15 | Leaves bounded helper/server work access to E-cores |
| Model loading | mmap | Keeps weights file-backed and reclaimable |
| Flash Attention | enabled | Selected service profile |
| Separate RAM prompt cache | disabled | Avoids duplicating a large slot state |
| Same-slot prompt reuse | enabled | Reuses the active slot's common prefix |
| HTTP timeout | 28,800 s | Allows multi-hour near-capacity requests |

Concurrent requests queue behind the single active slot.

## KV and recurrent memory

The following allocation is derived from the deployed GGUF metadata, `src/models/qwen35moe.cpp` and the Q4_0 layout in `ggml/src/ggml-cpu/ggml-common.h`. It is not a direct allocator log.

The model has 40 trunk layers plus one NextN/MTP layer. `qwen35moe.cpp` marks every fourth trunk layer as full attention when no explicit recurrent-layer array is present, yielding ten full-attention layers and 30 recurrent/linear-attention layers. The MTP head uses one full-attention layer in its draft context.

Deployed GGUF metadata for each full-attention layer:

- 2 KV heads;
- 256 key values per head;
- 256 value values per head;
- 512 K values and 512 V values per token.

Q4_0 stores each block of 32 values in 18 bytes. A 512-value K or V row therefore occupies 288 bytes.

At 131,072 cells:

| Allocation | K | V | Total |
|---|---:|---:|---:|
| Target, 10 attention layers | 360 MiB | 360 MiB | 720 MiB |
| MTP draft, 1 attention layer | 36 MiB | 36 MiB | 72 MiB |
| Combined attention KV | 396 MiB | 396 MiB | **792 MiB** |

Recurrent state, graph work buffers, batch buffers, model-private allocations and allocator overhead are separate. An idle snapshot after the local-config and loginless restart checks recorded 1.45 GiB of private dirty memory, 12.90 GiB PSS and zero swap. Most PSS is mmap-backed model residency. The snapshot is stored as `benchmarks/intel-1340p/qwen-longctx-fieldfare/local-config-validation/live-memory.txt`.

### KV sweep

| KV | Approximate combined attention KV | Prompt tok/s | Generation tok/s | Result |
|---|---:|---:|---:|---|
| Q4_0 | 792 MiB | 28.013 | 13.551 | Selected |
| Q5_0 | 968 MiB | 27.703 | 13.148 | Stable, slower |
| Q8_0 | 1,496 MiB | 29.363 | 13.663 | Rejected for request-time pressure |

The Q8_0 request caused 438.8 MB of physical reads, 6,609 major faults and swap activity. Q4_0 and Q5_0 had no request-time reads or major faults; Q4_0 was faster.

Turbo2/3/4 KV was not selected. The optimized implementation is CUDA-oriented; the CPU fallback dequantises to F32 per dot and is not a competitive i5-1340P service path.

## Native MTP

The Qwen GGUF contains one appended NextN decoder block. llama.cpp creates a separate MTP draft context from that block and the shared model weights.

Activated settings:

```text
--spec-type draft-mtp
--spec-draft-n-min 1
--spec-draft-n-max 3
--spec-draft-threads 8
--spec-draft-threads-batch 8
--spec-draft-type-k q4_0
--spec-draft-type-v q4_0
```

Measured 3,068-token agentic workload:

| Draft depth | Generation tok/s | Accepted drafts |
|---:|---:|---:|
| 0, target only | 11.038 | - |
| 1 | 13.551 | 28/29 |
| 2 | 12.548 | 38/42 |
| 3 | **14.543** | 42/45 |

Depth 3 was selected. The final 99,104-token acceptance run also accepted 42/45 drafts.

## Fieldfare expert I/O

The fork contains the router-aware expert-I/O series used for Qwen `MUL_MAT_ID` execution. Implementation details are in `ggml/src/ggml-cpu/whole-token-profile.cpp`, `expert-io-plan.cpp` and `expert-io-advice.cpp`; validation is recorded in `docs/expert-io-adoption-baseline.md` and `docs/turbo-fieldfare-adoption-report.md`:

- selected-expert observability;
- mmap range discovery;
- bounded range deduplication/coalescing;
- `mincore()` residency checks;
- miss-only `MADV_WILLNEED` advice;
- one bounded asynchronous advice worker;
- adaptive slow/failure circuit breaking;
- safe same-block lookahead;
- Prometheus counters.

Activated controls:

```bash
GGML_CPU_EXPERT_IO_PROFILE=1
GGML_CPU_EXPERT_IO_ADVISE_MODE=bounded
```

The Q2 model has 41 routed layers, 256 experts per layer and three contiguous aligned ranges per expert. Routed expert weights occupy 10.78 GB.

### Raw-cache decision

A raw fixed-slot/pread expert cache was not implemented. Under controlled 10 GiB page pressure, the cold bounded request was only 0.64% slower than the warm bounded control. This was below the documented 10% residual token-wall gate. Adding file-offset ownership, pointer redirection, slot lifetime and eviction logic was not justified.

The existing bounded advice path remains enabled. It issues no syscall when selected pages are resident.

## Prompt and slot caching

Activated:

```text
--cache-prompt
--cache-ram 0
--no-cache-idle-slots
--slot-save-path ~/.cache/llama-qwen-longctx/slots/
```

`--cache-ram 0` disables the separate RAM-backed prompt-state cache. It does not disable same-slot common-prefix reuse. A sequential request can reuse the common prefix already held by the active slot.

Manual slot saves remain available through the `/slots/{id}?action=save|restore` API. They are intended for controlled operations, not automatic crash recovery of an in-flight request.

## Web UI, API and metrics

Activated server features:

- embedded Web UI: `--ui`;
- OpenAI-compatible API;
- health endpoint;
- slot endpoint: `--slots`;
- Prometheus endpoint: `--metrics`;
- model alias: `qwen3.6-35b-a3b-128k-mtp`;
- no startup warmup: `--no-warmup`.

The embedded UI uses gzip-capable assets. Browsers handle this automatically. CLI validation:

```bash
curl --compressed http://127.0.0.1:8090/ -o /tmp/llama-ui.html
```

## Build and update

Build the accepted CPU profile from the canonical tree:

```bash
cd /var/home/agent/workspace/projects/llama-cpp
BUILD_JOBS=2 tools/build-intel-1340p.sh
```

`tools/build-intel-1340p.sh` uses rootless Podman and the local Fedora 44 build image. It builds with Clang, native x86 ISA, AVX-VNNI, OpenMP, the CPU backend, server/UI targets and tests. It runs `test-x86-quant-dot` before returning success.

The service launches the binary directly from `build-intel-clang`. Rebuilds take effect on the next restart:

```bash
systemctl --user restart llama-qwen-longctx.service
```

## Install and boot startup

Install the local config and user unit from the repository root:

```bash
cd /var/home/agent/workspace/projects/llama-cpp
install -Dm0644 tools/config/llama-qwen-longctx.env.example \
  ~/.config/llama-qwen-longctx/service.env
install -Dm0644 tools/systemd/user/llama-qwen-longctx.service \
  ~/.config/systemd/user/llama-qwen-longctx.service
systemctl --user daemon-reload
systemctl --user enable --now llama-qwen-longctx.service
```

Enable user lingering once so the service starts without login:

```bash
loginctl enable-linger "$USER"
```

In a headless shell where `systemctl --user` cannot find the bus, export the lingering user's runtime bus first:

```bash
export XDG_RUNTIME_DIR=/run/user/$(id -u)
export DBUS_SESSION_BUS_ADDRESS=unix:path=$XDG_RUNTIME_DIR/bus
```

Loginless recovery was validated by restarting `user@1001.service`; the Qwen service returned active with a new PID, healthy endpoint, UI, metrics and the 131,072-token speculative slot.

## Operations

```bash
systemctl --user status llama-qwen-longctx.service
systemctl --user restart llama-qwen-longctx.service
systemctl --user stop llama-qwen-longctx.service
journalctl --user -u llama-qwen-longctx.service -f
```

Quick checks:

```bash
curl -fsS http://127.0.0.1:8090/health | jq .
curl -fsS http://127.0.0.1:8090/slots | jq '.[0] | {n_ctx, speculative, is_processing}'
curl -fsS http://127.0.0.1:8090/metrics | grep '^llamacpp:expert_io_'
curl -fsS --compressed http://127.0.0.1:8090/ -o /tmp/llama-ui.html
```

Full service validation:

```bash
cd /var/home/agent/workspace/projects/llama-cpp
benchmarks/intel-1340p/qwen-longctx-fieldfare/validate-service.sh
```

The validator checks health, one 131,072-token speculative slot, UI, metrics, a deterministic agentic tool call, service restart and post-restart health.

## Monitoring

Useful process checks:

```bash
pid=$(systemctl --user show llama-qwen-longctx.service -p MainPID --value)
grep -E 'VmRSS|VmSwap' /proc/$pid/status
cat /proc/$pid/io
cat /proc/vmstat | grep -E '^(pswpin|pswpout|pgmajfault) '
```

Prometheus expert counters include:

```text
llamacpp:expert_io_nodes_total
llamacpp:expert_io_selections_total
llamacpp:expert_io_repeated_total
llamacpp:expert_io_advice_calls_total
llamacpp:expert_io_advice_bytes_total
llamacpp:expert_io_resident_skips_total
```

Near-capacity CPU prompt processing is slow and thermally demanding. The accepted 99,104-token request took 21,663 seconds (6.02 hours), averaged 4.580 prompt tok/s, peaked near 13.41 GiB PSS and recorded no process major faults or swap activity.

## Validated and rejected configurations

Validated:

- 131,072-token configured slot;
- uninterrupted 99,104-token agentic request;
- correct `search_repository` tool call;
- MTP-3 with 42/45 acceptance;
- zero swap and process major faults during the 99K run;
- UI, metrics, slots, restart and loginless user-manager recovery.

Rejected or not enabled:

- Q4_K_XL weights at 128K: 28.42 GiB startup PSS and heavy startup page/swap pressure;
- Q8_0 KV: fastest short run but request-time reads/faults/swap activity;
- Q5_0 KV: stable but slower than Q4_0;
- MTP depths 1 and 2: lower measured generation throughput;
- 2048/512 batch geometry: slower than 1024/256;
- raw fixed-slot expert cache: failed the implementation gate;
- Vulkan offload: not part of the accepted long-context CPU build/profile;
- separate 8 GiB RAM prompt cache: disabled to preserve memory headroom;
- multiple slots: disabled so one user receives the full context.

## Rollback

Stop and disable the endpoint:

```bash
systemctl --user disable --now llama-qwen-longctx.service
```

Disable expert advice while retaining mmap and metrics:

```bash
sed -i 's/^GGML_CPU_EXPERT_IO_ADVISE_MODE=.*/GGML_CPU_EXPERT_IO_ADVISE_MODE=off/' \
  ~/.config/llama-qwen-longctx/service.env
systemctl --user restart llama-qwen-longctx.service
```

Restore the tracked profile:

```bash
cd /var/home/agent/workspace/projects/llama-cpp
install -Dm0644 tools/config/llama-qwen-longctx.env.example \
  ~/.config/llama-qwen-longctx/service.env
systemctl --user restart llama-qwen-longctx.service
```

Raw measurements and selection evidence are under `benchmarks/intel-1340p/qwen-longctx-fieldfare/`.
