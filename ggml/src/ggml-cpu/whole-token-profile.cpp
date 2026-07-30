#include "whole-token-profile.h"

#include "ggml.h"
#include "ggml-cpu.h"
#include "expert-io-plan.h"

#include <algorithm>
#include <array>
#include <atomic>
#include <cerrno>
#include <cinttypes>
#include <condition_variable>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <deque>
#include <limits>
#include <mutex>
#include <thread>
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
    std::atomic<uint64_t> advice_calls   {0};
    std::atomic<uint64_t> advice_bytes   {0};
    std::atomic<uint64_t> advice_failures{0};
    std::atomic<uint64_t> advice_skips   {0};
    std::atomic<uint64_t> advice_us      {0};
    std::atomic<uint64_t> advice_slow    {0};
    std::atomic<uint64_t> advice_disabled{0};
    std::atomic<uint64_t> resident_skips {0};
};

expert_io_counters expert_io;
std::mutex expert_seen_mutex;
std::unordered_set<uint64_t> expert_seen;
std::atomic<uint64_t> graph_advice_bytes_left {0};
std::atomic<uint64_t> graph_advice_ranges_left {0};
std::atomic<uint64_t> graph_advice_us_left {0};
std::atomic<bool> advice_circuit_open {false};
std::atomic<uint64_t> advice_slow_streak {0};

enum class expert_advice_mode { off, bounded, adaptive };

uint64_t env_u64(const char * name, uint64_t fallback);
expert_advice_mode advice_mode();
uint64_t reserve_up_to(std::atomic<uint64_t> & remaining, uint64_t requested);

#if defined(__linux__) || defined(__APPLE__)
struct expert_advice_range {
    void * address = nullptr;
    size_t length = 0;
    uint64_t bytes = 0;
};

class expert_advice_worker {
public:
    expert_advice_worker() : worker_([this] { run(); }) {}
    ~expert_advice_worker() {
        {
            std::lock_guard<std::mutex> lock(mutex_);
            stopping_ = true;
        }
        ready_.notify_all();
        worker_.join();
    }

    bool submit(std::vector<expert_advice_range> ranges, size_t max_depth) {
        std::lock_guard<std::mutex> lock(mutex_);
        if (stopping_ || queue_.size() >= max_depth) return false;
        queue_.push_back(std::move(ranges));
        ready_.notify_one();
        return true;
    }

    void drain() {
        std::unique_lock<std::mutex> lock(mutex_);
        drained_.wait(lock, [this] { return queue_.empty() && !active_; });
    }

private:
    void run() {
        for (;;) {
            std::vector<expert_advice_range> ranges;
            {
                std::unique_lock<std::mutex> lock(mutex_);
                ready_.wait(lock, [this] { return stopping_ || !queue_.empty(); });
                if (stopping_ && queue_.empty()) break;
                ranges = std::move(queue_.front());
                queue_.pop_front();
                active_ = true;
            }
            const int64_t started = ggml_time_us();
            uint64_t calls = 0, bytes = 0, failures = 0;
            for (const auto & range : ranges) {
                ++calls;
                bytes += range.bytes;
                if (madvise(range.address, range.length, MADV_WILLNEED) != 0) ++failures;
            }
            const uint64_t elapsed = static_cast<uint64_t>(ggml_time_us() - started);
            const uint64_t granted_us = reserve_up_to(graph_advice_us_left, elapsed);
            const uint64_t slow_us = env_u64("GGML_CPU_EXPERT_IO_ADVISE_SLOW_US", 500);
            if (elapsed > slow_us) {
                expert_io.advice_slow.fetch_add(1, std::memory_order_relaxed);
                const uint64_t streak = advice_slow_streak.fetch_add(1, std::memory_order_relaxed) + 1;
                if (advice_mode() == expert_advice_mode::adaptive &&
                        streak >= env_u64("GGML_CPU_EXPERT_IO_ADVISE_MAX_SLOW", 3)) {
                    advice_circuit_open.store(true, std::memory_order_relaxed);
                }
            } else {
                advice_slow_streak.store(0, std::memory_order_relaxed);
            }
            if (failures != 0) advice_circuit_open.store(true, std::memory_order_relaxed);
            if (elapsed > granted_us) expert_io.advice_disabled.fetch_add(1, std::memory_order_relaxed);
            expert_io.advice_calls.fetch_add(calls, std::memory_order_relaxed);
            expert_io.advice_bytes.fetch_add(bytes, std::memory_order_relaxed);
            expert_io.advice_failures.fetch_add(failures, std::memory_order_relaxed);
            expert_io.advice_us.fetch_add(elapsed, std::memory_order_relaxed);
            {
                std::lock_guard<std::mutex> lock(mutex_);
                active_ = false;
            }
            drained_.notify_all();
        }
    }

