# Provenance

`model-sources.tsv` records the exact Hugging Face repository revisions whose linked object digests match the tested files.

`repository.txt` records the checkout and built server revisions used by the campaign. `host.txt` records the static host identity.

`services/` contains snapshots of the Qwen3.8, Qwen3.6 and restored Ornith user-service configuration. These files describe the persistent host profiles. The campaign scripts launched benchmark servers directly and stored the exact commands with their results.

`restored-state.txt` records the final provider and zram checks after the campaign.
