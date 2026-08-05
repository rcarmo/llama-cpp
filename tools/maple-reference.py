#!/usr/bin/env python3

import argparse
import hashlib
import json
import math
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
from safetensors import safe_open
from transformers import AutoTokenizer


class TensorStore:
    def __init__(self, model_dir: Path):
        self.model_dir = model_dir
        index = json.loads((model_dir / "model.safetensors.index.json").read_text())
        self.weight_map = index["weight_map"]

    def get(self, name: str) -> torch.Tensor:
        filename = self.weight_map[name]
        with safe_open(self.model_dir / filename, framework="pt", device="cpu") as f:
            return f.get_tensor(name)


def unpack_codes(packed: torch.Tensor, bits: int) -> torch.Tensor:
    count = 32 // bits
    shifts = torch.arange(0, 32, bits, dtype=torch.int64)
    values = (packed.to(torch.int64).unsqueeze(-1) >> shifts) & ((1 << bits) - 1)
    return values.reshape(*packed.shape[:-1], packed.shape[-1] * count)


def dequant_ternary(store: TensorStore, prefix: str, rows=None) -> torch.Tensor:
    packed = store.get(prefix + ".weight").to(torch.int64)
    alpha = store.get(prefix + ".row_alpha").float()
    if rows is not None:
        packed = packed[rows]
        alpha = alpha[rows]
    values = unpack_codes(packed, 2).float() - 1.0
    return values * alpha.unsqueeze(-1)


