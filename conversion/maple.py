from __future__ import annotations

from typing import Iterable, TYPE_CHECKING

import torch

if TYPE_CHECKING:
    from torch import Tensor

from .base import ModelBase, TextModel, gguf


@ModelBase.register("MapleForCausalLM")
class MapleModel(TextModel):
    model_arch = gguf.MODEL_ARCH.MAPLE

    def set_gguf_parameters(self):
        super().set_gguf_parameters()

        head_dim = int(self.hparams["head_dim"])
        rotary_dim = int(head_dim * float(self.hparams["partial_rotary_factor"]))
        layer_types = self.hparams["layer_types"]
        if len(layer_types) != self.block_count:
            raise ValueError("Maple layer_types length must match num_hidden_layers")
        if any(layer_type not in ("sliding_attention", "full_attention") for layer_type in layer_types):
            raise ValueError("Maple layer_types contains an unsupported value")

        self.gguf_writer.add_sliding_window(int(self.hparams["sliding_window"]))
        self.gguf_writer.add_sliding_window_pattern(
            [layer_type == "sliding_attention" for layer_type in layer_types]
        )
        self.gguf_writer.add_rope_dimension_count(0)
        self.gguf_writer.add_rope_dimension_count_swa(rotary_dim)
        self.gguf_writer.add_expert_feed_forward_length(int(self.hparams["moe_intermediate_size"]))
        self.gguf_writer.add_expert_gating_func(gguf.ExpertGatingFuncType.SOFTMAX)
        self.gguf_writer.add_expert_weights_norm(bool(self.hparams["norm_topk_prob"]))
        self.gguf_writer.add_swiglu_clamp_exp([7.0] * self.block_count)

    def modify_tensors(self, data_torch: Tensor, name: str, bid: int | None) -> Iterable[tuple[str, Tensor]]:
        if ".mlp.experts." in name and data_torch.ndim != 3:
            raise ValueError(f"Maple expert tensor must be stacked: {name} {tuple(data_torch.shape)}")
        if name.endswith(".mlp.gate.weight"):
            data_torch = data_torch.float()
        yield from super().modify_tensors(data_torch.contiguous(), name, bid)

    def tensor_force_quant(self, name: str, new_name: str, bid: int | None, n_dims: int):
        if self.ftype == gguf.LlamaFileType.MOSTLY_TQ2_0:
            if new_name in ("token_embd.weight", "output.weight"):
                return gguf.GGMLQuantizationType.F32
            if new_name.endswith("ffn_gate_inp.weight"):
                return gguf.GGMLQuantizationType.F32
            if n_dims >= 2:
                return gguf.GGMLQuantizationType.TQ2_0
        return super().tensor_force_quant(name, new_name, bid, n_dims)
