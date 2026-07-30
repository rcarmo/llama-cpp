#!/usr/bin/env python3
import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / "gguf-py"))
from gguf import GGUFReader  # noqa: E402

PATTERN = re.compile(r"^blk\.(\d+)\.ffn_(gate|up|down)_exps\.weight$")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("model")
    parser.add_argument("--sample-experts", type=int, default=2)
    parser.add_argument("--output")
    args = parser.parse_args()

    model = Path(args.model).resolve()
    reader = GGUFReader(str(model), "r")
    layers = defaultdict(dict)
    errors = []

    for tensor in reader.tensors:
        match = PATTERN.match(tensor.name)
        if not match:
            continue
        layer = int(match.group(1))
        projection = match.group(2)
        expert_count = int(tensor.shape[-1])
        if expert_count <= 0 or tensor.n_bytes % expert_count:
            errors.append(f"{tensor.name}: bytes not divisible by expert count")
            continue
        expert_bytes = tensor.n_bytes // expert_count
        storage_shape = tuple(int(v) for v in tensor.data.shape)
        storage_strides = tuple(int(v) for v in tensor.data.strides)
        contiguous_outer = bool(storage_shape and storage_shape[0] == expert_count and storage_strides[0] == expert_bytes)
        aligned = tensor.data_offset % reader.alignment == 0 and expert_bytes % reader.alignment == 0
        layers[layer][projection] = {
            "name": tensor.name,
            "type": str(tensor.tensor_type),
            "logical_shape": [int(v) for v in tensor.shape],
            "storage_shape": list(storage_shape),
            "storage_strides": list(storage_strides),
            "tensor_offset": int(tensor.data_offset),
            "tensor_bytes": int(tensor.n_bytes),
            "expert_count": expert_count,
            "expert_bytes": int(expert_bytes),
            "contiguous_outer_experts": contiguous_outer,
            "aligned": aligned,
        }

    output_layers = []
    for layer in sorted(layers):
        projections = layers[layer]
        missing = sorted({"gate", "up", "down"} - projections.keys())
        counts = {v["expert_count"] for v in projections.values()}
        if missing:
            errors.append(f"layer {layer}: missing projections {missing}")
        if len(counts) > 1:
            errors.append(f"layer {layer}: mismatched expert counts {sorted(counts)}")
        samples = []
        expert_count = next(iter(counts), 0)
        for expert in range(min(args.sample_experts, expert_count)):
            ranges = []
            for projection in ("gate", "up", "down"):
                if projection not in projections:
                    continue
                item = projections[projection]
                ranges.append({
                    "projection": projection,
                    "offset": item["tensor_offset"] + expert * item["expert_bytes"],
                    "length": item["expert_bytes"],
                })
            samples.append({"expert": expert, "ranges": ranges})
        output_layers.append({"layer": layer, "projections": projections, "sample_experts": samples})

    report = {
        "model": str(model),
        "file_size": model.stat().st_size,
        "gguf_alignment": int(reader.alignment),
        "gguf_data_offset": int(reader.data_offset),
        "mmap_backed": all(hasattr(tensor.data, "filename") for tensor in reader.tensors),
        "expert_layers": len(output_layers),
        "ranges_per_expert": 3,
        "layers": output_layers,
        "errors": errors,
    }
    text = json.dumps(report, indent=2) + "\n"
    if args.output:
        Path(args.output).write_text(text)
    print(text, end="")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
