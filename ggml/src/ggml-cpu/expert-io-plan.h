#pragma once

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

struct ggml_expert_tensor_span {
    uint64_t offset       = 0;
    uint64_t expert_bytes = 0;
    uint32_t expert_count = 0;
};

struct ggml_expert_io_range {
    uint64_t offset = 0;
    uint64_t length = 0;
};

struct ggml_expert_io_plan_limits {
    uint64_t max_bytes       = 0; // 0 means unlimited
    size_t   max_ranges      = 0; // 0 means unlimited
    uint64_t coalesce_gap    = 0;
};

struct ggml_expert_io_plan {
    std::vector<ggml_expert_io_range> ranges;
    uint64_t input_selections = 0;
    uint64_t unique_experts   = 0;
    uint64_t duplicate_experts = 0;
    uint64_t invalid_experts  = 0;
    uint64_t planned_bytes    = 0;
    uint64_t skipped_bytes    = 0;
    uint64_t skipped_ranges   = 0;
    bool truncated            = false;
    std::string error;
};

ggml_expert_io_plan ggml_expert_io_plan_ranges(
        const std::vector<int32_t> & selected_experts,
        const std::vector<ggml_expert_tensor_span> & tensors,
        const ggml_expert_io_plan_limits & limits);
