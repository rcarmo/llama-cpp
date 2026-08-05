#!/usr/bin/env python3

import argparse
import json
from pathlib import Path

import torch
from safetensors import safe_open
from safetensors.torch import save_file


class TensorStore:
    def __init__(self, model_dir: Path):
        self.model_dir = model_dir
        index = json.loads((model_dir / "model.safetensors.index.json").read_text())
        self.weight_map = index["weight_map"]

    def has(self, name: str) -> bool:
        return name in self.weight_map

    def get(self, name: str) -> torch.Tensor:
        with safe_open(self.model_dir / self.weight_map[name], framework="pt", device="cpu") as f:
            return f.get_tensor(name)


def unpack_codes(packed: torch.Tensor, bits: int) -> torch.Tensor:
    shifts = torch.arange(0, 32, bits, dtype=torch.int64)
    values = (packed.to(torch.int64).unsqueeze(-1) >> shifts) & ((1 << bits) - 1)
    return values.reshape(*packed.shape[:-1], packed.shape[-1] * (32 // bits))


def ternary_values(store: TensorStore, prefix: str) -> torch.Tensor:
    packed = store.get(prefix + ".weight")
    return unpack_codes(packed, 2).float() - 1.0


def dequant_ternary(store: TensorStore, prefix: str, dtype: torch.dtype) -> torch.Tensor:
    alpha = store.get(prefix + ".row_alpha").float()
    return (ternary_values(store, prefix) * alpha.unsqueeze(-1)).to(dtype)


def dequant_affine(store: TensorStore, prefix: str, dtype: torch.dtype, group_size: int = 64) -> torch.Tensor:
    packed = store.get(prefix + ".weight")
    scales = store.get(prefix + ".scales").float()
    biases = store.get(prefix + ".biases").float()
    values = unpack_codes(packed, 4).float()
    shape = values.shape
    values = values.reshape(*shape[:-1], shape[-1] // group_size, group_size)
    values = values * scales.unsqueeze(-1) + biases.unsqueeze(-1)
    return values.reshape(shape).to(dtype)


def add_ternary(store: TensorStore, tensors: dict, source: str, target: str, dtype: torch.dtype):
    tensors[target] = dequant_ternary(store, source, dtype).contiguous()


def layer_tensors(store: TensorStore, layer: int, dtype: torch.dtype) -> dict[str, torch.Tensor]:
    source = f"model.layers.{layer}"
    target = source
    tensors = {
        target + ".input_layernorm.weight": store.get(source + ".input_layernorm.weight"),
        target + ".post_attention_layernorm.weight": store.get(source + ".post_attention_layernorm.weight"),
        target + ".self_attn.q_norm.weight": store.get(source + ".self_attn.q_norm.weight"),
        target + ".self_attn.k_norm.weight": store.get(source + ".self_attn.k_norm.weight"),
        target + ".mlp.gate.weight": store.get(source + ".mlp.gate.weight"),
    }
    for projection in ("q_proj", "k_proj", "v_proj", "o_proj"):
        add_ternary(
            store,
            tensors,
            source + ".self_attn." + projection,
            target + ".self_attn." + projection + ".weight",
            dtype,
        )
    for projection in ("gate_proj", "up_proj", "down_proj"):
        add_ternary(
            store,
            tensors,
            source + ".mlp.switch_mlp." + projection,
            target + ".mlp.experts." + projection + ".weight",
            dtype,
        )
    return tensors


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--dtype", choices=("bf16", "f32"), default="bf16")
    args = parser.parse_args()
    dtype = torch.bfloat16 if args.dtype == "bf16" else torch.float32

    args.output.mkdir(parents=True, exist_ok=True)
    store = TensorStore(args.source)
    config = json.loads((args.source / "config.json").read_text())
    config.pop("quantization", None)
    config.pop("quantization_config", None)
    config.pop("flash_head", None)
    config.pop("model_file", None)
    config["architectures"] = ["MapleForCausalLM"]
    config["model_type"] = "maple"
    config["max_position_embeddings"] = 131072
    config["nope_on_global_attention"] = True
    (args.output / "config.json").write_text(json.dumps(config, indent=2, sort_keys=True) + "\n")

    for filename in ("tokenizer.json", "tokenizer_config.json", "special_tokens_map.json", "chat_template.jinja"):
        (args.output / filename).write_bytes((args.source / filename).read_bytes())

    weight_map = {}
    total_size = 0

    globals_out = {
        "model.embed_tokens.weight": dequant_affine(store, "model.word_embeddings", dtype).contiguous(),
        "model.norm.weight": store.get("model.norm.weight"),
        "lm_head.weight": dequant_affine(store, "lm_head", dtype).contiguous(),
    }
    global_name = "model-globals.safetensors"
    save_file(globals_out, args.output / global_name, metadata={"format": "pt"})
    for name in globals_out:
        weight_map[name] = global_name
    total_size += (args.output / global_name).stat().st_size
    del globals_out

    for layer in range(int(config["num_hidden_layers"])):
        print(f"unpack layer {layer}", flush=True)
        tensors = layer_tensors(store, layer, dtype)
        filename = f"model-layer-{layer:02d}.safetensors"
        save_file(tensors, args.output / filename, metadata={"format": "pt"})
        for name in tensors:
            weight_map[name] = filename
        total_size += (args.output / filename).stat().st_size
        del tensors

    index = {"metadata": {"total_size": total_size}, "weight_map": weight_map}
    (args.output / "model.safetensors.index.json").write_text(json.dumps(index, indent=2) + "\n")
    print(f"wrote {total_size} bytes to {args.output}")


if __name__ == "__main__":
    main()
