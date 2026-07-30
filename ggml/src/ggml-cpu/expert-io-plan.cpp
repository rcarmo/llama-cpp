#include "expert-io-plan.h"

#include <algorithm>
#include <limits>
#include <unordered_set>

namespace {

bool add_overflow(uint64_t a, uint64_t b, uint64_t & out) {
    if (b > std::numeric_limits<uint64_t>::max() - a) return true;
    out = a + b;
    return false;
}

bool mul_overflow(uint64_t a, uint64_t b, uint64_t & out) {
    if (a != 0 && b > std::numeric_limits<uint64_t>::max() / a) return true;
    out = a * b;
    return false;
}

} // namespace

ggml_expert_io_plan ggml_expert_io_plan_ranges(
        const std::vector<int32_t> & selected_experts,
        const std::vector<ggml_expert_tensor_span> & tensors,
        const ggml_expert_io_plan_limits & limits) {
    ggml_expert_io_plan result;
    result.input_selections = selected_experts.size();
    if (tensors.empty()) return result;

    uint32_t expert_count = tensors.front().expert_count;
    if (expert_count == 0) {
        result.error = "expert count is zero";
        return result;
    }
    for (const auto & tensor : tensors) {
        if (tensor.expert_count != expert_count || tensor.expert_bytes == 0) {
            result.error = "invalid or mismatched tensor span";
            return result;
        }
        uint64_t tensor_bytes = 0, tensor_end = 0;
        if (mul_overflow(tensor.expert_bytes, tensor.expert_count, tensor_bytes) ||
                add_overflow(tensor.offset, tensor_bytes, tensor_end)) {
            result.error = "tensor span overflow";
            return result;
        }
    }

    std::unordered_set<int32_t> seen;
    std::vector<int32_t> experts;
    experts.reserve(selected_experts.size());
    for (int32_t expert : selected_experts) {
        if (expert < 0 || static_cast<uint32_t>(expert) >= expert_count) {
            ++result.invalid_experts;
        } else if (seen.insert(expert).second) {
            experts.push_back(expert);
        } else {
            ++result.duplicate_experts;
        }
    }
    result.unique_experts = experts.size();

    std::vector<ggml_expert_io_range> raw;
    raw.reserve(experts.size() * tensors.size());
    for (int32_t expert : experts) {
        for (const auto & tensor : tensors) {
            uint64_t delta = 0, offset = 0, end = 0;
            if (mul_overflow(static_cast<uint64_t>(expert), tensor.expert_bytes, delta) ||
                    add_overflow(tensor.offset, delta, offset) ||
                    add_overflow(offset, tensor.expert_bytes, end)) {
                result.error = "expert range overflow";
                return result;
            }
            raw.push_back({offset, tensor.expert_bytes});
        }
    }
    std::sort(raw.begin(), raw.end(), [](const auto & a, const auto & b) {
        return a.offset == b.offset ? a.length < b.length : a.offset < b.offset;
    });

    std::vector<ggml_expert_io_range> coalesced;
    for (const auto & range : raw) {
        uint64_t range_end = 0;
        if (add_overflow(range.offset, range.length, range_end)) {
            result.error = "range overflow";
            return result;
        }
        if (!coalesced.empty()) {
            auto & last = coalesced.back();
            uint64_t last_end = 0, allowed_end = 0;
            if (add_overflow(last.offset, last.length, last_end)) {
                result.error = "coalesced range overflow";
                return result;
            }
            allowed_end = last_end;
            if (limits.coalesce_gap > std::numeric_limits<uint64_t>::max() - allowed_end) {
                allowed_end = std::numeric_limits<uint64_t>::max();
            } else {
                allowed_end += limits.coalesce_gap;
            }
            if (range.offset <= allowed_end) {
                const uint64_t merged_end = std::max(last_end, range_end);
                last.length = merged_end - last.offset;
                continue;
            }
        }
        coalesced.push_back(range);
    }

    for (const auto & range : coalesced) {
        const bool range_limited = limits.max_ranges != 0 && result.ranges.size() >= limits.max_ranges;
        const bool byte_limited = limits.max_bytes != 0 &&
            (range.length > limits.max_bytes - std::min(result.planned_bytes, limits.max_bytes));
        if (range_limited || byte_limited) {
            result.truncated = true;
            ++result.skipped_ranges;
            result.skipped_bytes += range.length;
            continue;
        }
        result.ranges.push_back(range);
        result.planned_bytes += range.length;
    }
    return result;
}
