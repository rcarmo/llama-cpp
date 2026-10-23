#include "chat.h"
#include "common.h"
#include "sampling.h"
#include "llama.h"
#include "llama-model.h"
#include "llama-context.h"
#include "llama-moe-cache.h"
#include "ggml-backend.h"
#include "ggml-cpu.h"
#include "nlohmann/json.hpp"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <cstring>
#include <map>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

using model_ptr = std::unique_ptr<llama_model, decltype(&llama_model_free)>;
using context_ptr = std::unique_ptr<llama_context, decltype(&llama_free)>;

static void require(bool ok, const char * message) {
    if (!ok) throw std::runtime_error(message);
}

static void decode(llama_context * ctx, const std::vector<llama_token> & tokens, int pos) {
    auto batch = llama_batch_init(tokens.size(), 0, 1);
    for (int i = 0; i < (int) tokens.size(); ++i) {
        batch.token[i] = tokens[i]; batch.pos[i] = pos + i;
        batch.n_seq_id[i] = 1; batch.seq_id[i][0] = 0;
        batch.logits[i] = i + 1 == (int) tokens.size();
    }
    batch.n_tokens = tokens.size();
    const int rc = llama_decode(ctx, batch);
    llama_batch_free(batch);
    require(rc == 0, "decode");
    llama_synchronize(ctx);
}

static std::vector<uint8_t> save(llama_context * ctx) {
    const size_t size = llama_state_seq_get_size(ctx, 0);
    std::vector<uint8_t> data(size);
    require(size && llama_state_seq_get_data(ctx, data.data(), size, 0) == size, "save");
    return data;
}

static void restore(llama_context * ctx, const std::vector<uint8_t> & data) {
    require(llama_state_seq_set_data(ctx, data.data(), data.size(), 0) == data.size(), "restore");
}

static uint64_t compare(llama_context * a, llama_context * b, int n_vocab) {
    const auto * x = llama_get_logits(a);
    const auto * y = llama_get_logits(b);
    require(x && y, "logits");
    uint64_t hash = UINT64_C(1469598103934665603);
    for (int i = 0; i < n_vocab; ++i) {
        require(std::isfinite(x[i]) && std::isfinite(y[i]), "nonfinite logits");
        require(std::memcmp(x + i, y + i, sizeof(float)) == 0, "same-state CPU logit mismatch");
        uint32_t bits; std::memcpy(&bits, x + i, sizeof(bits));
        hash ^= bits; hash *= UINT64_C(1099511628211);
    }
    return hash;
}

static void placement(const char * label, const llama_model * model) {
    std::map<std::string, size_t> weights, experts;
    for (const auto & entry : model->tensors_by_name) {
        auto * t = entry.second;
        const std::string name = t->buffer ? ggml_backend_buffer_name(t->buffer) : "NONE";
        weights[name] += ggml_nbytes(t);
        if (entry.first.find("_exps.weight") != std::string::npos) experts[name] += ggml_nbytes(t);
    }
    for (const auto & entry : weights) {
        std::printf("PLACEMENT owner=%s backend=%s weights=%zu experts=%zu\n", label, entry.first.c_str(), entry.second, experts[entry.first]);
    }
    for (const auto & entry : model->memory_breakdown()) {
        std::printf("MODEL_ALLOC owner=%s backend=%s bytes=%zu\n", label, ggml_backend_buft_name(entry.first), entry.second);
    }
    std::fflush(stdout);
}

static int setting(const char * name, int fallback) {
    const char * value = std::getenv(name);
    return value ? std::stoi(value) : fallback;
}

static llama_context_params context_params(bool gpu, int n_ctx, int cache_mib) {
    auto p = llama_context_default_params();
    p.n_ctx = n_ctx; p.n_batch = 512; p.n_ubatch = 128;
    p.n_seq_max = 1; p.n_threads = 4; p.n_threads_batch = 4;
    p.type_k = GGML_TYPE_F16; p.type_v = GGML_TYPE_F16;
    p.flash_attn_type = LLAMA_FLASH_ATTN_TYPE_DISABLED;
    p.offload_kqv = gpu; p.op_offload = gpu; p.kv_cpu_shared = gpu;
    p.moe_cache_size = size_t(cache_mib) * 1024 * 1024;
    p.n_threads = setting("FLINT_THREADS", 4);
    p.n_threads_batch = setting("FLINT_BATCH_THREADS", p.n_threads);
    p.n_ubatch = setting("FLINT_UBATCH", 128);
    if (setting("FLINT_FA", 0)) p.flash_attn_type = LLAMA_FLASH_ATTN_TYPE_ENABLED;
    p.sched_async_cpu = setting("FLINT_ASYNC", 0);
    return p;
}

