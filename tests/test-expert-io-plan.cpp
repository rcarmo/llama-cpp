#include "expert-io-plan.h"

#include <cassert>
#include <cstdint>
#include <limits>
#include <vector>

static void test_three_ranges_and_dedup() {
    const std::vector<ggml_expert_tensor_span> spans = {
        {1000, 100, 4}, {2000, 200, 4}, {4000, 300, 4},
    };
    auto plan = ggml_expert_io_plan_ranges({2, 1, 2, -1, 9}, spans, {});
    assert(plan.error.empty());
    assert(plan.input_selections == 5);
    assert(plan.unique_experts == 2);
    assert(plan.duplicate_experts == 1);
    assert(plan.invalid_experts == 2);
    assert(plan.ranges.size() == 3);
    assert(plan.planned_bytes == 1200);
    assert(plan.ranges[0].offset == 1100 && plan.ranges[0].length == 200); // adjacent expert 1/2 slices coalesce
}

static void test_overlap_and_gap_coalescing() {
    const std::vector<ggml_expert_tensor_span> spans = {
        {100, 10, 2}, {121, 10, 2},
    };
    ggml_expert_io_plan_limits limits;
    limits.coalesce_gap = 1;
    auto plan = ggml_expert_io_plan_ranges({0, 1}, spans, limits);
    assert(plan.error.empty());
    assert(plan.ranges.size() == 1);
    assert(plan.ranges[0].offset == 100);
    assert(plan.ranges[0].length == 41);
}

static void test_limits() {
    const std::vector<ggml_expert_tensor_span> spans = {
        {100, 100, 4}, {1000, 100, 4}, {2000, 100, 4},
    };
    ggml_expert_io_plan_limits limits;
    limits.max_ranges = 2;
    limits.max_bytes = 200;
    auto plan = ggml_expert_io_plan_ranges({0, 2}, spans, limits);
    assert(plan.error.empty());
    assert(plan.truncated);
    assert(plan.ranges.size() == 2);
    assert(plan.planned_bytes == 200);
    assert(plan.skipped_ranges == 4);
    assert(plan.skipped_bytes == 400);
}

static void test_invalid_layout_and_overflow() {
    auto mismatched = ggml_expert_io_plan_ranges({0}, {{0, 10, 2}, {20, 10, 3}}, {});
    assert(!mismatched.error.empty());

    auto overflow = ggml_expert_io_plan_ranges(
        {1}, {{std::numeric_limits<uint64_t>::max() - 4, 8, 2}}, {});
    assert(!overflow.error.empty());
}

int main() {
    test_three_ranges_and_dedup();
    test_overlap_and_gap_coalescing();
    test_limits();
    test_invalid_layout_and_overflow();
    return 0;
}
