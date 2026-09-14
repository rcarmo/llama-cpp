// Diagnostic only: bounded shape groups; elapsed fields are not throughput evidence.
struct shape_row {
    uint64_t calls = 0, elapsed_us = 0;
};
static std::mutex shape_mutex;
static std::unordered_map<std::string, shape_row> shape_rows;
static uint64_t shape_overflow = 0;
static bool shape_enabled() {
    static const bool enabled = [] {
        const char * value = std::getenv("GGML_CPU_SHAPE_PROFILE");
        return value != nullptr && std::strcmp(value, "1") == 0;
    }();
    return enabled;
}
static void shape_observe(const ggml_tensor * node, int threads, int64_t elapsed, const char * phase) {
    if (!shape_enabled() || node == nullptr || node->op != GGML_OP_MUL_MAT || node->src[0] == nullptr || node->src[1] == nullptr) return;
    const auto * a = node->src[0];
    const auto * b = node->src[1];
    // Tensor names are model metadata, never prompt text. Retain literal names/types/shapes.
    char key[512];
    std::snprintf(key, sizeof(key), "phase=%s name=%.63s a=%.63s at=%s bt=%s k=%lld m=%lld n=%lld b2=%lld b3=%lld a2=%lld a3=%lld threads=%d",
        phase, node->name, a->name, ggml_type_name(a->type), ggml_type_name(b->type),
        (long long) a->ne[0], (long long) a->ne[1], (long long) b->ne[1],
        (long long) b->ne[2], (long long) b->ne[3], (long long) a->ne[2], (long long) a->ne[3], threads);
    std::lock_guard<std::mutex> lock(shape_mutex);
    auto it = shape_rows.find(key);
    if (it == shape_rows.end()) {
        if (shape_rows.size() >= 8192) { shape_overflow++; return; }
        it = shape_rows.emplace(key, shape_row{}).first;
    }
    it->second.calls++;
    it->second.elapsed_us += static_cast<uint64_t>(std::max<int64_t>(0, elapsed));
}
static void shape_dump() {
    std::lock_guard<std::mutex> lock(shape_mutex);
    for (const auto & entry : shape_rows) std::fprintf(stderr, "GGML_CPU_SHAPE_PROFILE %s calls=%llu elapsed_us=%llu\n", entry.first.c_str(), (unsigned long long) entry.second.calls, (unsigned long long) entry.second.elapsed_us);
    if (shape_enabled()) std::fprintf(stderr, "GGML_CPU_SHAPE_PROFILE phase=summary groups=%zu overflow=%llu\n", shape_rows.size(), (unsigned long long) shape_overflow);
}
