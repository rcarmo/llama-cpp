#include "whole-token-profile.h"

#include "ggml.h"
#include "ggml-cpu.h"

#include <array>
#include <atomic>
#include <cinttypes>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <limits>
#include <mutex>
#include <unordered_set>
#include <vector>

#if defined(__linux__) || defined(__APPLE__)
#include <sys/mman.h>
#include <unistd.h>
#endif

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

struct expert_io_counters {
    std::atomic<uint64_t> nodes          {0};
    std::atomic<uint64_t> selections     {0};
    std::atomic<uint64_t> unique         {0};
    std::atomic<uint64_t> duplicates     {0};
    std::atomic<uint64_t> repeated       {0};
    std::atomic<uint64_t> invalid_ids    {0};
    std::atomic<uint64_t> range_count    {0};
    std::atomic<uint64_t> range_bytes    {0};
    std::atomic<uint64_t> resident_pages {0};
    std::atomic<uint64_t> sampled_pages  {0};
};

expert_io_counters expert_io;
std::mutex expert_seen_mutex;
std::unordered_set<uint64_t> expert_seen;

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

bool env_enabled(const char * name) {
    const char * value = std::getenv(name);
    return value != nullptr && value[0] != '\0' && value[0] != '0';
}

bool expert_io_enabled_impl() {
    return env_enabled("GGML_CPU_EXPERT_IO_PROFILE");
}

bool enabled_impl() {
    return env_enabled("GGML_CPU_WHOLE_TOKEN_PROFILE") || expert_io_enabled_impl();
}

uint64_t expert_io_sample_pages() {
    static const uint64_t value = [] {
        const char * raw = std::getenv("GGML_CPU_EXPERT_IO_SAMPLE_PAGES");
        if (raw == nullptr || raw[0] == '\0') return uint64_t(16);
        char * end = nullptr;
        const unsigned long long parsed = std::strtoull(raw, &end, 10);
        return end != raw ? uint64_t(parsed) : uint64_t(16);
    }();
    return value;
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
    if (expert_io_enabled_impl()) {
        std::fprintf(stderr,
            "GGML_CPU_EXPERT_IO_PROFILE nodes=%" PRIu64 " selections=%" PRIu64
            " unique=%" PRIu64 " duplicates=%" PRIu64 " repeated=%" PRIu64 " invalid_ids=%" PRIu64
            " ranges=%" PRIu64 " range_bytes=%" PRIu64 " resident_pages=%" PRIu64
            " sampled_pages=%" PRIu64 "\n",
            expert_io.nodes.load(std::memory_order_relaxed),
            expert_io.selections.load(std::memory_order_relaxed),
            expert_io.unique.load(std::memory_order_relaxed),
            expert_io.duplicates.load(std::memory_order_relaxed),
            expert_io.repeated.load(std::memory_order_relaxed),
            expert_io.invalid_ids.load(std::memory_order_relaxed),
            expert_io.range_count.load(std::memory_order_relaxed),
            expert_io.range_bytes.load(std::memory_order_relaxed),
            expert_io.resident_pages.load(std::memory_order_relaxed),
            expert_io.sampled_pages.load(std::memory_order_relaxed));
    }
}

bool enabled() {
    static const bool value = [] { const bool on = enabled_impl(); if (on) std::atexit(dump); return on; }();
    return value;
}

bool expert_io_enabled() {
    static const bool value = expert_io_enabled_impl();
    return value;
}

} // namespace

