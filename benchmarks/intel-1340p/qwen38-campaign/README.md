# Qwen 3.8 27B on the LattePanda Sigma

This campaign installs Qwen 3.8 27B as a manual, loopback-only provider and compares it with the accepted Sigma model profiles. Gemma remains the primary local provider. The hosted default is unchanged.

## Installed artefacts

| Component | Path or identifier |
|---|---|
| Target | `projects/models/qwen3.8-27b/Qwen3.8-27B-Q4_K_M.gguf` |
| MTP draft | `projects/models/qwen3.8-27b/mtp-Qwen3.8-27B-Q4_0.gguf` |
| Vision projector | `projects/models/qwen3.8-27b/mmproj-Qwen3.8-27B-Q8_0.gguf` |
| Launcher | `tools/run-intel-qwen38.sh` |
| User unit | `~/.config/systemd/user/llama-qwen38-local-provider.service` |
| Pi model | `local-qwen38/qwen3.8-27b-q4km-mtp` |
| Endpoint | `http://127.0.0.1:8094` |

`manifest.json` records the Hugging Face revisions, file sizes, SHA-256 values, runtime identity and rollback references. The model and projector use the Apache 2.0 licence.

## Operating limits

The installed profile uses one 8,192-token slot, Q4_0 KV, MTP depth 3, eight model threads on CPUs 0-7, and process affinity 0-15. The target and MTP processes consume almost all 31 GiB of RAM. The unit is disabled and conflicts with the installed Gemma, Maple and Qwen 3.6 units.

Start the MTP profile only for a manual session. The retained unit predates the current zero-copy primary and its systemd `Conflicts=` list does not include that service, so stop the primary and its LAN socket explicitly first:

```bash
systemctl --user stop \
  llama-gemma-lan-test.socket \
  llama-gemma-lan-test.service \
  llama-gemma-zero-copy.service
systemctl --user start llama-qwen38-local-provider.service
curl -fsS http://127.0.0.1:8094/health
pi -p --provider local-qwen38 --model qwen3.8-27b-q4km-mtp --thinking low \
  'Reply with exactly QWEN38_OK and nothing else.'
```

For lower swap risk, stop the resident providers and run the target without MTP:

```bash
LLAMA_USE_MTP=0 tools/run-intel-qwen38.sh
```

The commands above describe the August campaign layout. They are not current restoration instructions. Restore the primary model after a manual session with:

```bash
systemctl --user stop llama-qwen38-local-provider.service
gemma-profile primary
gemma-profile status
curl -fsS http://192.168.1.70:8094/health
```

Gemma 4 E4B QAT + MTP zero-copy is the current primary deployment. Maple and Qwen 3.6 are retained disabled profiles; do not start them as part of normal Qwen 3.8 cleanup.

## Vision

The normal service omits the 600 MiB projector to reduce memory pressure. Run the launcher directly with a smaller context when vision input is required:

```bash
systemctl --user stop \
  llama-gemma-lan-test.socket \
  llama-gemma-lan-test.service \
  llama-gemma-zero-copy.service
LLAMA_CTX=4096 \
LLAMA_MM_PROJ=/var/home/agent/workspace/projects/models/qwen3.8-27b/mmproj-Qwen3.8-27B-Q8_0.gguf \
  tools/run-intel-qwen38.sh
```

## Evidence

- `smoke/`: model load, deterministic chat, JSON, required tool, SSE and cancellation evidence.
- `performance/`: exact-token fixtures, raw responses and one-second resource samples.
- `quality/`: frozen six-case API corpus and cached-prefix evidence.
- `pi/`: repository retrieval, constrained edit, exact reply and cancellation tasks.
- `vision/`: image fixture, request, response and resource sample.
- `summary.json`: machine-readable campaign results.
- `report.md`: findings and deployment decision.

The benchmark scripts stop the resident providers, wait for the frozen cool-start gate, and restore the original units on normal exit. Long probes should run through a user-systemd transient unit because interactive tool calls have a one-hour execution cap.
