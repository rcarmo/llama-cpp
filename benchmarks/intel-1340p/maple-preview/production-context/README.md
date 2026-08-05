# Maple production-context evidence

The `generated/` prompt copies are omitted. `build-prompts.ts` reconstructs them from the checksum-pinned `ornith-content.txt` source in the Ornith/Gemma workload directory. `results/manifest.json` records the exact source, prompt and request hashes.

`results/response-64k.json` and `results/response-124k.json` retain only the result fields needed for review. The raw prompt strings were removed after their hashes, token counts and response timings were recorded.

The final installed service uses two independent 131,072-token slots on `127.0.0.1:8093`. The long-context campaign used one slot to isolate cache restore and memory behavior.