extern "C" bool ggml_cpu_whole_token_profile_enabled(void) { return enabled(); }
extern "C" bool ggml_cpu_expert_io_profile_enabled(void) { return expert_io_enabled(); }
extern "C" int64_t ggml_cpu_whole_token_profile_time_us(void) { return ggml_time_us(); }
extern "C" void ggml_cpu_whole_token_profile_graph_begin(void) { graph_calls.fetch_add(1, std::memory_order_relaxed); }
extern "C" void ggml_cpu_whole_token_profile_graph_end(int64_t start_us) { graph_us.fetch_add(ggml_time_us() - start_us, std::memory_order_relaxed); }
extern "C" void ggml_cpu_whole_token_profile_node_active(enum ggml_op op, int64_t active_us) {
    if (op >= 0 && op < GGML_OP_COUNT) counters[op].active_us.fetch_add(active_us, std::memory_order_relaxed);
}
extern "C" void ggml_cpu_expert_io_profile_observe(const struct ggml_tensor * node) {
    if (!expert_io_enabled() || node == nullptr || node->op != GGML_OP_MUL_MAT_ID) return;
    const ggml_tensor * weights = node->src[0];
    const ggml_tensor * ids = node->src[2];
    if (weights == nullptr || ids == nullptr || ids->type != GGML_TYPE_I32 || ids->data == nullptr ||
            !ggml_is_contiguous(ids) || weights->ne[2] <= 0 || weights->nb[2] == 0) return;

    const int64_t n_expert = weights->ne[2];
    const int64_t n_ids = ggml_nelements(ids);
    std::vector<uint8_t> seen(static_cast<size_t>(n_expert), 0);
    uint64_t unique = 0, invalid = 0;
    for (int64_t i = 0; i < n_ids; ++i) {
        const int32_t id = ggml_get_i32_1d(ids, static_cast<int>(i));
        if (id < 0 || id >= n_expert) {
            ++invalid;
        } else if (!seen[static_cast<size_t>(id)]) {
            seen[static_cast<size_t>(id)] = 1;
            ++unique;
        }
    }

    uint64_t repeated = 0;
    {
        std::lock_guard<std::mutex> lock(expert_seen_mutex);
        for (int64_t id = 0; id < n_expert; ++id) {
            if (!seen[static_cast<size_t>(id)]) continue;
            const uint64_t tensor_key = static_cast<uint64_t>(reinterpret_cast<uintptr_t>(weights)) >> 4;
            const uint64_t key = tensor_key ^ (static_cast<uint64_t>(id) * 0x9e3779b97f4a7c15ULL);
            if (!expert_seen.insert(key).second) ++repeated;
        }
    }

    const uint64_t expert_bytes = weights->nb[2];
    const uint64_t max_u64 = std::numeric_limits<uint64_t>::max();
    const uint64_t bytes = unique != 0 && expert_bytes > max_u64 / unique ? max_u64 : unique * expert_bytes;
    expert_io.nodes.fetch_add(1, std::memory_order_relaxed);
    expert_io.selections.fetch_add(static_cast<uint64_t>(n_ids), std::memory_order_relaxed);
    expert_io.unique.fetch_add(unique, std::memory_order_relaxed);
    expert_io.duplicates.fetch_add(static_cast<uint64_t>(n_ids) - unique - invalid, std::memory_order_relaxed);
    expert_io.repeated.fetch_add(repeated, std::memory_order_relaxed);
    expert_io.invalid_ids.fetch_add(invalid, std::memory_order_relaxed);
    expert_io.range_count.fetch_add(unique, std::memory_order_relaxed);
    expert_io.range_bytes.fetch_add(bytes, std::memory_order_relaxed);

#if defined(__linux__) || defined(__APPLE__)
    if (weights->data != nullptr && expert_io_sample_pages() != 0) {
        const long page_size_raw = sysconf(_SC_PAGESIZE);
        if (page_size_raw > 0) {
            const uintptr_t page_size = static_cast<uintptr_t>(page_size_raw);
            uint64_t sampled = 0, resident = 0;
            for (int64_t id = 0; id < n_expert && sampled < expert_io_sample_pages(); ++id) {
                if (!seen[static_cast<size_t>(id)]) continue;
                const uintptr_t address = reinterpret_cast<uintptr_t>(weights->data) + static_cast<uint64_t>(id) * expert_bytes;
                void * page = reinterpret_cast<void *>(address & ~(page_size - 1));
                unsigned char state = 0;
                if (mincore(page, page_size, &state) == 0) {
                    ++sampled;
                    resident += (state & 1U) != 0;
                }
            }
            expert_io.sampled_pages.fetch_add(sampled, std::memory_order_relaxed);
            expert_io.resident_pages.fetch_add(resident, std::memory_order_relaxed);
        }
    }
#endif
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