class trial_threadpools {
    llama_context * ctx;
    decltype(ggml_threadpool_free) * pool_free = nullptr;
    ggml_threadpool_t pool = nullptr, batch_pool = nullptr;
public:
    explicit trial_threadpools(llama_context * context) : ctx(context) {}
    void attach() {
    auto cpu_reg = ggml_backend_reg_by_name("CPU"); require(cpu_reg != nullptr, "CPU backend");
    auto pool_new = (decltype(ggml_threadpool_new) *) ggml_backend_reg_get_proc_address(cpu_reg, "ggml_threadpool_new");
    pool_free = (decltype(ggml_threadpool_free) *) ggml_backend_reg_get_proc_address(cpu_reg, "ggml_threadpool_free");
    if (setting("FLINT_POOL", 0)) {
        require(pool_new && pool_free, "threadpool API");
        auto params = ggml_threadpool_params_default(setting("FLINT_THREADS", 4));
        params.poll = 50;
        if (setting("FLINT_POOL", 0) == 2) {
            require(setting("FLINT_THREADS", 4) == 4, "four P-core worker mask");
            for (int i = 0; i < GGML_MAX_N_THREADS; ++i) params.cpumask[i] = i == 0 || i == 2 || i == 4 || i == 6;
            params.strict_cpu = true;
            auto batch_params = ggml_threadpool_params_default(setting("FLINT_BATCH_THREADS",16));
            for (int i = 0; i < GGML_MAX_N_THREADS; ++i) batch_params.cpumask[i] = i < 16;
            batch_params.poll = 50;
            batch_pool = pool_new(&batch_params); require(batch_pool != nullptr, "batch threadpool allocation");
        }
        pool = pool_new(&params); require(pool != nullptr, "threadpool allocation");
        llama_attach_threadpool(ctx, pool, batch_pool);
    }

    }
    ~trial_threadpools() {
        if (pool) { llama_detach_threadpool(ctx); pool_free(pool); }
        if (batch_pool) pool_free(batch_pool);
    }
};

static void benchmark(llama_context * ctx, const llama_model * model, const llama_vocab * vocab, bool gpu, int cache_mib) {
    const int count = setting("FLINT_PROMPT", 512), generated = setting("FLINT_DECODE", 64), reps = setting("FLINT_REPS", 2);
    require(count >= 32 && count + generated < 2048 && generated > 0 && reps > 0 && reps <= 4, "benchmark bounds");
    std::string text;
    const std::string fixture = "// Stable deduplication and verification.\nfunction uniqueStable(items) {\n  const seen = new Set();\n  return items.filter(item => {\n    if (seen.has(item)) return false;\n    seen.add(item);\n    return true;\n  });\n}\nconst input = [3, 1, 3, 2, 1];\nconst expected = [3, 1, 2];\nconsole.assert(JSON.stringify(uniqueStable(input)) === JSON.stringify(expected));\nExplain why insertion order and identity are preserved.\n";
    while (text.size() < size_t(count + generated) * 10) text += fixture;
    auto tokens = common_tokenize(vocab, text, true, true);
    require(tokens.size() >= size_t(count + generated), "fixture length");
    const int n_vocab = llama_vocab_n_tokens(vocab);
    auto finite = [&]() {
        const auto * logits = llama_get_logits(ctx); require(logits != nullptr, "benchmark logits");
        for (int i = 0; i < n_vocab; ++i) require(std::isfinite(logits[i]), "benchmark nonfinite logits");
    };
    trial_threadpools pools(ctx); pools.attach();
    std::printf("BENCH_CONFIG mode=%s cache_mib=%d threads=%d batch_threads=%d ubatch=%d fa=%d pool=%d async=%d prompt=%d decode=%d reps=%d\n", gpu ? "gpu" : "cpu", cache_mib, setting("FLINT_THREADS",4), setting("FLINT_BATCH_THREADS",setting("FLINT_THREADS",4)), setting("FLINT_UBATCH",128), setting("FLINT_FA",0), setting("FLINT_POOL",0), setting("FLINT_ASYNC",0), count, generated, reps);
    std::fflush(stdout);
    decode(ctx, {tokens.begin(), tokens.begin()+8}, 0); finite();
    for (int rep = 0; rep < reps; ++rep) {
        llama_memory_clear(llama_get_memory(ctx), true);
        const auto start = llama_time_us();
        for (int pos = 0; pos < count; pos += 512) {
            const int end = std::min(pos + 512, count);
            decode(ctx, {tokens.begin()+pos, tokens.begin()+end}, pos);
        }
        const auto prefilled = llama_time_us(); finite();
        int64_t decode_us = 0; uint64_t hash = UINT64_C(1469598103934665603);
        for (int i = 0; i < generated; ++i) {
            const auto step_start = llama_time_us();
            decode(ctx, {tokens[count+i]}, count+i);
            decode_us += llama_time_us()-step_start;
            finite();
            const auto * logits = llama_get_logits(ctx);
            const int best = std::max_element(logits, logits+n_vocab)-logits;
            hash ^= uint64_t(best); hash *= UINT64_C(1099511628211);
        }
        const auto done = llama_time_us();
        ctx->print_moe_cache_stats("benchmark");
        const double pp_ms = double(prefilled-start)/1000, tg_ms = double(decode_us)/1000;
        std::printf("BENCH_RESULT rep=%d prompt=%d generated=%d pp_ms=%.3f tg_ms=%.3f pp_tps=%.6f tg_tps=%.6f wall_ms=%.3f hash=%llu finite=1\n", rep, count, generated, pp_ms, tg_ms, count*1000/pp_ms, generated*1000/tg_ms, double(done-start)/1000, (unsigned long long)hash);
        std::fflush(stdout);
    }
    (void) model;
}