    std::mutex mutex_;
    std::condition_variable ready_;
    std::condition_variable drained_;
    std::deque<std::vector<expert_advice_range>> queue_;
    bool active_ = false;
    bool stopping_ = false;
    std::thread worker_;
};

expert_advice_worker & advice_worker() {
    static expert_advice_worker worker;
    return worker;
}
#endif

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

expert_advice_mode advice_mode() {
    static const expert_advice_mode value = [] {
        const char * raw = std::getenv("GGML_CPU_EXPERT_IO_ADVISE_MODE");
        if (raw != nullptr) {
            if (std::strcmp(raw, "adaptive") == 0) return expert_advice_mode::adaptive;
            if (std::strcmp(raw, "bounded") == 0) return expert_advice_mode::bounded;
            return expert_advice_mode::off;
        }
        return env_enabled("GGML_CPU_EXPERT_IO_ADVISE") ? expert_advice_mode::bounded : expert_advice_mode::off;
    }();
    return value;
}

bool expert_advice_enabled_impl() {
    return advice_mode() != expert_advice_mode::off;
}

bool enabled_impl() {
    return env_enabled("GGML_CPU_WHOLE_TOKEN_PROFILE");
}

uint64_t env_u64(const char * name, uint64_t fallback) {
    const char * raw = std::getenv(name);
    if (raw == nullptr || raw[0] == '\0') return fallback;
    char * end = nullptr;
    errno = 0;
    const unsigned long long parsed = std::strtoull(raw, &end, 10);
    return end != raw && errno != ERANGE ? uint64_t(parsed) : fallback;
}

uint64_t reserve_up_to(std::atomic<uint64_t> & remaining, uint64_t requested) {
    uint64_t current = remaining.load(std::memory_order_relaxed);
    while (current != 0) {
        const uint64_t granted = std::min(current, requested);
        if (remaining.compare_exchange_weak(current, current - granted, std::memory_order_relaxed)) return granted;
    }
    return 0;
}

uint64_t expert_io_sample_pages() {
    static const uint64_t value = [] {
        return env_u64("GGML_CPU_EXPERT_IO_SAMPLE_PAGES", 16);
    }();
    return value;
}

#if defined(__linux__) || defined(__APPLE__)
bool page_is_resident(const void * address, uintptr_t page_size, bool & known) {
    const uintptr_t raw = reinterpret_cast<uintptr_t>(address);
    void * page = reinterpret_cast<void *>(raw & ~(page_size - 1));
#if defined(__APPLE__)
    char state = 0;
#else
    unsigned char state = 0;
#endif
    known = mincore(page, page_size, &state) == 0;
    return known && (static_cast<unsigned char>(state) & 1U) != 0;
}
#endif

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
    if (expert_io_enabled_impl() || expert_advice_enabled_impl()) {
        std::fprintf(stderr,
            "GGML_CPU_EXPERT_IO_PROFILE nodes=%" PRIu64 " selections=%" PRIu64
            " unique=%" PRIu64 " duplicates=%" PRIu64 " repeated=%" PRIu64 " invalid_ids=%" PRIu64
            " ranges=%" PRIu64 " range_bytes=%" PRIu64 " resident_pages=%" PRIu64
            " sampled_pages=%" PRIu64 " advice_calls=%" PRIu64
            " advice_bytes=%" PRIu64 " advice_failures=%" PRIu64
            " advice_skips=%" PRIu64 " advice_us=%" PRIu64
            " advice_slow=%" PRIu64 " advice_disabled=%" PRIu64
            " resident_skips=%" PRIu64 "\n",
            expert_io.nodes.load(std::memory_order_relaxed),
            expert_io.selections.load(std::memory_order_relaxed),
            expert_io.unique.load(std::memory_order_relaxed),
            expert_io.duplicates.load(std::memory_order_relaxed),
            expert_io.repeated.load(std::memory_order_relaxed),
            expert_io.invalid_ids.load(std::memory_order_relaxed),
            expert_io.range_count.load(std::memory_order_relaxed),
            expert_io.range_bytes.load(std::memory_order_relaxed),
            expert_io.resident_pages.load(std::memory_order_relaxed),
            expert_io.sampled_pages.load(std::memory_order_relaxed),
            expert_io.advice_calls.load(std::memory_order_relaxed),
            expert_io.advice_bytes.load(std::memory_order_relaxed),
            expert_io.advice_failures.load(std::memory_order_relaxed),
            expert_io.advice_skips.load(std::memory_order_relaxed),
            expert_io.advice_us.load(std::memory_order_relaxed),
            expert_io.advice_slow.load(std::memory_order_relaxed),
            expert_io.advice_disabled.load(std::memory_order_relaxed),
            expert_io.resident_skips.load(std::memory_order_relaxed));
    }
}

