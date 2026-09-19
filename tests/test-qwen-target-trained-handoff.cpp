#include "llama.h"

#include <algorithm>
#include <cerrno>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <memory>
#include <string>
#include <thread>
#include <vector>

using model_ptr = std::unique_ptr<llama_model, decltype(&llama_model_free)>;
using context_ptr = std::unique_ptr<llama_context, decltype(&llama_free)>;

struct batch_owner {
    llama_batch batch;
    explicit batch_owner(int32_t n) : batch(llama_batch_init(n, 0, 1)) {}
    batch_owner(const batch_owner &) = delete;
    batch_owner & operator=(const batch_owner &) = delete;
    batch_owner(batch_owner && other) noexcept : batch(other.batch) { other.batch = {}; }
    batch_owner & operator=(batch_owner &&) = delete;
    ~batch_owner() { llama_batch_free(batch); }
};

struct logits_result {
    bool finite = true;
    int32_t top_id = -1;
    float top_value = -INFINITY;
    uint64_t hash = UINT64_C(1469598103934665603);
};

static int fail(const char * phase) {
    std::fprintf(stderr, "QUALIFY_FAIL phase=%s\n", phase);
    return 1;
}

static int32_t parse_count(const char * value, const char * name, int32_t max_value) {
    char * end = nullptr;
    errno = 0;
    const long parsed = std::strtol(value, &end, 10);
    if (errno != 0 || end == value || *end != '\0' || parsed < 1 || parsed > max_value) {
        std::fprintf(stderr, "invalid %s: %s (expected 1..%d)\n", name, value, max_value);
        return -1;
    }
    return (int32_t) parsed;
}

static batch_owner make_batch(const std::vector<llama_token> & tokens, llama_pos pos0) {
    batch_owner result((int32_t) tokens.size());
    result.batch.n_tokens = (int32_t) tokens.size();
    for (int32_t i = 0; i < result.batch.n_tokens; ++i) {
        result.batch.token[i] = tokens[i];
        result.batch.pos[i] = pos0 + i;
        result.batch.n_seq_id[i] = 1;
        result.batch.seq_id[i][0] = 0;
        result.batch.logits[i] = i + 1 == result.batch.n_tokens;
    }
    return result;
}

static logits_result inspect_logits(llama_context * ctx) {
    logits_result result;
    llama_synchronize(ctx);
    const float * logits = llama_get_logits(ctx);
    const int32_t n_vocab = llama_vocab_n_tokens(llama_model_get_vocab(llama_get_model(ctx)));
    if (!logits || n_vocab <= 0) {
        result.finite = false;
        return result;
    }
    for (int32_t i = 0; i < n_vocab; ++i) {
        const float value = logits[i];
        result.finite = result.finite && std::isfinite(value);
        if (value > result.top_value) {
            result.top_value = value;
            result.top_id = i;
        }
        uint32_t bits = 0;
        std::memcpy(&bits, &value, sizeof(bits));
        result.hash ^= bits;
        result.hash *= UINT64_C(1099511628211);
    }
    return result;
}

static bool file_exists(const std::string & path) {
    if (FILE * file = std::fopen(path.c_str(), "rb")) {
        std::fclose(file);
        return true;
    }
    return false;
}

static bool memory_checkpoint(const char * phase) {
    const char * dir = std::getenv("QWEN_MEMORY_CHECKPOINT_DIR");
    if (!dir || !*dir) return true;
    const std::string ready = std::string(dir) + "/" + phase + ".ready";
    const std::string resume = std::string(dir) + "/" + phase + ".continue";
    FILE * file = std::fopen(ready.c_str(), "wb");
    if (!file) return false;
    std::fprintf(file, "%s\n", phase);
    std::fclose(file);
    for (int i = 0; i < 120000; ++i) {
        if (file_exists(resume)) return true;
        std::this_thread::sleep_for(std::chrono::milliseconds(1));
    }
    return false;
}

static llama_context_params context_params(bool use_vulkan, bool strict, bool destination,
        uint32_t n_ctx, uint32_t n_batch, uint32_t n_ubatch, int32_t n_threads, bool flash_attn) {
    llama_context_params params = llama_context_default_params();
    params.n_ctx = n_ctx;
    params.n_batch = n_batch;
    params.n_ubatch = n_ubatch;
    params.n_seq_max = 1;
    params.n_rs_seq = 3;
    params.n_outputs_max = 1;
    params.n_outputs_max_per_seq = 1;
    params.n_threads = n_threads;
    params.n_threads_batch = n_threads;
    params.type_k = GGML_TYPE_F16;
    params.type_v = GGML_TYPE_F16;
    params.flash_attn_type = flash_attn ? LLAMA_FLASH_ATTN_TYPE_ENABLED : LLAMA_FLASH_ATTN_TYPE_DISABLED;
    params.offload_kqv = use_vulkan && !destination;
    params.op_offload = use_vulkan && !destination;
    params.kv_handoff_strict = strict;
    params.kv_handoff_destination = destination;
    return params;
}