static void coding(llama_context * ctx, const llama_model * model, const llama_vocab * vocab) {
    const char * input_path = std::getenv("FLINT_CODING_CASE"), * output_path = std::getenv("FLINT_CODING_OUTPUT");
    require(input_path && output_path, "coding paths");
    std::ifstream input(input_path); require(input.good(), "coding input");
    nlohmann::json spec; input >> spec;
    auto tmpls = common_chat_templates_init(model, "");
    common_chat_templates_inputs inputs;
    common_chat_msg user; user.role = "user"; user.content = spec.at("prompt").get<std::string>();
    inputs.messages.push_back(user); inputs.enable_thinking = false;
    common_chat_session session(tmpls.get(), vocab, inputs);
    const auto prompt = common_tokenize(vocab, session.prompt().str(), true, true);
    constexpr int max_output = 1024;
    require(!prompt.empty() && prompt.size()+max_output < 2048, "coding context budget");
    common_params_sampling sampling;
    sampling.temp = 1; sampling.top_k = 20; sampling.top_p = 0.95f; sampling.min_p = 0; sampling.seed = 42;
    session.apply_sampling(sampling);
    common_sampler_ptr sampler(common_sampler_init(model, sampling)); require(bool(sampler), "coding sampler");
    trial_threadpools pools(ctx); pools.attach();
    auto finite = [&]() {
        const float * logits = llama_get_logits(ctx); require(logits != nullptr, "coding logits");
        for (int i = 0; i < llama_vocab_n_tokens(vocab); ++i) require(std::isfinite(logits[i]), "coding nonfinite logits");
    };
    const auto start = llama_time_us();
    decode(ctx, prompt, 0); finite();
    const auto prefilled = llama_time_us();
    common_chat_input generated_input; int generated = 0; bool eog = false;
    int64_t decode_us = 0; double first_token_ms = 0;
    for (; generated < max_output; ++generated) {
        const auto token = common_sampler_sample(sampler.get(), ctx, -1);
        common_sampler_accept(sampler.get(), token, true);
        if (!generated) first_token_ms = double(llama_time_us()-start)/1000;
        if (llama_vocab_is_eog(vocab, token)) { eog = true; break; }
        generated_input.append(common_token_to_piece(vocab, token), token);
        const auto step = llama_time_us();
        decode(ctx, {token}, prompt.size()+generated); decode_us += llama_time_us()-step;
        finite();
    }
    const auto finished = llama_time_us();
    const auto & parsed = session.finish(generated_input);
    nlohmann::json result = {
        {"id",spec.at("id")}, {"prompt",prompt.size()}, {"generated",generated}, {"max_output",max_output},
        {"stop",eog?"eog":"limit"}, {"raw",generated_input.text}, {"content",parsed.content}, {"reasoning",parsed.reasoning_content},
        {"pp_ms",double(prefilled-start)/1000}, {"tg_ms",double(finished-prefilled)/1000},
        {"decode_only_ms",double(decode_us)/1000}, {"wall_ms",double(finished-start)/1000}, {"first_token_ms",first_token_ms},
        {"finite",true}, {"thinking",false}, {"seed",42}, {"temp",1}, {"top_k",20}, {"top_p",0.95}, {"min_p",0}
    };
    std::ofstream output(output_path); require(output.good(), "coding output"); output << result.dump(2) << '\n'; output.close();
    std::printf("CODING_RESULT id=%s generated=%d stop=%s pp_ms=%.3f tg_ms=%.3f finite=1\n",spec.at("id").get<std::string>().c_str(),generated,eog?"eog":"limit",double(prefilled-start)/1000,double(finished-prefilled)/1000);
}

