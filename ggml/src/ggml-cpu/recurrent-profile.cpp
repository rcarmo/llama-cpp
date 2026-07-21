#include "recurrent-profile.h"

#include "ggml.h"

#include <array>
#include <atomic>
#include <cinttypes>
#include <cstdio>
#include <cstdlib>
#include <mutex>

namespace {

constexpr size_t COPY_BUCKETS = 32;
constexpr size_t DOT_BUCKETS  = 16;
constexpr size_t SHAPE_SLOTS  = 64;

struct counter {
    std::atomic<uint64_t> calls { 0 };
    std::atomic<uint64_t> units { 0 };
    std::atomic<uint64_t> us    { 0 };
};

struct shape_counter {
    std::atomic<uint64_t> key   { 0 };
    std::atomic<uint64_t> calls { 0 };
    std::atomic<uint64_t> us    { 0 };
    int64_t ne[GGML_MAX_DIMS]   { 0, 0, 0, 0 };
    enum ggml_type type         = GGML_TYPE_COUNT;
};

std::array<counter, COPY_BUCKETS> copy_dup;
std::array<counter, COPY_BUCKETS> copy_cpy;
std::array<counter, DOT_BUCKETS> dot_f32;
std::array<shape_counter, SHAPE_SLOTS> gdn_shapes;
std::array<shape_counter, SHAPE_SLOTS> ssm_shapes;

std::once_flag init_flag;
bool enabled = false;

static size_t log2_bucket(uint64_t value, size_t count) {
    size_t bucket = 0;
    while (value > 1 && bucket + 1 < count) {
        value >>= 1;
        ++bucket;
    }
    return bucket;
}

static uint64_t mix(uint64_t h, uint64_t value) {
    h ^= value + 0x9e3779b97f4a7c15ULL + (h << 6) + (h >> 2);
    return h;
}

static uint64_t shape_key(const ggml_tensor * dst) {
    uint64_t h = 0xcbf29ce484222325ULL;
    h = mix(h, (uint64_t) dst->type);
    for (int i = 0; i < GGML_MAX_DIMS; ++i) {
        h = mix(h, (uint64_t) dst->ne[i]);
    }
    return h == 0 ? 1 : h;
}

static void add_shape(std::array<shape_counter, SHAPE_SLOTS> & slots, const ggml_tensor * dst, uint64_t us) {
    const uint64_t key = shape_key(dst);
    size_t index = key % slots.size();
    for (size_t probe = 0; probe < slots.size(); ++probe) {
        shape_counter & slot = slots[(index + probe) % slots.size()];
        uint64_t expected = 0;
        if (slot.key.load(std::memory_order_acquire) == key) {
            slot.calls.fetch_add(1, std::memory_order_relaxed);
            slot.us.fetch_add(us, std::memory_order_relaxed);
            return;
        }
        if (slot.key.compare_exchange_strong(expected, UINT64_MAX, std::memory_order_acq_rel)) {
            for (int i = 0; i < GGML_MAX_DIMS; ++i) {
                slot.ne[i] = dst->ne[i];
            }
            slot.type = dst->type;
            slot.calls.store(1, std::memory_order_relaxed);
            slot.us.store(us, std::memory_order_relaxed);
            slot.key.store(key, std::memory_order_release);
            return;
        }
    }
}

static void dump_counters(const char * name, const std::array<counter, COPY_BUCKETS> & counters) {
    for (size_t i = 0; i < counters.size(); ++i) {
        const uint64_t calls = counters[i].calls.load(std::memory_order_relaxed);
        if (calls == 0) {
            continue;
        }
        std::fprintf(stderr,
                "GGML_CPU_RECURRENT_PROFILE kind=%s bucket_log2=%zu calls=%" PRIu64
                " bytes=%" PRIu64 " thread_us=%" PRIu64 "\n",
                name, i, calls,
                counters[i].units.load(std::memory_order_relaxed),
                counters[i].us.load(std::memory_order_relaxed));
    }
}

static void dump_dot() {
    for (size_t i = 0; i < dot_f32.size(); ++i) {
        const uint64_t calls = dot_f32[i].calls.load(std::memory_order_relaxed);
        if (calls == 0) {
            continue;
        }
        std::fprintf(stderr,
                "GGML_CPU_RECURRENT_PROFILE kind=dot_f32 bucket_log2=%zu calls=%" PRIu64
                " elements=%" PRIu64 "\n",
                i, calls, dot_f32[i].units.load(std::memory_order_relaxed));
    }
}

static void dump_shapes(const char * name, const std::array<shape_counter, SHAPE_SLOTS> & slots) {
    for (const shape_counter & slot : slots) {
        const uint64_t key = slot.key.load(std::memory_order_relaxed);
        if (key == 0) {
            continue;
        }
        std::fprintf(stderr,
                "GGML_CPU_RECURRENT_PROFILE kind=%s shape_key=%016" PRIx64
                " type=%s ne=%" PRId64 "x%" PRId64 "x%" PRId64 "x%" PRId64
                " calls=%" PRIu64 " thread_us=%" PRIu64 "\n",
                name, key, ggml_type_name(slot.type),
                slot.ne[0], slot.ne[1], slot.ne[2], slot.ne[3],
                slot.calls.load(std::memory_order_relaxed),
                slot.us.load(std::memory_order_relaxed));
    }
}

static void dump() {
    dump_counters("dup", copy_dup);
    dump_counters("cpy", copy_cpy);
    dump_dot();
    dump_shapes("gdn", gdn_shapes);
    dump_shapes("ssm_conv", ssm_shapes);
}

static void init() {
    const char * value = std::getenv("GGML_CPU_RECURRENT_PROFILE");
    enabled = value != nullptr && value[0] != '\0' && value[0] != '0';
    if (enabled) {
        std::atexit(dump);
    }
}

} // namespace