int main(int argc, char ** argv) {
    if (argc < 3 || argc > 7 ||
            (std::strcmp(argv[1], "cpu") != 0 &&
             std::strcmp(argv[1], "vulkan") != 0 &&
             std::strcmp(argv[1], "vulkan-strict") != 0 &&
             std::strcmp(argv[1], "handoff") != 0)) {
        std::fprintf(stderr, "usage: %s cpu|vulkan|vulkan-strict|handoff MODEL.gguf [PREFILL_TOKENS [OUTPUT_TOKENS [CHUNK_TOKENS [UBATCH_TOKENS]]]]\n", argv[0]);
        return 2;
    }

    const bool handoff = std::strcmp(argv[1], "handoff") == 0;
    const bool use_vulkan = handoff || std::strcmp(argv[1], "vulkan") == 0 || std::strcmp(argv[1], "vulkan-strict") == 0;
    const bool strict = handoff || std::strcmp(argv[1], "vulkan-strict") == 0;
    const char * model_path = argv[2];
    const int32_t n_prefill = argc >= 4 ? parse_count(argv[3], "PREFILL_TOKENS", 4096) : 32;
    const int32_t n_output = argc >= 5 ? parse_count(argv[4], "OUTPUT_TOKENS", 256) : 8;
    if (n_prefill < 0 || n_output < 0) return 2;
    const int32_t default_chunk = std::min<int32_t>(n_prefill, 256);
    const int32_t n_chunk = argc >= 6 ? parse_count(argv[5], "CHUNK_TOKENS", 2048) : default_chunk;
    const int32_t n_ubatch_arg = argc >= 7 ? parse_count(argv[6], "UBATCH_TOKENS", 2048) : std::min<int32_t>(n_chunk, 512);
    const char * batch_env = std::getenv("QWEN_BATCH");
    const int32_t n_batch_arg = batch_env ? parse_count(batch_env, "QWEN_BATCH", 4096) : n_chunk;
    if (n_chunk < 0 || n_ubatch_arg < 0 || n_batch_arg < 0 || n_chunk > n_prefill || n_chunk > n_batch_arg || n_ubatch_arg > n_batch_arg) return 2;

    const char * threads_env = std::getenv("QWEN_THREADS");
    const int32_t n_threads = threads_env ? parse_count(threads_env, "QWEN_THREADS", 64) : 12;
    const char * layers_env = std::getenv("QWEN_GPU_LAYERS");
    const int32_t n_gpu_layers = use_vulkan && layers_env ? parse_count(layers_env, "QWEN_GPU_LAYERS", 999) : 999;
    if (n_threads < 0 || n_gpu_layers < 0) return 2;
    const bool flash_attn = std::getenv("QWEN_FLASH_ATTN") && std::strcmp(std::getenv("QWEN_FLASH_ATTN"), "1") == 0;
    const uint32_t n_ctx = (uint32_t) std::max<int32_t>(32, n_prefill + n_output);
    const uint32_t n_batch = (uint32_t) std::max<int32_t>(32, n_batch_arg);
    const uint32_t n_ubatch = (uint32_t) std::max<int32_t>(32, n_ubatch_arg);

    ggml_backend_load_all();
    llama_backend_init();
    const int64_t all_start = llama_time_us();

    model_ptr cpu_model(nullptr, llama_model_free);
    int64_t load_cpu_us = 0;
    if (!use_vulkan || handoff) {
        const int64_t start = llama_time_us();
        auto params = llama_model_default_params();
        params.n_gpu_layers = 0;
        cpu_model.reset(llama_model_load_from_file(model_path, params));
        if (!cpu_model) return fail("load_cpu_model");
        load_cpu_us = llama_time_us() - start;
        if (llama_model_n_layer_nextn(cpu_model.get()) != 0) return fail("unexpected_mtp_layers");
    }

    model_ptr gpu_model(nullptr, llama_model_free);
    int64_t load_gpu_us = 0;
    if (use_vulkan) {
        const int64_t start = llama_time_us();
        auto params = llama_model_default_params();
        params.n_gpu_layers = n_gpu_layers;
        gpu_model.reset(llama_model_load_from_file(model_path, params));
        if (!gpu_model) return fail("load_gpu_model");
        load_gpu_us = llama_time_us() - start;
        if (llama_model_n_layer_nextn(gpu_model.get()) != 0) return fail("unexpected_mtp_layers");
    }
    if (!memory_checkpoint("models_loaded")) return fail("checkpoint_models_loaded");

    llama_model * source_model = use_vulkan ? gpu_model.get() : cpu_model.get();
    context_ptr source(llama_init_from_model(source_model,
            context_params(use_vulkan, strict, false, n_ctx, n_batch, n_ubatch, n_threads, flash_attn)), llama_free);
    if (!source) return fail("init_source_context");
    if (!memory_checkpoint("contexts_ready")) return fail("checkpoint_contexts_ready");

    std::vector<llama_token> prompt_tokens;
    prompt_tokens.reserve(n_prefill);
    for (int32_t i = 0; i < n_prefill; ++i) prompt_tokens.push_back(100 + i % 100);

    const int64_t active_start = llama_time_us();
    int64_t prefill_us = 0;
    for (int32_t offset = 0; offset < n_prefill; offset += n_chunk) {
        const int32_t count = std::min(n_chunk, n_prefill - offset);
        const std::vector<llama_token> tokens(prompt_tokens.begin() + offset, prompt_tokens.begin() + offset + count);
        auto batch = make_batch(tokens, offset);
        const int64_t start = llama_time_us();
        if (llama_decode(source.get(), batch.batch) != 0) return fail("prefill");
        llama_synchronize(source.get());
        prefill_us += llama_time_us() - start;
    }
    const logits_result prefill_logits = inspect_logits(source.get());
    if (!prefill_logits.finite) return fail("prefill_logits");
    if (!memory_checkpoint("prefill_done")) return fail("checkpoint_prefill_done");

    context_ptr destination(nullptr, llama_free);
    llama_kv_handoff_result transfer {};
    int64_t destination_init_us = 0;
    int64_t handoff_us = 0;
    int64_t source_release_us = 0;
    int64_t reeval_us = 0;
    llama_context * active = source.get();
    if (handoff) {
        const int64_t init_start = llama_time_us();
        destination.reset(llama_init_from_model(cpu_model.get(),
                context_params(false, true, true, n_ctx, n_batch, n_ubatch, n_threads, flash_attn)));
        if (!destination) return fail("init_destination_context");
        destination_init_us = llama_time_us() - init_start;
        if (!memory_checkpoint("destination_ready")) return fail("checkpoint_destination_ready");

        const int64_t handoff_start = llama_time_us();
        if (!llama_kv_handoff_cpu(destination.get(), source.get(), false, &transfer)) return fail("handoff");
        handoff_us = llama_time_us() - handoff_start;
        if (transfer.shared_bytes == 0 || transfer.copied_bytes != 0) return fail("copy_accounting");
        if (!memory_checkpoint("handoff_done")) return fail("checkpoint_handoff_done");

        const int64_t release_start = llama_time_us();
        source.reset();
        gpu_model.reset();
        source_release_us = llama_time_us() - release_start;
        active = destination.get();
        if (!memory_checkpoint("source_released")) return fail("checkpoint_source_released");

        if (!llama_memory_seq_rm(llama_get_memory(active), 0, n_prefill - 1, -1)) return fail("remove_last_prompt_token");
        auto last_prompt = make_batch({prompt_tokens.back()}, n_prefill - 1);
        const int64_t reeval_start = llama_time_us();
        if (llama_decode(active, last_prompt.batch) != 0) return fail("reeval_last_prompt_token");
        const logits_result reeval_logits = inspect_logits(active);
        if (!reeval_logits.finite) return fail("reeval_logits");
        reeval_us = llama_time_us() - reeval_start;
    }

    const int64_t continuation_start = llama_time_us();
    logits_result final_logits;
    for (int32_t i = 0; i < n_output; ++i) {
        auto batch = make_batch({100 + (n_prefill + i) % 100}, n_prefill + i);
        if (llama_decode(active, batch.batch) != 0) return fail("continuation");
        final_logits = inspect_logits(active);
        if (!final_logits.finite) return fail("continuation_logits");
    }
    const int64_t continuation_us = llama_time_us() - continuation_start;
    const llama_pos final_pos = llama_memory_seq_pos_max(llama_get_memory(active), 0);
    if (final_pos != n_prefill + n_output - 1) return fail("final_position");

    std::printf(
        "QUALIFY_RESULT profile=%s tokens_prefill=%d tokens_continue=%d chunk_tokens=%d batch_tokens=%u ubatch_tokens=%u chunks=%d "
        "threads=%d gpu_layers=%d flash_attn=%d n_rs_seq=%u load_cpu_us=%lld load_gpu_us=%lld prefill_us=%lld "
        "destination_init_us=%lld handoff_us=%lld source_release_us=%lld reeval_us=%lld continuation_us=%lld active_wall_us=%lld "
        "shared_bytes=%zu copied_bytes=%zu final_pos=%d prefill_finite=1 prefill_top_id=%d prefill_hash=%016llx "
        "logits_finite=1 logits_top_id=%d logits_hash=%016llx total_us=%lld\n",
        argv[1], n_prefill, n_output, n_chunk, n_batch, n_ubatch, (n_prefill + n_chunk - 1) / n_chunk,
        n_threads, use_vulkan ? n_gpu_layers : 0, flash_attn ? 1 : 0, llama_n_rs_seq(active),
        (long long) load_cpu_us, (long long) load_gpu_us, (long long) prefill_us,
        (long long) destination_init_us, (long long) handoff_us, (long long) source_release_us,
        (long long) reeval_us, (long long) continuation_us, (long long) (llama_time_us() - active_start),
        transfer.shared_bytes, transfer.copied_bytes, (int) final_pos,
        prefill_logits.top_id, (unsigned long long) prefill_logits.hash,
        final_logits.top_id, (unsigned long long) final_logits.hash,
        (long long) (llama_time_us() - all_start));
    return 0;
}
