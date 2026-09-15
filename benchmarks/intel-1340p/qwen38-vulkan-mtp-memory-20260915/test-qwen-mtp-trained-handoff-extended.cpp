#include "common.h"
#include "llama.h"
#include "speculative.h"

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

static int fail(const char * phase) {
    std::fprintf(stderr, "QUALIFY_FAIL phase=%s\n", phase);
    return 1;
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

struct logits_result {
    bool finite = true;
    int32_t top_id = -1;
    float top_value = -INFINITY;
    uint64_t hash = UINT64_C(1469598103934665603);
};

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
    if (FILE * file = std::fopen(path.c_str(), "r")) {
        std::fclose(file);
        return true;
    }
    return false;
}

static bool memory_checkpoint(const char * phase) {
    const char * dir = std::getenv("QWEN_MEMORY_CHECKPOINT_DIR");
    if (dir == nullptr || dir[0] == '\0') {
        return true;
    }

    const std::string ready = std::string(dir) + "/" + phase + ".ready";
    const std::string resume = std::string(dir) + "/" + phase + ".continue";
    FILE * file = std::fopen(ready.c_str(), "w");
    if (file == nullptr) {
        return false;
    }
    std::fprintf(file, "%s\n", phase);
    std::fclose(file);

    for (int i = 0; i < 120000; ++i) {
        if (file_exists(resume)) {
            return true;
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(1));
    }
    return false;
}

static llama_context_params context_params(
        bool strict, bool destination, llama_context_type type,
        uint32_t n_ctx, uint32_t n_batch, uint32_t n_ubatch) {
    llama_context_params params = llama_context_default_params();
    params.n_ctx = n_ctx;
    params.n_batch = n_batch;
    params.n_ubatch = n_ubatch;
    params.n_seq_max = 1;
    const char * outputs_env = std::getenv("QWEN_N_OUTPUTS_MAX");
    if (outputs_env != nullptr) {
        char * end = nullptr;
        errno = 0;
        const long outputs = std::strtol(outputs_env, &end, 10);
        if (errno != 0 || end == outputs_env || *end != '\0' || outputs < 1 || outputs > n_batch) {
            return {};
        }
        params.n_outputs_max = (uint32_t) outputs;
        params.n_outputs_max_per_seq = (uint32_t) outputs;
    }
    params.n_rs_seq = type == LLAMA_CONTEXT_TYPE_DEFAULT ? 3 : 0;
    params.n_threads = 8;
    params.n_threads_batch = 8;
    params.type_k = GGML_TYPE_F16;
    params.type_v = GGML_TYPE_F16;
    const char * flash_env = std::getenv("QWEN_FLASH_ATTN");
    params.flash_attn_type = flash_env != nullptr && std::strcmp(flash_env, "1") == 0
            ? LLAMA_FLASH_ATTN_TYPE_ENABLED
            : LLAMA_FLASH_ATTN_TYPE_DISABLED;
    params.offload_kqv = strict && !destination;
    params.op_offload = strict && !destination;
    params.kv_handoff_strict = strict;
    params.kv_handoff_destination = destination;
    params.ctx_type = type;
    return params;
}