static void test_override_admission(const char * path) {
    auto params = llama_model_default_params();
    params.n_gpu_layers = 0; params.no_host = true; params.load_mode = LLAMA_LOAD_MODE_MMAP;
    auto canonical = llm_ffn_exps_cpu_override();
    llama_model_tensor_buft_override allowed[] = { canonical, {nullptr, nullptr} };
    params.tensor_buft_overrides = allowed;
    model_ptr model(llama_model_load_from_file(path, params), llama_model_free);
    require(model && model->handoff_safe_tensor_placement(), "canonical override rejected");
    const auto arch = model->arch; model->arch = LLM_ARCH_QWEN35MOE;
    require(!model->handoff_safe_tensor_placement(), "non-Flint override admitted"); model->arch = arch;
    model.reset();
    llama_model_tensor_buft_override arbitrary[] = { {".*", ggml_backend_cpu_buffer_type()}, {nullptr, nullptr} };
    params.tensor_buft_overrides = arbitrary;
    model.reset(llama_model_load_from_file(path, params));
    require(model && !model->handoff_safe_tensor_placement(), "arbitrary override admitted"); model.reset();
    llama_model_tensor_buft_override extra[] = { canonical, {"token_embd", ggml_backend_cpu_buffer_type()}, {nullptr, nullptr} };
    params.tensor_buft_overrides = extra;
    model.reset(llama_model_load_from_file(path, params));
    require(model && !model->handoff_safe_tensor_placement(), "multiple overrides admitted");
}

static bool abort_all(void *) { return true; }