bool ggml_cpu_recurrent_profile_enabled() {
    std::call_once(init_flag, init);
    return enabled;
}

int64_t ggml_cpu_recurrent_profile_now_us() {
    return ggml_time_us();
}

void ggml_cpu_recurrent_profile_copy(
        enum ggml_op op,
        const ggml_tensor * src,
        const ggml_tensor * dst,
        int ith,
        int nth,
        int64_t elapsed_us) {
    if (!ggml_cpu_recurrent_profile_enabled() || src == nullptr || dst == nullptr) {
        return;
    }
    const uint64_t bytes = ggml_nbytes(dst);
    auto & counters = op == GGML_OP_CPY ? copy_cpy : copy_dup;
    counter & c = counters[log2_bucket(bytes, counters.size())];
    c.calls.fetch_add(1, std::memory_order_relaxed);
    if (ith == 0) {
        c.units.fetch_add(bytes, std::memory_order_relaxed);
    }
    c.us.fetch_add(elapsed_us, std::memory_order_relaxed);
    (void) nth;
}

void ggml_cpu_recurrent_profile_dot_f32(int n) {
    if (!ggml_cpu_recurrent_profile_enabled() || n <= 0) {
        return;
    }
    counter & c = dot_f32[log2_bucket((uint64_t) n, dot_f32.size())];
    c.calls.fetch_add(1, std::memory_order_relaxed);
    c.units.fetch_add((uint64_t) n, std::memory_order_relaxed);
}

void ggml_cpu_recurrent_profile_gdn(const ggml_tensor * dst, int ith, int64_t elapsed_us) {
    if (!ggml_cpu_recurrent_profile_enabled() || ith != 0 || dst == nullptr) {
        return;
    }
    add_shape(gdn_shapes, dst, (uint64_t) elapsed_us);
}

void ggml_cpu_recurrent_profile_ssm_conv(const ggml_tensor * dst, int ith, int64_t elapsed_us) {
    if (!ggml_cpu_recurrent_profile_enabled() || ith != 0 || dst == nullptr) {
        return;
    }
    add_shape(ssm_shapes, dst, (uint64_t) elapsed_us);
}
