#!/usr/bin/env python3

import argparse
import csv
import json
import math
import struct
import zipfile
from pathlib import Path


def read_npy_from_npz(npz_path: Path, member: str):
    with zipfile.ZipFile(npz_path) as archive:
        data = archive.read(member + ".npy")
    if data[:6] != b"\x93NUMPY":
        raise ValueError("invalid NPY file")
    major = data[6]
    if major == 1:
        header_len = struct.unpack_from("<H", data, 8)[0]
        header_start = 10
    else:
        header_len = struct.unpack_from("<I", data, 8)[0]
        header_start = 12
    header = data[header_start:header_start + header_len].decode("latin1")
    dtype = header.split("'descr': '", 1)[1].split("'", 1)[0]
    shape_text = header.split("'shape': (", 1)[1].split(")", 1)[0]
    shape = tuple(int(part.strip()) for part in shape_text.split(",") if part.strip())
    raw = data[header_start + header_len:]
    formats = {"<f4": "f", "<f8": "d", "<i8": "q", "<i4": "i"}
    code = formats[dtype]
    return shape, list(struct.iter_unpack("<" + code, raw))


def flatten(values):
    return [value[0] for value in values]


def read_capture(path: Path, dtype: str):
    raw = path.read_bytes()
    code = {"f32": "f", "i32": "i", "f16": "e"}[dtype]
    return flatten(struct.iter_unpack("<" + code, raw))


def metrics(actual, expected):
    if len(actual) != len(expected):
        return {"count_actual": len(actual), "count_expected": len(expected)}
    max_abs = 0.0
    sum_sq = 0.0
    ref_sq = 0.0
    dot = 0.0
    act_sq = 0.0
    for a, e in zip(actual, expected):
        diff = float(a) - float(e)
        max_abs = max(max_abs, abs(diff))
        sum_sq += diff * diff
        ref_sq += float(e) * float(e)
        act_sq += float(a) * float(a)
        dot += float(a) * float(e)
    count = len(actual)
    return {
        "count": count,
        "max_abs": max_abs,
        "rmse": math.sqrt(sum_sq / count),
        "nrmse": math.sqrt(sum_sq / ref_sq) if ref_sq else 0.0,
        "cosine": dot / math.sqrt(act_sq * ref_sq) if act_sq and ref_sq else 0.0,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("capture", type=Path)
    parser.add_argument("reference_json", type=Path)
    parser.add_argument("reference_npz", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    manifest = {}
    with (args.capture / "manifest.tsv").open() as file:
        for row in csv.reader(file, delimiter="\t"):
            name, dtype, *rest = row
            manifest[name] = {"dtype": dtype, "shape": [int(x) for x in rest[:4]], "file": rest[4]}

    reference = json.loads(args.reference_json.read_text())
    result = {"tensors": {}, "routing": {}}

    mapping = {"embd": ("embedding", None)}
    for layer in range(24):
        key = f"layer_{layer:02d}"
        mapping.update({
            f"Qcur-{layer}": (key, "q"),
            f"Kcur-{layer}": (key, "k"),
            f"Vcur-{layer}": (key, "v"),
            f"kq_soft_max-{layer}": (key, "attention_probs"),
            f"ffn_moe_logits-{layer}": (key, "router_logits"),
            f"l_out-{layer}": (key, "output"),
        })

    for capture_name, (section, field) in mapping.items():
        if capture_name not in manifest:
            continue
        entry = manifest[capture_name]
        actual = read_capture(args.capture / entry["file"], entry["dtype"])
        stats = reference["captures"][section] if field is None else reference["captures"][section][field]
        result["tensors"][capture_name] = {
            "capture_shape": entry["shape"],
            "reference_shape": stats["shape"],
            "reference_stats": {k: stats[k] for k in ("mean", "std", "min", "max", "l2")},
            "capture_stats": {
                "mean": sum(actual) / len(actual),
                "min": min(actual),
                "max": max(actual),
                "l2": math.sqrt(sum(float(x) * float(x) for x in actual)),
            },
        }

    _, logits_ref_raw = read_npy_from_npz(args.reference_npz, "logits")
    logits_ref = flatten(logits_ref_raw)
    logits = read_capture(args.capture / manifest["logits"]["file"], "f32")
    result["logits"] = metrics(logits, logits_ref)

    _, hidden_ref_raw = read_npy_from_npz(args.reference_npz, "final_hidden")
    hidden_ref = flatten(hidden_ref_raw)
    hidden = read_capture(args.capture / manifest["final_hidden"]["file"], "f32")
    result["final_hidden"] = metrics(hidden, hidden_ref)

    _, ids_ref_raw = read_npy_from_npz(args.reference_npz, "route_ids")
    ids_ref = flatten(ids_ref_raw)
    _, scores_ref_raw = read_npy_from_npz(args.reference_npz, "route_scores")
    scores_ref = flatten(scores_ref_raw)
    ids = []
    scores = []
    for layer in range(24):
        router_logits = read_capture(args.capture / manifest[f"ffn_moe_logits-{layer}"]["file"], "f32")
        for token in range(15):
            row = router_logits[token * 256:(token + 1) * 256]
            ids.extend(sorted(range(256), key=row.__getitem__, reverse=True)[:8])
        scores.extend(read_capture(args.capture / manifest[f"ffn_moe_weights_norm-{layer}"]["file"], "f32"))
    result["routing"] = {
        "id_match_count": sum(int(a == b) for a, b in zip(ids, ids_ref)),
        "id_count": len(ids_ref),
        "scores": metrics(scores, scores_ref),
    }

    args.output.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"logits": result["logits"], "final_hidden": result["final_hidden"], "routing": result["routing"]}, indent=2))


if __name__ == "__main__":
    main()
