# Launch scripts

These scripts are the concrete llama-server startup profiles used on the Pi/Piclaw
RTX 3060 host. They prefer environment variables for portable paths:

```bash
MODEL_DIR=/workspace/models/gguf-misc \
LLAMA_SERVER=/workspace/projects/llama.cpp/llama.cpp/build-cuda/bin/llama-server \
./run-qwen36-27b-mtp-cuda.sh
```

Model services currently share port `8090`. Edit `--port` or stop the currently
running service before starting another profile.

The active Qwen3.6 launcher name is historical: it loads the 35B-A3B native-MTP
model with 16 profiled cache slots, four threads, batch/microbatch 1024 and
async CPU disabled. Qwen3.8 is the stopped rollback profile. See
[agentic tuning](../../../docs/qwen36-agentic-tuning.md) for the request-time
CUDA memory constraint and the prefill/decode trade-off.

See `../PROFILES.md` for benchmark results and why particular context sizes,
MTP draft depths, batch sizes, and flash-attention settings were chosen.