int main(int argc, char ** argv) {
    if (argc < 3) {
        std::fprintf(stderr, "Usage: %s MODEL cpu|gpu [cache_mib=0] [fixed|chat|synthetic|bench|coding]\n", argv[0]);
        return 2;
    }
    try {
        ggml_backend_load_all(); llama_backend_init();
        const std::string mode = argv[2], task = argc > 4 ? argv[4] : "fixed";
        const bool gpu = mode == "gpu", synthetic = task == "synthetic", chat = task == "chat";
        require(gpu || mode == "cpu", "mode");
        const int cache_mib = argc > 3 ? std::stoi(argv[3]) : 0;
        require(cache_mib >= 0 && cache_mib <= 4096, "limits");
        const int n_ctx = synthetic ? 768 : 2048;
        if (synthetic) test_override_admission(argv[1]);
        const auto start = llama_time_us();
        auto mp = llama_model_default_params(); mp.n_gpu_layers = 0;
        mp.no_host = true;
        mp.load_mode = LLAMA_LOAD_MODE_MMAP;
        std::printf("PHASE cpu_model_load\n"); std::fflush(stdout);
        model_ptr cpu(llama_model_load_from_file(argv[1], mp), llama_model_free);
        require(cpu && cpu->arch == LLM_ARCH_FLINT, "Flint CPU load");
        const auto cpu_loaded = llama_time_us();
        placement("cpu", cpu.get());
        const auto * vocab = llama_model_get_vocab(cpu.get());
        const int n_vocab = llama_vocab_n_tokens(vocab);
        auto cp = context_params(false, n_ctx, 0);
        model_ptr source_model(nullptr, llama_model_free);
        context_ptr source(nullptr, llama_free);
        auto expert = llm_ffn_exps_cpu_override();
        llama_model_tensor_buft_override overrides[] = { expert, {nullptr, nullptr} };
        if (gpu) {
            mp.n_gpu_layers = 999;
            mp.tensor_buft_overrides = overrides;
            std::printf("PHASE gpu_dense_kv_load experts=CPU selected_expert_cache_mib=%d\n", cache_mib); std::fflush(stdout);
            source_model.reset(llama_model_load_from_file(argv[1], mp));
            require(bool(source_model), "GPU model load");
            require(source_model->handoff_safe_tensor_placement(), "expert placement admission");
            placement("gpu", source_model.get());
            auto gp = context_params(true, n_ctx, cache_mib);
            source.reset(llama_init_from_model(source_model.get(), gp));
        } else {
            source.reset(llama_init_from_model(cpu.get(), cp));
        }
        require(bool(source), "source context");
        const auto source_ready = llama_time_us();
        if (task == "coding") {
            require(!gpu && cache_mib == 0, "coding CPU-only");
            coding(source.get(), cpu.get(), vocab);
            source.reset(); cpu.reset(); llama_backend_free();
            std::printf("RESULT PASS coding native execution; score separately\n");
            return 0;
        }
        if (task == "bench") {
            benchmark(source.get(), gpu ? source_model.get() : cpu.get(), vocab, gpu, cache_mib);
            source.reset(); source_model.reset(); cpu.reset(); llama_backend_free();
            std::printf("RESULT PASS benchmark\n");
            return 0;
        }
        for (const auto & entry : source->get_memory()->memory_breakdown()) {
            std::printf("KV_ALLOC backend=%s bytes=%zu\n", ggml_backend_buft_name(entry.first), entry.second);
        }
        std::vector<llama_token> prompt;
        common_chat_templates_ptr tmpls;
        std::unique_ptr<common_chat_session> session;
        if (chat) {
            tmpls = common_chat_templates_init(cpu.get(), "");
            common_chat_templates_inputs inputs;
            common_chat_msg user; user.role = "user";
            user.content = "Implement a JavaScript function uniqueStable(items) that preserves the first occurrence of each primitive value. Return only a fenced JavaScript code block containing the function.";
            inputs.messages.push_back(user); inputs.enable_thinking = true;
            session = std::make_unique<common_chat_session>(tmpls.get(), vocab, inputs);
            prompt = common_tokenize(vocab, session->prompt().str(), true, true);
        } else {
            const int count = synthetic ? 80 : 256;
            for (int i = 0; i < count; ++i) prompt.push_back(32 + i % 64);
        }
        auto prefill_tokens = prompt;
        if (chat) { require(prompt.size() > 1, "chat prompt"); prefill_tokens.pop_back(); }
        std::printf("PHASE prefill tokens=%zu\n", prefill_tokens.size()); std::fflush(stdout);
        decode(source.get(), prefill_tokens, 0);
        const auto prefill_done = llama_time_us();
        source->print_moe_cache_stats("after_prefill");
        const auto append_start = llama_time_us();
        int append_pos = prefill_tokens.size();
        if (!chat) {
            for (int i = 0; i < 16; ++i) decode(source.get(), {llama_token(48 + i)}, append_pos++);
        }
        const auto append_done = llama_time_us();
        source->print_moe_cache_stats("after_gpu_append");
        // Serialized reference is diagnostic only; production state handoff stays in memory.
        auto snapshot = save(source.get());
        const auto snapshot_done = llama_time_us();
        context_ptr dst(llama_init_from_model(cpu.get(), cp), llama_free);
        require(bool(dst), "destination");
        if (synthetic) {
            auto before = save(source.get());
            llama_kv_handoff_result rejected {};
            llama_set_abort_callback(dst.get(), abort_all, nullptr);
            require(!llama_kv_handoff_cpu(dst.get(), source.get(), !gpu, &rejected), "abort accepted");
            require(!rejected.shared_bytes && !rejected.copied_bytes && save(source.get()) == before, "abort mutation");
            llama_set_abort_callback(dst.get(), nullptr, nullptr);
            auto other = context_params(false, n_ctx + 256, 0);
            context_ptr mismatch(llama_init_from_model(cpu.get(), other), llama_free);
            require(mismatch && !llama_kv_handoff_cpu(mismatch.get(), source.get(), true, &rejected), "mismatch accepted");
            require(save(source.get()) == before, "mismatch source mutation");
        }
        const auto handoff_start = llama_time_us();
        llama_kv_handoff_result transfer {};
        require(llama_kv_handoff_cpu(dst.get(), source.get(), !gpu, &transfer), "handoff");
        require(gpu ? transfer.shared_bytes > 0 && transfer.copied_bytes == 0 : transfer.shared_bytes == 0 && transfer.copied_bytes > 0, "handoff accounting");
        require(!llama_get_memory(source.get()), "source not consumed");
        llama_kv_handoff_result twice {};
        require(!llama_kv_handoff_cpu(dst.get(), source.get(), !gpu, &twice), "second handoff accepted");
        const auto handoff_done = llama_time_us();
        source.reset(); source_model.reset();
        const auto source_released = llama_time_us();
        std::printf("HANDOFF shared=%zu copied=%zu source_owner_released=1\n", transfer.shared_bytes, transfer.copied_bytes); std::fflush(stdout);
        context_ptr reference(llama_init_from_model(cpu.get(), cp), llama_free);
        require(bool(reference), "reference context"); restore(reference.get(), snapshot);
        uint64_t hash = 0; int pos = append_pos;
        const int steps = chat ? 0 : synthetic ? 600 : 3;
        const auto comparison_start = llama_time_us();
        for (int i = 0; i < steps; ++i) {
            const std::vector<llama_token> token { llama_token(32 + i % 64) };
            decode(dst.get(), token, pos); decode(reference.get(), token, pos); ++pos;
            hash ^= compare(dst.get(), reference.get(), n_vocab);
        }
        const auto comparison_done = llama_time_us();
        reference.reset(); snapshot.clear(); snapshot.shrink_to_fit();
        double decode_ms = 0; int generated = 0; std::string output;
        if (chat) {
            // Handoff consumes KV state, not logits; evaluate the pending prompt token here.
            decode(dst.get(), {prompt.back()}, pos++);
            common_params_sampling sampling;
            sampling.temp = 1; sampling.top_k = 20; sampling.top_p = 0.95f; sampling.min_p = 0; sampling.seed = 42;
            sampling.reasoning_budget_tokens = 128; sampling.reasoning_budget_message = "Conclude your reasoning and provide the final answer now.";
            session->apply_sampling(sampling);
            common_sampler_ptr sampler(common_sampler_init(cpu.get(), sampling));
            require(bool(sampler), "sampler");
            const auto generation_start = llama_time_us();
            for (; generated < 384; ++generated) {
                const auto token = common_sampler_sample(sampler.get(), dst.get(), -1);
                common_sampler_accept(sampler.get(), token, true);
                if (llama_vocab_is_eog(vocab, token)) break;
                const std::string piece = common_token_to_piece(vocab, token);
                output += piece;
                decode(dst.get(), {token}, pos++);
            }
            decode_ms = double(llama_time_us() - generation_start) / 1000;
            std::printf("OUTPUT_BEGIN\n%s\nOUTPUT_END\n", output.c_str());
        } else {
            const auto generation_start = llama_time_us();
            for (int i = 0; i < 16; ++i) { decode(dst.get(), {llama_token(40 + i)}, pos++); ++generated; }
            decode_ms = double(llama_time_us() - generation_start) / 1000;
        }
        std::printf("RESULT PASS mode=%s experts=CPU cache_mib=%d prompt=%zu compared=%d vocab=%d hash=%llu shared=%zu copied=%zu cpu_load_ms=%.3f source_setup_ms=%.3f prefill_ms=%.3f snapshot_ms=%.3f source_append_ms=%.3f handoff_ms=%.3f release_ms=%.3f compare_ms=%.3f generated=%d decode_ms=%.3f active_ms=%.3f\n",
                mode.c_str(), cache_mib, prompt.size(), steps, n_vocab, (unsigned long long) hash, transfer.shared_bytes, transfer.copied_bytes,
                double(cpu_loaded-start)/1000, double(source_ready-cpu_loaded)/1000, double(prefill_done-source_ready)/1000,
                double(snapshot_done-append_done)/1000, double(append_done-append_start)/1000, double(handoff_done-handoff_start)/1000, double(source_released-handoff_done)/1000,
                double(comparison_done-comparison_start)/1000, generated, decode_ms, double(prefill_done-source_ready+append_done-append_start+handoff_done-handoff_start+source_released-handoff_done)/1000+decode_ms);
        dst.reset(); cpu.reset(); llama_backend_free();
        return 0;
    } catch (const std::exception & e) {
        std::fprintf(stderr, "RESULT FAIL %s\n", e.what()); return 1;
    }
}
