# Launch scripts

These scripts are the concrete llama-server startup profiles used on the Pi/Piclaw
RTX 3060 host. They prefer environment variables for portable paths:

```bash
MODEL_DIR=/workspace/models/gguf-misc \
LLAMA_SERVER=/workspace/projects/llama.cpp/llama.cpp/build-cuda/bin/llama-server \
./run-gemma-e2b-qat-cuda.sh
```

Model services currently share port `8090`. Edit `--port` or stop the currently
running service before starting another profile.

See `../PROFILES.md` for benchmark results and why particular context sizes,
MTP draft depths, batch sizes, and flash-attention settings were chosen.