int main(int argc, char ** argv) {
    if (argc < 3 || argc > 6 ||
            (std::strcmp(argv[1], "cpu") != 0 &&
             std::strcmp(argv[1], "vulkan") != 0 &&
             std::strcmp(argv[1], "handoff") != 0)) {
        std::fprintf(stderr, "usage: %s cpu|vulkan|handoff MODEL.gguf [PREFILL_TOKENS [CHUNK_TOKENS [UBATCH_TOKENS]]]\n", argv[0]);
        return 2;
    }
    const bool handoff = std::strcmp(argv[1], "handoff") == 0;
    const bool vulkan_only = std::strcmp(argv[1], "vulkan") == 0;
    const bool use_vulkan = handoff || vulkan_only;
    const char * model_path = argv[2];

    auto parse_count = [](const char * value, const char * name, int32_t max_value) {
        char * end = nullptr;
        errno = 0;
        const long parsed = std::strtol(value, &end, 10);
        if (errno != 0 || end == value || *end != '\0' || parsed < 1 || parsed > max_value) {
            std::fprintf(stderr, "invalid %s: %s (expected 1..%d)\n", name, value, max_value);
            return int32_t(-1);
        }
        return (int32_t) parsed;
    };

    const int32_t n_prefill = argc >= 4 ? parse_count(argv[3], "PREFILL_TOKENS", 4096) : 7;
    if (n_prefill < 0) return 2;
    const int32_t default_chunk = std::min<int32_t>(n_prefill, 256);
    const int32_t n_chunk = argc >= 5 ? parse_count(argv[4], "CHUNK_TOKENS", 256) : default_chunk;
    if (n_chunk < 0 || n_chunk > n_prefill) {
        if (n_chunk > n_prefill) {
            std::fprintf(stderr, "CHUNK_TOKENS must not exceed PREFILL_TOKENS\n");
        }
        return 2;
    }
    const int32_t default_ubatch = n_chunk;
    const int32_t n_ubatch_arg = argc >= 6 ? parse_count(argv[5], "UBATCH_TOKENS", 256) : default_ubatch;
    if (n_ubatch_arg < 0 || n_ubatch_arg > n_chunk) {
        if (n_ubatch_arg > n_chunk) {
            std::fprintf(stderr, "UBATCH_TOKENS must not exceed CHUNK_TOKENS\n");
        }
        return 2;
    }
    const uint32_t n_ctx = (uint32_t) std::max<int32_t>(32, n_prefill + 1);
    const uint32_t n_batch = (uint32_t) std::max<int32_t>(32, n_chunk);
    const uint32_t n_ubatch = (uint32_t) std::max<int32_t>(32, n_ubatch_arg);
    const char * mtp_batch_env = std::getenv("QWEN_MTP_BATCH");
    const int32_t mtp_batch_arg = mtp_batch_env != nullptr
            ? parse_count(mtp_batch_env, "QWEN_MTP_BATCH", 256)
            : (int32_t) n_batch;
    if (mtp_batch_arg < 0 || mtp_batch_arg > (int32_t) n_batch) return 2;
    const uint32_t mtp_batch = (uint32_t) std::max<int32_t>(32, mtp_batch_arg);
    const char * mtp_ubatch_env = std::getenv("QWEN_MTP_UBATCH");
    const int32_t mtp_ubatch_arg = mtp_ubatch_env != nullptr
            ? parse_count(mtp_ubatch_env, "QWEN_MTP_UBATCH", 256)
            : (int32_t) n_ubatch;
    if (mtp_ubatch_arg < 0 || mtp_ubatch_arg > (int32_t) mtp_batch) return 2;
    const uint32_t mtp_ubatch = (uint32_t) std::max<int32_t>(32, mtp_ubatch_arg);

    ggml_backend_load_all();
    llama_backend_init();

    const int64_t all_start = llama_time_us();
    int64_t load_cpu_us = 0;
    model_ptr cpu_model(nullptr, llama_model_free);
    if (!vulkan_only) {
        const int64_t load_start = llama_time_us();
        llama_model_params cpu_mp = llama_model_default_params();
        cpu_mp.n_gpu_layers = 0;
        cpu_mp.load_mtp = true;
        cpu_model.reset(llama_model_load_from_file(model_path, cpu_mp));
        if (!cpu_model) return fail("load_cpu_model");
        load_cpu_us = llama_time_us() - load_start;
    }

    int64_t load_gpu_us = 0;
    model_ptr gpu_model(nullptr, llama_model_free);
    if (use_vulkan) {
        const int64_t load_start = llama_time_us();
        llama_model_params gpu_mp = llama_model_default_params();
        gpu_mp.n_gpu_layers = 999;
        gpu_mp.load_mtp = true;
        gpu_model.reset(llama_model_load_from_file(model_path, gpu_mp));
        if (!gpu_model) return fail("load_gpu_model");
        load_gpu_us = llama_time_us() - load_start;
    }
    const int64_t models_loaded = llama_time_us();

    llama_model * source_model = use_vulkan ? gpu_model.get() : cpu_model.get();
    if (llama_model_n_layer_nextn(source_model) != 1) return fail("embedded_mtp_layer_count");
    if (!memory_checkpoint("models_loaded")) return fail("checkpoint_models_loaded");

    context_ptr src_tgt(llama_init_from_model(source_model,
            context_params(use_vulkan, false, LLAMA_CONTEXT_TYPE_DEFAULT, n_ctx, n_batch, n_ubatch)), llama_free);
    context_ptr src_mtp(llama_init_from_model(source_model,
            context_params(use_vulkan, false, LLAMA_CONTEXT_TYPE_MTP, n_ctx, mtp_batch, mtp_ubatch)), llama_free);
    if (!src_tgt || !src_mtp) return fail("init_source_contexts");

    common_params_speculative spec_params;
    spec_params.types = { COMMON_SPECULATIVE_TYPE_DRAFT_MTP };
    spec_params.draft.n_max = 3;
    spec_params.draft.backend_sampling = false;
    spec_params.draft.ctx_tgt = src_tgt.get();
    spec_params.draft.ctx_dft = src_mtp.get();
    common_speculative_ptr spec(common_speculative_init(spec_params, 1));
    if (!spec) return fail("init_mtp_controller");
    const int64_t contexts_ready = llama_time_us();
    if (!memory_checkpoint("contexts_ready")) return fail("checkpoint_contexts_ready");

    std::vector<llama_token> prompt_tokens;
    prompt_tokens.reserve(n_prefill);
    for (int32_t i = 0; i < n_prefill; ++i) {
        prompt_tokens.push_back(100 + i % 100);
    }

    int64_t prefill_target_us = 0;
    int64_t prefill_mtp_us = 0;
    const int64_t active_start = llama_time_us();
    for (int32_t offset = 0; offset < n_prefill; offset += n_chunk) {
        const int32_t count = std::min(n_chunk, n_prefill - offset);
        const std::vector<llama_token> chunk_tokens(
                prompt_tokens.begin() + offset, prompt_tokens.begin() + offset + count);
        auto prompt = make_batch(chunk_tokens, offset);

        const int64_t target_start = llama_time_us();
        if (llama_decode(src_tgt.get(), prompt.batch) != 0) return fail("prefill_target");
        llama_synchronize(src_tgt.get());
        prefill_target_us += llama_time_us() - target_start;

        const int64_t mtp_start = llama_time_us();
        if (!common_speculative_process(spec.get(), prompt.batch)) return fail("prefill_mtp");
        llama_synchronize(src_mtp.get());
        prefill_mtp_us += llama_time_us() - mtp_start;
    }
    if (!memory_checkpoint("prefill_done")) return fail("checkpoint_prefill_done");

    context_ptr dst_tgt(nullptr, llama_free);
    context_ptr dst_mtp(nullptr, llama_free);
    llama_kv_handoff_result transfer {};
    int64_t destination_init_us = 0;
    int64_t handoff_us = 0;
    int64_t source_release_us = 0;
    llama_context * active_tgt = src_tgt.get();
    llama_context * active_mtp = src_mtp.get();

    if (handoff) {
        const int64_t init_start = llama_time_us();
        dst_tgt.reset(llama_init_from_model(cpu_model.get(),
                context_params(true, true, LLAMA_CONTEXT_TYPE_DEFAULT, n_ctx, n_batch, n_ubatch)));
        dst_mtp.reset(llama_init_from_model(cpu_model.get(),
                context_params(true, true, LLAMA_CONTEXT_TYPE_MTP, n_ctx, mtp_batch, mtp_ubatch)));
        if (!dst_tgt || !dst_mtp) return fail("init_destination_contexts");
        destination_init_us = llama_time_us() - init_start;
        if (!memory_checkpoint("destination_ready")) return fail("checkpoint_destination_ready");

        const int64_t handoff_start = llama_time_us();
        if (!common_speculative_handoff_cpu(spec.get(), dst_tgt.get(), dst_mtp.get(),
                    src_tgt.get(), src_mtp.get(), &transfer)) return fail("handoff");
        handoff_us = llama_time_us() - handoff_start;
        if (transfer.copied_bytes != 0 || transfer.shared_bytes == 0) return fail("copy_accounting");
        if (!memory_checkpoint("handoff_done")) return fail("checkpoint_handoff_done");

        const int64_t release_start = llama_time_us();
        src_mtp.reset();
        src_tgt.reset();
        gpu_model.reset();
        source_release_us = llama_time_us() - release_start;
        active_tgt = dst_tgt.get();
        active_mtp = dst_mtp.get();
        if (!memory_checkpoint("source_released")) return fail("checkpoint_source_released");
    }

    auto next = make_batch({100 + n_prefill % 100}, n_prefill);
    const int64_t continuation_start = llama_time_us();
    if (llama_decode(active_tgt, next.batch) != 0) return fail("continuation_target");
    llama_synchronize(active_tgt);
    const int64_t continuation_target_done = llama_time_us();
    if (!common_speculative_process(spec.get(), next.batch)) return fail("continuation_mtp");
    llama_synchronize(active_mtp);
    const int64_t continuation_mtp_done = llama_time_us();

    const logits_result logits = inspect_logits(active_tgt);
    if (!logits.finite) return fail("finite_logits");
    const llama_pos target_pos = llama_memory_seq_pos_max(llama_get_memory(active_tgt), 0);
    const llama_pos mtp_pos = llama_memory_seq_pos_max(llama_get_memory(active_mtp), 0);
    if (target_pos != n_prefill || mtp_pos != n_prefill) return fail("final_positions");

    std::printf(
        "QUALIFY_RESULT profile=%s tokens_prefill=%d chunk_tokens=%d ubatch_tokens=%u mtp_batch_tokens=%u mtp_ubatch_tokens=%u chunks=%d tokens_continue=1 n_rs_seq=3 "
        "load_cpu_us=%lld load_gpu_us=%lld init_source_us=%lld prefill_target_us=%lld "
        "prefill_mtp_us=%lld destination_init_us=%lld handoff_us=%lld source_release_us=%lld "
        "continuation_target_us=%lld continuation_mtp_us=%lld active_wall_us=%lld "
        "shared_bytes=%zu copied_bytes=%zu target_pos=%d mtp_pos=%d "
        "logits_finite=1 logits_top_id=%d logits_top_value=%.9g logits_hash=%016llx total_us=%lld\n",
        argv[1],
        n_prefill,
        n_chunk,
        n_ubatch,
        mtp_batch,
        mtp_ubatch,
        (n_prefill + n_chunk - 1) / n_chunk,
        (long long) load_cpu_us,
        (long long) load_gpu_us,
        (long long) (contexts_ready - models_loaded),
        (long long) prefill_target_us,
        (long long) prefill_mtp_us,
        (long long) destination_init_us,
        (long long) handoff_us,
        (long long) source_release_us,
        (long long) (continuation_target_done - continuation_start),
        (long long) (continuation_mtp_done - continuation_target_done),
        (long long) (continuation_mtp_done - active_start),
        transfer.shared_bytes,
        transfer.copied_bytes,
        (int) target_pos,
        (int) mtp_pos,
        logits.top_id,
        logits.top_value,
        (unsigned long long) logits.hash,
        (long long) (llama_time_us() - all_start));
    return 0;
}
