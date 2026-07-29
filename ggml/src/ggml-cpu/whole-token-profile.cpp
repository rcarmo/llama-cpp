#include "whole-token-profile.h"

#include "ggml.h"

#include <array>
#include <atomic>
#include <cinttypes>
#include <cstdio>
#include <cstdlib>
#include <cstring>

namespace {

struct op_counters {
    std::atomic<uint64_t> calls       {0};
    std::atomic<uint64_t> wall_us     {0};
    std::atomic<uint64_t> active_us   {0};
    std::atomic<uint64_t> capacity_us {0};
    std::atomic<uint64_t> read_bytes  {0};
    std::atomic<uint64_t> write_bytes {0};
};

std::array<op_counters, GGML_OP_COUNT> counters;
std::atomic<uint64_t> graph_calls {0};
std::atomic<uint64_t> graph_us    {0};

const char * family(enum ggml_op op) {
    switch (op) {
        case GGML_OP_MUL_MAT:
        case GGML_OP_MUL_MAT_ID:
        case GGML_OP_OUT_PROD:
            return "matrix";
        case GGML_OP_FLASH_ATTN_EXT:
        case GGML_OP_FLASH_ATTN_BACK:
        case GGML_OP_SOFT_MAX:
        case GGML_OP_SOFT_MAX_BACK:
        case GGML_OP_ROPE:
        case GGML_OP_ROPE_BACK:
            return "attention";
        case GGML_OP_SSM_CONV:
        case GGML_OP_SSM_SCAN:
        case GGML_OP_RWKV_WKV6:
        case GGML_OP_RWKV_WKV7:
        case GGML_OP_GATED_LINEAR_ATTN:
        case GGML_OP_GATED_DELTA_NET:
        case GGML_OP_LIGHTNING_INDEXER:
            return "recurrent";
        case GGML_OP_DUP:
        case GGML_OP_CPY:
        case GGML_OP_CONT:
        case GGML_OP_SET:
        case GGML_OP_SET_ROWS:
        case GGML_OP_ACC:
            return "copy";
        default:
            return "other";
    }
}

bool enabled_impl() {
    const char * value = std::getenv("GGML_CPU_WHOLE_TOKEN_PROFILE");
    return value != nullptr && value[0] != '\0' && value[0] != '0';
}

void dump() {
    struct family_counters {
        const char * name;
        uint64_t calls = 0, wall = 0, active = 0, capacity = 0, read = 0, write = 0;
    };
    std::array<family_counters, 5> families {{{"matrix"}, {"attention"}, {"recurrent"}, {"copy"}, {"other"}}};
    uint64_t total_wall = 0, total_active = 0, total_capacity = 0, total_read = 0, total_write = 0;

    for (int i = 0; i < GGML_OP_COUNT; ++i) {
        const auto & c = counters[i];
        const uint64_t calls = c.calls.load(std::memory_order_relaxed);
        if (calls == 0) continue;
        const uint64_t wall = c.wall_us.load(std::memory_order_relaxed);
        const uint64_t active = c.active_us.load(std::memory_order_relaxed);
        const uint64_t capacity = c.capacity_us.load(std::memory_order_relaxed);
        const uint64_t read = c.read_bytes.load(std::memory_order_relaxed);
        const uint64_t write = c.write_bytes.load(std::memory_order_relaxed);
        total_wall += wall; total_active += active; total_capacity += capacity; total_read += read; total_write += write;
        const char * family_name = family(static_cast<enum ggml_op>(i));
        for (auto & f : families) if (std::strcmp(f.name, family_name) == 0) {
            f.calls += calls; f.wall += wall; f.active += active; f.capacity += capacity; f.read += read; f.write += write;
        }
        std::fprintf(stderr,
            "GGML_CPU_WHOLE_TOKEN_PROFILE kind=op name=%s family=%s calls=%" PRIu64
            " wall_us=%" PRIu64 " active_thread_us=%" PRIu64 " capacity_us=%" PRIu64
            " logical_read_bytes=%" PRIu64 " logical_write_bytes=%" PRIu64 "\n",
            ggml_op_name(static_cast<enum ggml_op>(i)), family_name, calls, wall, active, capacity, read, write);
    }
    for (const auto & f : families) if (f.calls != 0) {
        const uint64_t idle = f.capacity > f.active ? f.capacity - f.active : 0;
        std::fprintf(stderr,
            "GGML_CPU_WHOLE_TOKEN_PROFILE kind=family name=%s calls=%" PRIu64
            " wall_us=%" PRIu64 " active_thread_us=%" PRIu64 " capacity_us=%" PRIu64
            " idle_or_sync_us=%" PRIu64 " logical_read_bytes=%" PRIu64 " logical_write_bytes=%" PRIu64 "\n",
            f.name, f.calls, f.wall, f.active, f.capacity, idle, f.read, f.write);
    }
    const uint64_t idle = total_capacity > total_active ? total_capacity - total_active : 0;
    std::fprintf(stderr,
        "GGML_CPU_WHOLE_TOKEN_PROFILE kind=total graphs=%" PRIu64 " graph_us=%" PRIu64
        " node_wall_us=%" PRIu64 " active_thread_us=%" PRIu64 " capacity_us=%" PRIu64
        " idle_or_sync_us=%" PRIu64 " logical_read_bytes=%" PRIu64 " logical_write_bytes=%" PRIu64 "\n",
        graph_calls.load(std::memory_order_relaxed), graph_us.load(std::memory_order_relaxed), total_wall,
        total_active, total_capacity, idle, total_read, total_write);
}

bool enabled() {
    static const bool value = [] { const bool on = enabled_impl(); if (on) std::atexit(dump); return on; }();
    return value;
}

} // namespace

extern "C" bool ggml_cpu_whole_token_profile_enabled(void) { return enabled(); }
extern "C" int64_t ggml_cpu_whole_token_profile_time_us(void) { return ggml_time_us(); }
extern "C" void ggml_cpu_whole_token_profile_graph_begin(void) { graph_calls.fetch_add(1, std::memory_order_relaxed); }
extern "C" void ggml_cpu_whole_token_profile_graph_end(int64_t start_us) { graph_us.fetch_add(ggml_time_us() - start_us, std::memory_order_relaxed); }
extern "C" void ggml_cpu_whole_token_profile_node_active(enum ggml_op op, int64_t active_us) {
    if (op >= 0 && op < GGML_OP_COUNT) counters[op].active_us.fetch_add(active_us, std::memory_order_relaxed);
}
extern "C" void ggml_cpu_whole_token_profile_node_wall(const struct ggml_tensor * node, int n_threads, int64_t wall_us) {
    if (node == nullptr || node->op < 0 || node->op >= GGML_OP_COUNT) return;
    auto & c = counters[node->op];
    uint64_t read_bytes = 0;
    for (int i = 0; i < GGML_MAX_SRC; ++i) if (node->src[i] != nullptr) read_bytes += ggml_nbytes(node->src[i]);
    c.calls.fetch_add(1, std::memory_order_relaxed);
    c.wall_us.fetch_add(wall_us, std::memory_order_relaxed);
    c.capacity_us.fetch_add(wall_us * static_cast<int64_t>(n_threads), std::memory_order_relaxed);
    c.read_bytes.fetch_add(read_bytes, std::memory_order_relaxed);
    c.write_bytes.fetch_add(ggml_nbytes(node), std::memory_order_relaxed);
}
