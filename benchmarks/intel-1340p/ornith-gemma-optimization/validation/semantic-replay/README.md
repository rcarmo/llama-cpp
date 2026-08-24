# Semantic native-graph replay

The exported native graph files were replayed numerically twice on the CPU backend against its reference implementation after adding source-slot-aware, stride-aware semantic input initialisation.

- Ornith target plus embedded MTP: 150/150 passed in both repetitions.
- Gemma target plus paired assistant: 141/141 passed in both repetitions.

The metadata-only export format is unchanged. `tests/semantic-graph-replay.txt` preserves two old-format `GET_ROWS` cases, including a non-contiguous expert-index view, as a model-free CTest regression.
