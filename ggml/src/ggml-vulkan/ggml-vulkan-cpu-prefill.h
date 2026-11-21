#pragma once

#include "ggml.h"

#include <regex>

struct ggml_vk_cpu_prefill_policy {
    bool enabled;
    bool valid = true;
    std::regex pattern;

    explicit ggml_vk_cpu_prefill_policy(const char * text) : enabled(text && text[0]) {
        if (enabled) {
            try {
                pattern = std::regex(text, std::regex::ECMAScript | std::regex::optimize);
            } catch (const std::regex_error &) {
                valid = false;
            }
        }
    }

    bool allows(const ggml_tensor * op, int64_t batch_size) const {
        if (!enabled) {
            return true;
        }
        return valid && op && batch_size > 1 &&
            (op->op == GGML_OP_MUL_MAT || op->op == GGML_OP_MUL_MAT_ID) && op->src[0] &&
            std::regex_search(ggml_get_name(op->src[0]), pattern);
    }
};
