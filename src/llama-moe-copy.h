#pragma once

#include "llama-model.h"

inline bool llama_moe_weight_is_shared(const llama_model & model, const ggml_tensor * weight) {
    if (weight == nullptr) {
        return false;
    }
    bool seen = false;
    for (const auto & layer : model.layers) {
        if (weight == layer.ffn_gate_exps || weight == layer.ffn_up_exps ||
            weight == layer.ffn_down_exps || weight == layer.ffn_gate_up_exps) {
            if (seen) {
                return true;
            }
            seen = true;
        }
    }
    return false;
}