void register_dump() {
    static const bool registered = [] { std::atexit(dump); return true; }();
    (void) registered;
}

bool enabled() {
    static const bool value = [] { const bool on = enabled_impl(); if (on) register_dump(); return on; }();
    return value;
}

bool expert_io_enabled() {
    static const bool value = expert_io_enabled_impl();
    return value;
}

bool expert_advice_enabled() {
    static const bool value = expert_advice_enabled_impl();
    return value;
}

} // namespace

extern "C" bool ggml_cpu_whole_token_profile_enabled(void) { return enabled(); }
extern "C" bool ggml_cpu_expert_io_active(void) {
    const bool active = expert_io_enabled() || expert_advice_enabled();
    if (active) register_dump();
    return active;
}
extern "C" void ggml_cpu_get_expert_io_metrics(struct ggml_cpu_expert_io_metrics * metrics) {
    if (metrics == nullptr) return;
    *metrics = {
        expert_io.nodes.load(std::memory_order_relaxed),
        expert_io.selections.load(std::memory_order_relaxed),
        expert_io.unique.load(std::memory_order_relaxed),
        expert_io.duplicates.load(std::memory_order_relaxed),
        expert_io.repeated.load(std::memory_order_relaxed),
        expert_io.invalid_ids.load(std::memory_order_relaxed),
        expert_io.range_count.load(std::memory_order_relaxed),
        expert_io.range_bytes.load(std::memory_order_relaxed),
        expert_io.resident_pages.load(std::memory_order_relaxed),
        expert_io.sampled_pages.load(std::memory_order_relaxed),
        expert_io.advice_calls.load(std::memory_order_relaxed),
        expert_io.advice_bytes.load(std::memory_order_relaxed),
        expert_io.advice_failures.load(std::memory_order_relaxed),
        expert_io.advice_skips.load(std::memory_order_relaxed),
        expert_io.advice_us.load(std::memory_order_relaxed),
        expert_io.advice_slow.load(std::memory_order_relaxed),
        expert_io.advice_disabled.load(std::memory_order_relaxed),
        expert_io.resident_skips.load(std::memory_order_relaxed),
    };
}
extern "C" bool ggml_cpu_expert_io_profile_enabled(void) { return expert_io_enabled(); }
extern "C" int64_t ggml_cpu_whole_token_profile_time_us(void) { return ggml_time_us(); }
extern "C" void ggml_cpu_whole_token_profile_graph_begin(void) {
    graph_calls.fetch_add(1, std::memory_order_relaxed);
}
extern "C" void ggml_cpu_expert_io_graph_begin(void) {
    if (expert_advice_enabled()) {
        graph_advice_bytes_left.store(env_u64("GGML_CPU_EXPERT_IO_ADVISE_GRAPH_BYTES", 64ULL * 1024ULL * 1024ULL), std::memory_order_relaxed);
        graph_advice_ranges_left.store(env_u64("GGML_CPU_EXPERT_IO_ADVISE_GRAPH_RANGES", 128), std::memory_order_relaxed);
        graph_advice_us_left.store(env_u64("GGML_CPU_EXPERT_IO_ADVISE_GRAPH_US", 2000), std::memory_order_relaxed);
    }
}
extern "C" void ggml_cpu_expert_io_graph_end(void) {
#if defined(__linux__) || defined(__APPLE__)
    if (expert_advice_enabled()) advice_worker().drain();
#endif
}
extern "C" void ggml_cpu_whole_token_profile_graph_end(int64_t start_us) {
    graph_us.fetch_add(ggml_time_us() - start_us, std::memory_order_relaxed);
}
extern "C" void ggml_cpu_whole_token_profile_node_active(enum ggml_op op, int64_t active_us) {
    if (op >= 0 && op < GGML_OP_COUNT) counters[op].active_us.fetch_add(active_us, std::memory_order_relaxed);
}
static void expert_io_process(const struct ggml_tensor * node, bool count_stats, bool do_advice) {
    const bool profile = count_stats && expert_io_enabled();
    const bool advise = do_advice && expert_advice_enabled();
    if ((!profile && !advise) || node == nullptr || node->op != GGML_OP_MUL_MAT_ID) return;
    const ggml_tensor * weights = node->src[0];
    const ggml_tensor * ids = node->src[2];
    if (weights == nullptr || ids == nullptr || ids->type != GGML_TYPE_I32 || ids->data == nullptr ||
            !ggml_is_contiguous(ids) || !ggml_is_contiguous(weights) || weights->ne[2] <= 0 || weights->nb[2] == 0) return;

    const int64_t n_expert = weights->ne[2];
    const int64_t n_ids = ggml_nelements(ids);
    if (n_expert > std::numeric_limits<uint32_t>::max() || n_ids < 0 || n_ids > std::numeric_limits<int>::max()) return;
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
    if (count_stats) {
        std::lock_guard<std::mutex> lock(expert_seen_mutex);
        const uint64_t max_seen = env_u64("GGML_CPU_EXPERT_IO_MAX_SEEN", 65536);
        if (max_seen != 0 && expert_seen.size() >= max_seen) expert_seen.clear();
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
    if (count_stats) {
        expert_io.nodes.fetch_add(1, std::memory_order_relaxed);
        expert_io.selections.fetch_add(static_cast<uint64_t>(n_ids), std::memory_order_relaxed);
        expert_io.unique.fetch_add(unique, std::memory_order_relaxed);
        expert_io.duplicates.fetch_add(static_cast<uint64_t>(n_ids) - unique - invalid, std::memory_order_relaxed);
        expert_io.repeated.fetch_add(repeated, std::memory_order_relaxed);
        expert_io.invalid_ids.fetch_add(invalid, std::memory_order_relaxed);
        expert_io.range_count.fetch_add(unique, std::memory_order_relaxed);
        expert_io.range_bytes.fetch_add(bytes, std::memory_order_relaxed);
    }

#if defined(__linux__) || defined(__APPLE__)
    if (advise && weights->data != nullptr) {
        if (advice_circuit_open.load(std::memory_order_relaxed) ||
                graph_advice_bytes_left.load(std::memory_order_relaxed) == 0 ||
                graph_advice_ranges_left.load(std::memory_order_relaxed) == 0 ||
                graph_advice_us_left.load(std::memory_order_relaxed) == 0) {
            expert_io.advice_disabled.fetch_add(1, std::memory_order_relaxed);
        } else {
            const long page_size_raw = sysconf(_SC_PAGESIZE);
            if (page_size_raw > 0) {
                const uintptr_t page_size = static_cast<uintptr_t>(page_size_raw);
                std::vector<int32_t> selected;
                selected.reserve(static_cast<size_t>(n_ids));
                const bool include_resident = env_enabled("GGML_CPU_EXPERT_IO_ADVISE_RESIDENT");
                uint64_t resident_skips = 0;
                uint64_t residency_known = 0;
                for (int64_t i = 0; i < n_ids; ++i) {
                    const int32_t id = ggml_get_i32_1d(ids, static_cast<int>(i));
                    if (id < 0 || id >= n_expert) {
                        selected.push_back(id);
                        continue;
                    }
                    const void * address = static_cast<const uint8_t *>(weights->data) + static_cast<uint64_t>(id) * expert_bytes;
                    bool known = false;
                    const bool resident = page_is_resident(address, page_size, known);
                    residency_known += known;
                    if (!include_resident && resident && known) {
                        ++resident_skips;
                    } else {
                        selected.push_back(id);
                    }
                }
                expert_io.resident_skips.fetch_add(resident_skips, std::memory_order_relaxed);
                if (profile) {
                    expert_io.sampled_pages.fetch_add(residency_known, std::memory_order_relaxed);
                    expert_io.resident_pages.fetch_add(resident_skips, std::memory_order_relaxed);
                }

                ggml_expert_io_plan_limits limits;
                const uint64_t per_call_bytes = env_u64("GGML_CPU_EXPERT_IO_ADVISE_MAX_BYTES", 8ULL * 1024ULL * 1024ULL);
                const uint64_t per_call_ranges = env_u64("GGML_CPU_EXPERT_IO_ADVISE_MAX_RANGES", 16);
                limits.max_bytes = std::min(per_call_bytes, graph_advice_bytes_left.load(std::memory_order_relaxed));
                limits.max_ranges = static_cast<size_t>(std::min(per_call_ranges, graph_advice_ranges_left.load(std::memory_order_relaxed)));
                limits.coalesce_gap = env_u64("GGML_CPU_EXPERT_IO_ADVISE_COALESCE_GAP", 0);
                const ggml_expert_tensor_span span {0, expert_bytes, static_cast<uint32_t>(n_expert)};
                const auto plan = ggml_expert_io_plan_ranges(selected, {span}, limits);
                expert_io.advice_skips.fetch_add(plan.skipped_ranges + (plan.error.empty() ? 0 : 1), std::memory_order_relaxed);
                if (plan.error.empty() && !plan.ranges.empty()) {
                    std::vector<expert_advice_range> ranges;
                    ranges.reserve(plan.ranges.size());
                    for (const auto & range : plan.ranges) {
                        const uintptr_t address = reinterpret_cast<uintptr_t>(weights->data) + range.offset;
                        const uintptr_t page_address = address & ~(page_size - 1);
                        const uint64_t prefix = address - page_address;
                        if (range.length > max_u64 - prefix) continue;
                        const uint64_t length = range.length + prefix;
                        if (length > std::numeric_limits<size_t>::max()) continue;
                        ranges.push_back({reinterpret_cast<void *>(page_address), static_cast<size_t>(length), range.length});
                    }
                    const size_t queue_depth = static_cast<size_t>(std::max<uint64_t>(1, env_u64("GGML_CPU_EXPERT_IO_ADVISE_QUEUE_DEPTH", 1)));
                    if (!ranges.empty() && advice_worker().submit(std::move(ranges), queue_depth)) {
                        reserve_up_to(graph_advice_bytes_left, plan.planned_bytes);
                        reserve_up_to(graph_advice_ranges_left, plan.ranges.size());
                    } else {
                        expert_io.advice_skips.fetch_add(plan.ranges.size(), std::memory_order_relaxed);
                    }
                }
            }
        }
    }

    if (profile && !advise && weights->data != nullptr && expert_io_sample_pages() != 0) {
        const long page_size_raw = sysconf(_SC_PAGESIZE);
        if (page_size_raw > 0) {
            const uintptr_t page_size = static_cast<uintptr_t>(page_size_raw);
            uint64_t sampled = 0, resident = 0;
            for (int64_t id = 0; id < n_expert && sampled < expert_io_sample_pages(); ++id) {
                if (!seen[static_cast<size_t>(id)]) continue;
                const uintptr_t address = reinterpret_cast<uintptr_t>(weights->data) + static_cast<uint64_t>(id) * expert_bytes;
                bool known = false;
                resident += page_is_resident(reinterpret_cast<void *>(address), page_size, known);
                sampled += known;
            }
            expert_io.sampled_pages.fetch_add(sampled, std::memory_order_relaxed);
            expert_io.resident_pages.fetch_add(resident, std::memory_order_relaxed);
        }
    }
#endif
}

extern "C" void ggml_cpu_expert_io_profile_observe(const struct ggml_tensor * node) {
    expert_io_process(node, true, false);
}
extern "C" void ggml_cpu_expert_io_advise(const struct ggml_tensor * node) {
    expert_io_process(node, false, true);
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
