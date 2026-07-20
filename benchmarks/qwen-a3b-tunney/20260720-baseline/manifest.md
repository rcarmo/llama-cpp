# Qwen3.6-35B-A3B Tunney-style kernel baseline

Date: 20 July 2026
Source commit: `2790768bf20b106c00fcfcef0e3589a9dde358b8`
Model: `/home/me/models/gguf-misc/Qwen3.6-35B-A3B-UD-Q4_K_M-MTP.gguf`
Service alias: `qwen36-35b-a3b-q4km-mtp`

Configuration:

- SpaceMIT IME2 automatic scheduler;
- native MTP, draft minimum 1 and maximum 3;
- 8 generation, batch, draft and draft-batch threads;
- batch 512, microbatch 128;
- one 8,192-token slot;
- Q8_0 K/V cache.

Five identical 64-token reasoning requests produced:

- mean generation: 10.1683 tokens/s;
- range: 10.0639–10.2006 tokens/s;
- draft acceptance: 230/245, 93.88%;
- minimum system memory available: 8,291,552 KiB;
- peak process RSS: 31,738,272 KiB;
- fingerprint: `b10190-2790768bf`.

Main-only control on the same prompt averaged 6.6038 tokens/s. Native MTP improved generation by 54.0%.

Persistent service files before this campaign:

- launcher SHA-256: `f2fa7996c24ec45b9fbee3da70216e2c6ff4bd91b92aaf335bc3156ffc6fa635`;
- unit SHA-256: `bba28f6e2d8bd729648d7f4ddf3f1e9d612e6912371badee02134a9049841d52`.

Promotion gate: a kernel must pass focused numerical tests and improve repeated end-to-end Qwen results beyond the 2% noise threshold without reducing MTP acceptance or memory safety.