def dequant_affine(store: TensorStore, prefix: str, group_size: int = 64, rows=None) -> torch.Tensor:
    packed = store.get(prefix + ".weight").to(torch.int64)
    scales = store.get(prefix + ".scales").float()
    biases = store.get(prefix + ".biases").float()
    if rows is not None:
        packed = packed[rows]
        scales = scales[rows]
        biases = biases[rows]
    values = unpack_codes(packed, 4).float()
    shape = values.shape
    values = values.reshape(*shape[:-1], shape[-1] // group_size, group_size)
    values = values * scales.unsqueeze(-1) + biases.unsqueeze(-1)
    return values.reshape(shape)


def rms_norm(x: torch.Tensor, weight: torch.Tensor, eps: float) -> torch.Tensor:
    return x * torch.rsqrt(x.square().mean(dim=-1, keepdim=True) + eps) * weight.float()


def apply_partial_rope(x: torch.Tensor, positions: torch.Tensor, rotary_dim: int, theta: float) -> torch.Tensor:
    if rotary_dim == 0:
        return x
    half = rotary_dim // 2
    inv_freq = theta ** (-torch.arange(half, dtype=torch.float32) / half)
    angles = positions.float().unsqueeze(-1) * inv_freq.unsqueeze(0)
    cos = angles.cos().unsqueeze(0).unsqueeze(0)
    sin = angles.sin().unsqueeze(0).unsqueeze(0)
    rot = x[..., :rotary_dim]
    passthrough = x[..., rotary_dim:]
    first = rot[..., :half]
    second = rot[..., half:]
    rotated = torch.cat((first * cos - second * sin, second * cos + first * sin), dim=-1)
    return torch.cat((rotated, passthrough), dim=-1)


def tensor_digest(x: torch.Tensor) -> str:
    data = x.detach().float().cpu().contiguous().numpy().astype("<f4", copy=False)
    return hashlib.sha256(data.tobytes()).hexdigest()


def tensor_stats(x: torch.Tensor) -> dict:
    y = x.detach().float().cpu()
    return {
        "shape": list(y.shape),
        "mean": float(y.mean()),
        "std": float(y.std(unbiased=False)),
        "min": float(y.min()),
        "max": float(y.max()),
        "l2": float(torch.linalg.vector_norm(y)),
        "sha256_f32le": tensor_digest(y),
    }


class MapleReference:
    def __init__(self, model_dir: Path):
        self.model_dir = model_dir
        self.config = json.loads((model_dir / "config.json").read_text())
        self.store = TensorStore(model_dir)
        self.eps = float(self.config["rms_norm_eps"])
        self.hidden = int(self.config["hidden_size"])
        self.head_dim = int(self.config["head_dim"])
        self.n_heads = int(self.config["num_attention_heads"])
        self.n_kv_heads = int(self.config["num_key_value_heads"])
        self.n_experts = int(self.config["num_experts"])
        self.n_experts_used = int(self.config["num_experts_per_tok"])
        self.n_layers = int(self.config["num_hidden_layers"])
        self.window = int(self.config["sliding_window"])
        self.rotary_dim = int(self.head_dim * self.config["partial_rotary_factor"])
        self.theta = float(self.config["rope_theta"])
        self.layer_types = self.config["layer_types"]

    def embedding(self, token_ids: torch.Tensor) -> torch.Tensor:
        rows = token_ids.reshape(-1)
        values = dequant_affine(self.store, "model.word_embeddings", rows=rows)
        return values.reshape(*token_ids.shape, self.hidden)

    def project_ternary(self, x: torch.Tensor, prefix: str) -> torch.Tensor:
        return F.linear(x, dequant_ternary(self.store, prefix))

    def attention(self, x: torch.Tensor, layer: int, positions: torch.Tensor):
        prefix = f"model.layers.{layer}"
        q = self.project_ternary(x, prefix + ".self_attn.q_proj")
        k = self.project_ternary(x, prefix + ".self_attn.k_proj")
        v = self.project_ternary(x, prefix + ".self_attn.v_proj")
        batch, length, _ = q.shape
        q = q.view(batch, length, self.n_heads, self.head_dim).transpose(1, 2)
        k = k.view(batch, length, self.n_kv_heads, self.head_dim).transpose(1, 2)
        v = v.view(batch, length, self.n_kv_heads, self.head_dim).transpose(1, 2)
        q_weight = self.store.get(prefix + ".self_attn.q_norm.weight")
        k_weight = self.store.get(prefix + ".self_attn.k_norm.weight")
        q = rms_norm(q, q_weight, self.eps)
        k = rms_norm(k, k_weight, self.eps)
        if self.layer_types[layer] == "sliding_attention":
            q = apply_partial_rope(q, positions, self.rotary_dim, self.theta)
            k = apply_partial_rope(k, positions, self.rotary_dim, self.theta)
        repeats = self.n_heads // self.n_kv_heads
        k_full = k.repeat_interleave(repeats, dim=1)
        v_full = v.repeat_interleave(repeats, dim=1)
        scores = torch.matmul(q, k_full.transpose(-1, -2)) / math.sqrt(self.head_dim)
        causal = torch.triu(torch.ones(length, length, dtype=torch.bool), diagonal=1)
        if self.layer_types[layer] == "sliding_attention":
            distance = positions.unsqueeze(1) - positions.unsqueeze(0)
            causal |= distance >= self.window
        scores = scores.masked_fill(causal.unsqueeze(0).unsqueeze(0), float("-inf"))
        probs = torch.softmax(scores, dim=-1)
        out = torch.matmul(probs, v_full).transpose(1, 2).reshape(batch, length, -1)
        out = self.project_ternary(out, prefix + ".self_attn.o_proj")
        return out, q, k, v, probs

    def moe(self, x: torch.Tensor, layer: int):
        prefix = f"model.layers.{layer}.mlp"
        router = self.store.get(prefix + ".gate.weight").float()
        logits = F.linear(x.float(), router)
        all_scores = torch.softmax(logits, dim=-1)
        scores, ids = torch.topk(all_scores, self.n_experts_used, dim=-1)
        scores = scores / scores.sum(dim=-1, keepdim=True)
        flat = x.reshape(-1, self.hidden)
        ids_flat = ids.reshape(-1, self.n_experts_used)
        scores_flat = scores.reshape(-1, self.n_experts_used)
        unique_ids, inverse = torch.unique(ids_flat, sorted=True, return_inverse=True)
        gate_all = dequant_ternary(self.store, prefix + ".switch_mlp.gate_proj", rows=unique_ids)
        up_all = dequant_ternary(self.store, prefix + ".switch_mlp.up_proj", rows=unique_ids)
        down_all = dequant_ternary(self.store, prefix + ".switch_mlp.down_proj", rows=unique_ids)
        inverse = inverse.reshape_as(ids_flat)
        result = torch.zeros_like(flat)
        for token in range(flat.shape[0]):
            selected = inverse[token]
            gate_w = gate_all[selected]
            up_w = up_all[selected]
            down_w = down_all[selected]
            inp = flat[token]
            gate = torch.einsum("eoh,h->eo", gate_w, inp)
            up = torch.einsum("eoh,h->eo", up_w, inp)
            activated = F.silu(torch.clamp(gate, max=7.0)) * torch.clamp(up, -7.0, 7.0)
            expert_out = torch.einsum("eho,eo->eh", down_w, activated)
            result[token] = torch.sum(expert_out * scores_flat[token].unsqueeze(-1), dim=0)
        return result.reshape_as(x), ids, scores, logits

    def forward(self, token_ids: torch.Tensor, capture: bool = True, capture_arrays: bool = False):
        positions = torch.arange(token_ids.shape[1], dtype=torch.long)
        x = self.embedding(token_ids).float()
        captures = {"embedding": tensor_stats(x)} if capture else {}
        arrays = {"embedding": x.detach().float().cpu().numpy()} if capture_arrays else {}
        route_ids = []
        route_scores = []
        for layer in range(self.n_layers):
            prefix = f"model.layers.{layer}"
            attn_in = rms_norm(x, self.store.get(prefix + ".input_layernorm.weight"), self.eps)
            attn, q, k, v, probs = self.attention(attn_in, layer, positions)
            x = x + attn
            moe_in = rms_norm(x, self.store.get(prefix + ".post_attention_layernorm.weight"), self.eps)
            moe, ids, scores, router_logits = self.moe(moe_in, layer)
            x = x + moe
            route_ids.append(ids.cpu())
            route_scores.append(scores.cpu())
            if capture_arrays:
                arrays.update({
                    f"layer_{layer:02d}_output": x.detach().float().cpu().numpy(),
                    f"layer_{layer:02d}_q": q.detach().float().cpu().numpy(),
                    f"layer_{layer:02d}_k": k.detach().float().cpu().numpy(),
                    f"layer_{layer:02d}_v": v.detach().float().cpu().numpy(),
                    f"layer_{layer:02d}_attention_probs": probs.detach().float().cpu().numpy(),
                    f"layer_{layer:02d}_router_logits": router_logits.detach().float().cpu().numpy(),
                })
            if capture:
                captures[f"layer_{layer:02d}"] = {
                    "output": tensor_stats(x),
                    "q": tensor_stats(q),
                    "k": tensor_stats(k),
                    "v": tensor_stats(v),
                    "attention_probs": tensor_stats(probs),
                    "router_logits": tensor_stats(router_logits),
                    "route_ids": ids.cpu().tolist(),
                    "route_scores": scores.cpu().tolist(),
                }
        final = rms_norm(x, self.store.get("model.norm.weight"), self.eps)
        head = dequant_affine(self.store, "lm_head")
        logits = F.linear(final, head)
        if capture:
            captures["final_hidden"] = tensor_stats(final)
            captures["logits"] = tensor_stats(logits)
            top_values, top_ids = torch.topk(logits[:, -1].float(), 32, dim=-1)
            captures["top_logits"] = {
                "ids": top_ids.cpu().tolist(),
                "values": top_values.cpu().tolist(),
            }
        return logits, final, captures, route_ids, route_scores, arrays


def position_fixture(config: dict) -> dict:
    head_dim = int(config["head_dim"])
    rotary_dim = int(head_dim * config["partial_rotary_factor"])
    positions = torch.tensor([0, 1, 511, 512, 4095, 65535, 131071], dtype=torch.long)
    base = torch.arange(2 * head_dim, dtype=torch.float32).reshape(1, 2, 1, head_dim) / 127.0
    rotated = apply_partial_rope(base.expand(1, 2, positions.numel(), head_dim), positions, rotary_dim, float(config["rope_theta"]))
    return {
        "positions": positions.tolist(),
        "input": tensor_stats(base),
        "rotated": tensor_stats(rotated),
        "samples": rotated[0, 0, :, :8].tolist(),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("model_dir", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--prompt", default="Maple reference fixture.")
    parser.add_argument("--max-tokens", type=int, default=64)
    parser.add_argument("--full", action="store_true")
    parser.add_argument("--dump-stages", action="store_true")
    args = parser.parse_args()

    tokenizer = AutoTokenizer.from_pretrained(args.model_dir, local_files_only=True)
    rendered = tokenizer.apply_chat_template([{"role": "user", "content": args.prompt}], tokenize=False, add_generation_prompt=True)
    token_ids = tokenizer(rendered, add_special_tokens=False, return_tensors="pt").input_ids[:, : args.max_tokens]
    result = {
        "prompt": args.prompt,
        "rendered": rendered,
        "token_ids": token_ids[0].tolist(),
        "tokens": tokenizer.convert_ids_to_tokens(token_ids[0]),
    }
    config = json.loads((args.model_dir / "config.json").read_text())
    result["position_fixture"] = position_fixture(config)
    if args.full:
        model = MapleReference(args.model_dir)
        logits, final, captures, route_ids, route_scores, stage_arrays = model.forward(
            token_ids, capture_arrays=args.dump_stages
        )
        result["captures"] = captures
        arrays = {
            "token_ids": token_ids.cpu().numpy(),
            "final_hidden": final.detach().float().cpu().numpy(),
            "logits": logits.detach().float().cpu().numpy(),
            "route_ids": torch.stack(route_ids).numpy(),
            "route_scores": torch.stack(route_scores).numpy(),
        }
        arrays.update(stage_arrays)
        np.savez_compressed(args.output.with_suffix(".npz"), **arrays)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n")


if __name__ == "__main__":
    main()
