#include "common.h"
#include "llama.h"
#include "speculative.h"

#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <memory>
#include <string>
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

static llama_context_params context_params(bool strict, bool destination, llama_context_type type) {
    llama_context_params params = llama_context_default_params();
    params.n_ctx = 32;
    params.n_batch = 32;
    params.n_ubatch = 32;
    params.n_seq_max = 1;
    params.n_rs_seq = type == LLAMA_CONTEXT_TYPE_DEFAULT ? 3 : 0;
    params.n_threads = 8;
    params.n_threads_batch = 8;
    params.type_k = GGML_TYPE_F16;
    params.type_v = GGML_TYPE_F16;
    params.flash_attn_type = LLAMA_FLASH_ATTN_TYPE_DISABLED;
    params.offload_kqv = strict && !destination;
    params.op_offload = strict && !destination;
    params.kv_handoff_strict = strict;
    params.kv_handoff_destination = destination;
    params.ctx_type = type;
    return params;
}

int main(int argc, char ** argv) {
    if (argc != 3 || (std::strcmp(argv[1], "cpu") != 0 && std::strcmp(argv[1], "handoff") != 0)) {
        std::fprintf(stderr, "usage: %s cpu|handoff MODEL.gguf\n", argv[0]);
        return 2;
    }
    const bool handoff = std::strcmp(argv[1], "handoff") == 0;
    const char * model_path = argv[2];

    ggml_backend_load_all();
    llama_backend_init();

    const int64_t all_start = llama_time_us();
    llama_model_params cpu_mp = llama_model_default_params();
    cpu_mp.n_gpu_layers = 0;
    cpu_mp.load_mtp = true;
    model_ptr cpu_model(llama_model_load_from_file(model_path, cpu_mp), llama_model_free);
    if (!cpu_model) return fail("load_cpu_model");
    const int64_t cpu_model_loaded = llama_time_us();
    if (llama_model_n_layer_nextn(cpu_model.get()) != 1) return fail("embedded_mtp_layer_count");

    model_ptr gpu_model(nullptr, llama_model_free);
    if (handoff) {
        llama_model_params gpu_mp = llama_model_default_params();
        gpu_mp.n_gpu_layers = 999;
        gpu_mp.load_mtp = true;
        gpu_model.reset(llama_model_load_from_file(model_path, gpu_mp));
        if (!gpu_model) return fail("load_gpu_model");
    }
    const int64_t models_loaded = llama_time_us();

    llama_model * source_model = handoff ? gpu_model.get() : cpu_model.get();
    context_ptr src_tgt(llama_init_from_model(source_model,
            context_params(handoff, false, LLAMA_CONTEXT_TYPE_DEFAULT)), llama_free);
    context_ptr src_mtp(llama_init_from_model(source_model,
            context_params(handoff, false, LLAMA_CONTEXT_TYPE_MTP)), llama_free);
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

    const std::vector<llama_token> prompt_tokens = {100, 101, 102, 103, 104, 105, 106};
    auto prompt = make_batch(prompt_tokens, 0);
    const int64_t active_start = llama_time_us();
    if (llama_decode(src_tgt.get(), prompt.batch) != 0) return fail("prefill_target");
    llama_synchronize(src_tgt.get());
    const int64_t prefill_target_done = llama_time_us();
    if (!common_speculative_process(spec.get(), prompt.batch)) return fail("prefill_mtp");
    llama_synchronize(src_mtp.get());
    const int64_t prefill_mtp_done = llama_time_us();

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
                context_params(true, true, LLAMA_CONTEXT_TYPE_DEFAULT)));
        dst_mtp.reset(llama_init_from_model(cpu_model.get(),
                context_params(true, true, LLAMA_CONTEXT_TYPE_MTP)));
        if (!dst_tgt || !dst_mtp) return fail("init_destination_contexts");
        destination_init_us = llama_time_us() - init_start;

        const int64_t handoff_start = llama_time_us();
        if (!common_speculative_handoff_cpu(spec.get(), dst_tgt.get(), dst_mtp.get(),
                    src_tgt.get(), src_mtp.get(), &transfer)) return fail("handoff");
        handoff_us = llama_time_us() - handoff_start;
        if (transfer.copied_bytes != 0 || transfer.shared_bytes == 0) return fail("copy_accounting");

        const int64_t release_start = llama_time_us();
        src_mtp.reset();
        src_tgt.reset();
        gpu_model.reset();
        source_release_us = llama_time_us() - release_start;
        active_tgt = dst_tgt.get();
        active_mtp = dst_mtp.get();
    }

    auto next = make_batch({107}, 7);
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
    if (target_pos != 7 || mtp_pos != 7) return fail("final_positions");

    std::printf(
        "QUALIFY_RESULT profile=%s tokens_prefill=7 tokens_continue=1 n_rs_seq=3 "
        "load_cpu_us=%lld load_gpu_us=%lld init_source_us=%lld prefill_target_us=%lld "
        "prefill_mtp_us=%lld destination_init_us=%lld handoff_us=%lld source_release_us=%lld "
        "continuation_target_us=%lld continuation_mtp_us=%lld active_wall_us=%lld "
        "shared_bytes=%zu copied_bytes=%zu target_pos=%d mtp_pos=%d "
        "logits_finite=1 logits_top_id=%d logits_top_value=%.9g logits_hash=%016llx total_us=%lld\n",
        handoff ? "handoff" : "cpu",
        (long long) (cpu_model_loaded - all_start),
        (long long) (models_loaded - cpu_model_loaded),
        (long long) (contexts_ready - models_loaded),
        (long long) (prefill_target_done - active_start),
        (long long) (prefill_mtp_done - prefill_target_done),
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
