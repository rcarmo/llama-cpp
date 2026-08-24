#!/usr/bin/env python3

import argparse
import json
import math
import struct
from pathlib import Path

import torch
from safetensors import safe_open


class TensorStore:
    def __init__(self, model_dir: Path):
        self.model_dir = model_dir
        index = json.loads((model_dir / "model.safetensors.index.json").read_text())
        self.weight_map = index["weight_map"]

    def get(self, name: str) -> torch.Tensor:
        with safe_open(self.model_dir / self.weight_map[name], framework="pt", device="cpu") as file:
            return file.get_tensor(name)


def unpack_codes(packed: torch.Tensor, bits: int) -> torch.Tensor:
    shifts = torch.arange(0, 32, bits, dtype=torch.int64)
    mask = (1 << bits) - 1
    values = (packed.to(torch.int64).unsqueeze(-1) >> shifts) & mask
    return values.reshape(*packed.shape[:-1], packed.shape[-1] * (32 // bits))


def dequant_affine(store: TensorStore, prefix: str, group_size: int) -> torch.Tensor:
    packed = store.get(prefix + ".weight")
    scales = store.get(prefix + ".scales").float()
    biases = store.get(prefix + ".biases").float()
    values = unpack_codes(packed, 4).float()
    shape = values.shape
    values = values.reshape(*shape[:-1], shape[-1] // group_size, group_size)
    return (values * scales.unsqueeze(-1) + biases.unsqueeze(-1)).reshape(shape)


def read_f32(path: Path, rows: int, cols: int) -> torch.Tensor:
    data = path.read_bytes()
    values = struct.unpack("<" + "f" * (len(data) // 4), data)
    return torch.tensor(values, dtype=torch.float32).reshape(rows, cols)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("model", type=Path)
    parser.add_argument("capture", type=Path)
    parser.add_argument("--probes", default="64,128,256,512,1024")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    config = json.loads((args.model / "config.json").read_text())
    meta = config["flash_head"]
    store = TensorStore(args.model)
    hidden_size = int(config["hidden_size"])
    vocab_size = int(config["vocab_size"])

    centroids = dequant_affine(store, "lm_head_flash.centroids", int(meta["group_size"]))
    if not meta.get("scaled_centroids", False):
        centroids = centroids * store.get("lm_head_flash.cluster_scale").float().unsqueeze(-1)
    token_map = store.get("lm_head_flash.token_map").to(torch.int64)
    forced = torch.tensor(meta.get("force_tokens", []), dtype=torch.int64)

    hidden = read_f32(args.capture / "final_hidden.bin", 15, hidden_size)
    logits = read_f32(args.capture / "logits.bin", 15, vocab_size)
    probs = torch.softmax(logits, dim=-1)
    top1 = torch.argmax(logits, dim=-1)
    top32 = torch.topk(logits, 32, dim=-1).indices
    scores = hidden @ centroids.T

    reference_tokens = torch.tensor([
        151644, 872, 198, 5598, 1172, 25, 27223, 867, 151645, 198,
        151644, 77091, 198, 151667, 198,
    ], dtype=torch.int64)

    results = []
    for probes in [int(value) for value in args.probes.split(",")]:
        probes = min(probes, centroids.shape[0])
        clusters = torch.topk(scores, probes, dim=-1).indices
        rows = []
        for token in range(hidden.shape[0]):
            selected = token_map[clusters[token]].reshape(-1)
            if forced.numel():
                selected = torch.cat((selected, forced))
            selected = torch.unique(selected)
            selected_set = set(selected.tolist())
            retained_mass = float(probs[token, selected].sum())
            true_next = int(reference_tokens[token + 1]) if token + 1 < reference_tokens.numel() else None
            rows.append({
                "token": token,
                "unique_rows": int(selected.numel()),
                "top1_included": int(top1[token]) in selected_set,
                "top32_included": sum(int(value) in selected_set for value in top32[token]),
                "retained_probability_mass": retained_mass,
                "truncation_kl": -math.log(max(retained_mass, 1e-30)),
                "next_token_included": None if true_next is None else true_next in selected_set,
            })
        results.append({
            "probes": probes,
            "rows": rows,
            "mean_unique_rows": sum(row["unique_rows"] for row in rows) / len(rows),
            "top1_recall": sum(row["top1_included"] for row in rows) / len(rows),
            "top32_recall": sum(row["top32_included"] for row in rows) / (len(rows) * 32),
            "mean_retained_probability_mass": sum(row["retained_probability_mass"] for row in rows) / len(rows),
            "minimum_retained_probability_mass": min(row["retained_probability_mass"] for row in rows),
            "mean_truncation_kl": sum(row["truncation_kl"] for row in rows) / len(rows),
            "maximum_truncation_kl": max(row["truncation_kl"] for row in rows),
            "next_token_recall": sum(row["next_token_included"] for row in rows if row["next_token_included"] is not None) / (len(rows) - 1),
        })

    output = {
        "model": str(args.model),
        "capture": str(args.capture),
        "cluster_count": int(centroids.shape[0]),
        "cluster_size": int(token_map.shape[1]),
        "forced_tokens": forced.tolist(),
        "results": results,
    }
    args.output.write_text(json.dumps(output, indent=2) + "\n")
    print(json.dumps([{key: value for key, value in result.items() if key != "rows"} for result in results], indent=2))


if __name__ == "__main__":
    main()
