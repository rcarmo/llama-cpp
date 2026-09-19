#include "build-info.h"
#include "chat.h"
#include "common.h"
#include "ggml-backend.h"
#include "llama.h"
#include "sampling.h"
#include "server-http.h"
#include "session-policy.h"
#include "speculative.h"

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cmath>
#include <condition_variable>
#include <csignal>
#include <cstdio>
#include <ctime>
#include <deque>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>

using gemma_hybrid::json;
using model_ptr = std::unique_ptr<llama_model, decltype(&llama_model_free)>;
using context_ptr = std::unique_ptr<llama_context, decltype(&llama_free)>;
using clock_type = std::chrono::steady_clock;

static std::atomic<bool> g_stop(false);
static std::atomic<uint64_t> g_completion_id(0);
static server_http_context * g_http = nullptr;

static void signal_handler(int) {
    g_stop.store(true);
    if (g_http) {
        g_http->stop();
    }
}

static double elapsed_s(clock_type::time_point start) {
    return std::chrono::duration<double>(clock_type::now() - start).count();
}

static std::vector<llama_token> tokenize(const llama_vocab * vocab, const std::string & text) {
    const int32_t count = -llama_tokenize(vocab, text.data(), text.size(), nullptr, 0, true, true);
    if (count < 1) {
        throw std::runtime_error("token count failed");
    }
    std::vector<llama_token> result(count);
    if (llama_tokenize(vocab, text.data(), text.size(), result.data(), count, true, true) != count) {
        throw std::runtime_error("tokenization failed");
    }
    return result;
}

static json chat_delta(const common_chat_msg_diff & diff) {
    json delta = json::object();
    if (!diff.reasoning_content_delta.empty()) {
        delta["reasoning_content"] = diff.reasoning_content_delta;
    }
    if (!diff.content_delta.empty()) {
        delta["content"] = diff.content_delta;
    }
    if (diff.tool_call_index != std::string::npos) {
        json call;
        call["index"] = diff.tool_call_index;
        if (!diff.tool_call_delta.id.empty()) {
            call["id"] = diff.tool_call_delta.id;
            call["type"] = "function";
        }
        if (!diff.tool_call_delta.name.empty() || !diff.tool_call_delta.arguments.empty()) {
            json function = json::object();
            if (!diff.tool_call_delta.name.empty()) {
                function["name"] = diff.tool_call_delta.name;
            }
            if (!diff.tool_call_delta.arguments.empty()) {
                function["arguments"] = diff.tool_call_delta.arguments;
            }
            call["function"] = function;
        }
        delta["tool_calls"] = json::array({call});
    }
    return delta;
}

static std::string token_piece(const llama_vocab * vocab, llama_token token) {
    std::vector<char> data(256);
    int32_t size = llama_token_to_piece(vocab, token, data.data(), data.size(), 0, true);
    if (size < 0) {
        data.resize(-size);
        size = llama_token_to_piece(vocab, token, data.data(), data.size(), 0, true);
    }
    if (size < 0) {
        throw std::runtime_error("token conversion failed");
    }
    return std::string(data.data(), size);
}

static size_t input_prefix(const llama_vocab * vocab, const common_chat_params & chat, const std::vector<llama_token> & prompt) {
    std::string text = chat.prompt;
    if (text.size() < chat.generation_prompt.size() || text.compare(text.size() - chat.generation_prompt.size(), chat.generation_prompt.size(), chat.generation_prompt) != 0) {
        throw std::runtime_error("generation suffix mismatch");
    }
    text.resize(text.size() - chat.generation_prompt.size());
    const std::string close = "<turn|>\n";
    if (chat.format == COMMON_CHAT_FORMAT_PEG_GEMMA4 && text.size() >= close.size() && text.compare(text.size() - close.size(), close.size(), close) == 0) {
        text.resize(text.size() - close.size());
    }
    const auto prefix = tokenize(vocab, text);
    size_t count = 0;
    while (count < prefix.size() && count < prompt.size() && prefix[count] == prompt[count]) {
        ++count;
    }
    return count;
}

struct config {
    std::string model_path;
    std::string draft_path;
    std::string alias = "gemma-4-e4b-qat-mtp-zero-copy";
    std::string host = "127.0.0.1";
    int32_t port = 18094;
    int32_t context = 32768;
    int32_t batch = 256;
    int32_t ubatch = 256;
    int32_t threads = 8;
    int32_t threads_batch = 16;
    int32_t draft_max = 3;
    int32_t draft_min = 1;
    int32_t max_output = 2048;
    bool threadpools = false;
    bool model_sampling = true;
};

static void usage(const char * name) {
    std::fprintf(stderr, "usage: %s --model MODEL.gguf [--draft ASSISTANT.gguf] [--host HOST] [--port PORT] [--alias NAME] [--ctx-size N] [--batch-size N] [--ubatch-size N] [--threads N] [--threads-batch N] [--draft-max N] [--draft-min N] [--threadpools 0|1] [--model-sampling 0|1] [--max-output N]\n", name);
}

static config parse_args(int argc, char ** argv) {
    config result;
    for (int i = 1; i < argc; ++i) {
        const std::string key = argv[i];
        if (key == "--help" || key == "-h") {
            usage(argv[0]);
            std::exit(0);
        }
        if (i + 1 >= argc) {
            throw std::invalid_argument("missing value for " + key);
        }
        const std::string value = argv[++i];
        if (key == "--model") result.model_path = value;
        else if (key == "--draft") result.draft_path = value;
        else if (key == "--host") result.host = value;
        else if (key == "--port") result.port = std::stoi(value);
        else if (key == "--alias") result.alias = value;
        else if (key == "--ctx-size") result.context = std::stoi(value);
        else if (key == "--batch-size") result.batch = std::stoi(value);
        else if (key == "--ubatch-size") result.ubatch = std::stoi(value);
        else if (key == "--threads") result.threads = std::stoi(value);
        else if (key == "--threads-batch") result.threads_batch = std::stoi(value);
        else if (key == "--draft-max") result.draft_max = std::stoi(value);
        else if (key == "--draft-min") result.draft_min = std::stoi(value);
        else if (key == "--threadpools") {
            const int parsed = std::stoi(value);
            if (parsed != 0 && parsed != 1) throw std::invalid_argument("--threadpools must be 0 or 1");
            result.threadpools = parsed == 1;
        } else if (key == "--model-sampling") {
            const int parsed = std::stoi(value);
            if (parsed != 0 && parsed != 1) throw std::invalid_argument("--model-sampling must be 0 or 1");
            result.model_sampling = parsed == 1;
        } else if (key == "--max-output") result.max_output = std::stoi(value);
        else throw std::invalid_argument("unknown option " + key);
    }
    if (result.model_path.empty()) {
        throw std::invalid_argument("--model is required");
    }
    if (result.port < 1 || result.port > 65535 || result.context < 1024 || result.batch < 32 || result.ubatch < 32 || result.ubatch > result.batch || result.threads < 1 || result.threads_batch < 1 || result.draft_max < 1 || result.draft_max > 16 || result.draft_min < 0 || result.draft_min > result.draft_max || result.max_output < 1) {
        throw std::invalid_argument("invalid numeric option");
    }
    return result;
}

struct stream_callbacks {
    std::function<void(size_t, size_t, size_t, double)> prompt_progress;
    std::function<void(const std::vector<common_chat_msg_diff> &, size_t, double)> token_deltas;
};

class persistent_session {
public:
    explicit persistent_session(config cfg) : cfg(std::move(cfg)) {
        load_models();
    }

    json complete(
            json request,
            const std::string & conversation,
            const std::function<bool()> & should_stop,
            const stream_callbacks * callbacks = nullptr,
            const std::string & completion_id = {}) {
        const uint64_t epoch = cancel_epoch.load();
        const std::function<bool()> cancelled = [&] { return should_stop() || cancel_epoch.load() != epoch; };
        std::unique_lock<std::timed_mutex> lock(mutex, std::defer_lock);
        while (!lock.try_lock_for(std::chrono::milliseconds(100))) {
            if (cancelled()) throw std::runtime_error("request cancelled");
        }
        if (cancelled()) throw std::runtime_error("request cancelled");
        gemma_hybrid::normalize_request(request);
        gemma_hybrid::normalize_tool_choice(request);
        const auto action = gemma_hybrid::classify_request(active_conversation, conversation, committed, prior_tools, request);
        if (action == gemma_hybrid::request_action::start) {
            reset_runtime();
            active_conversation = conversation;
        } else {
            gemma_hybrid::check_append(committed, prior_tools, request);
        }
        try {
            return run_turn(request, cancelled, callbacks, completion_id);
        } catch (...) {
            reset_runtime();
            active_conversation.clear();
            throw;
        }
    }

    json status() const {
        std::unique_lock<std::timed_mutex> lock(mutex, std::defer_lock);
        if (!lock.try_lock_for(std::chrono::milliseconds(100))) {
            return {{"status", "ok"}, {"model", cfg.alias}, {"context_size", cfg.context}, {"processing", true}};
        }
        return {
            {"status", "ok"},
            {"model", cfg.alias},
            {"context_size", cfg.context},
            {"processing", false},
            {"round", round},
            {"zero_copy_ready", current_zero_copy_ready},
            {"mode", target_only() ? "qwen35-target" : "gemma4-mtp"},
            {"handoffs", handoffs},
            {"shared_bytes", total_shared_bytes},
            {"copied_bytes", total_copied_bytes},
            {"vulkan_model_resident", gpu_target != nullptr},
        };
    }

    void reset(const std::string & conversation) {
        gemma_hybrid::require_reset_owner(active_conversation, conversation);
        cancel_epoch.fetch_add(1);
        std::lock_guard<std::timed_mutex> lock(mutex);
        gemma_hybrid::require_reset_owner(active_conversation, conversation);
        reset_runtime();
        active_conversation.clear();
    }

    const std::string & alias() const {
        return cfg.alias;
    }

    json props() const {
        std::vector<std::string> samplers;
        samplers.reserve(sampling_defaults.samplers.size());
        for (const auto sampler : sampling_defaults.samplers) {
            samplers.push_back(common_sampler_type_to_str(sampler));
        }
        return {
            {"default_generation_settings", {
                {"id", 0}, {"id_task", 0}, {"n_ctx", cfg.context}, {"speculative", !target_only()}, {"is_processing", false},
                {"params", {
                    {"n_predict", cfg.max_output}, {"max_tokens", cfg.max_output}, {"seed", sampling_defaults.seed},
                    {"temperature", sampling_defaults.temp}, {"top_k", sampling_defaults.top_k}, {"top_p", sampling_defaults.top_p}, {"min_p", sampling_defaults.min_p},
                    {"repeat_last_n", sampling_defaults.penalty_last_n}, {"repeat_penalty", sampling_defaults.penalty_repeat},
                    {"presence_penalty", sampling_defaults.penalty_present}, {"frequency_penalty", sampling_defaults.penalty_freq},
                    {"ignore_eos", sampling_defaults.ignore_eos}, {"stream", false}, {"samplers", samplers},
                    {"backend_sampling", false}, {"speculative.n_max", target_only() ? 0 : cfg.draft_max}, {"speculative.n_min", target_only() ? 0 : cfg.draft_min},
                    {"threadpools", cfg.threadpools}, {"model_sampling", cfg.model_sampling}, {"timings_per_token", false}
                }},
                {"prompt", ""}, {"next_token", {{"has_next_token", false}, {"has_new_line", false}, {"n_remain", 0}, {"n_decoded", 0}, {"stopping_word", ""}}}
            }},
            {"total_slots", 1}, {"model_path", cfg.model_path}, {"role", "model"},
            {"modalities", {{"vision", false}, {"audio", false}, {"video", false}}},
            {"chat_template", common_chat_templates_source(templates.get())},
            {"bos_token", token_piece(llama_model_get_vocab(cpu_target.get()), llama_vocab_bos(llama_model_get_vocab(cpu_target.get())))},
            {"eos_token", token_piece(llama_model_get_vocab(cpu_target.get()), llama_vocab_eos(llama_model_get_vocab(cpu_target.get())))},
            {"build_info", llama_build_info()},
        };
    }

private:
    config cfg;
    mutable std::timed_mutex mutex;
    std::atomic<uint64_t> cancel_epoch{0};
    model_ptr cpu_target{nullptr, llama_model_free};
    model_ptr draft_model{nullptr, llama_model_free};
    model_ptr gpu_target{nullptr, llama_model_free};
    std::unique_ptr<common_threadpools> target_threadpools;
    std::unique_ptr<common_threadpools> draft_threadpools;
    context_ptr target_ctx{nullptr, llama_free};
    context_ptr draft_ctx{nullptr, llama_free};
    common_speculative_ptr speculative;
    common_chat_templates_ptr templates;
    common_params_sampling sampling_defaults;
    std::vector<llama_logit_bias> logit_bias_eog;
    std::vector<llama_token> history;
    json committed = json::array();
    json prior_tools = json::array();
    std::string active_conversation;
    size_t stable_prefix = 0;
    int32_t round = 0;
    size_t handoffs = 0;
    size_t total_shared_bytes = 0;
    size_t total_copied_bytes = 0;
    bool current_zero_copy_ready = false;

    bool target_only() const {
        return cfg.draft_path.empty();
    }

    static model_ptr load_model(const std::string & path, bool gpu) {
        llama_model_params params = llama_model_default_params();
        params.n_gpu_layers = gpu ? 999 : 0;
        model_ptr model(llama_model_load_from_file(path.c_str(), params), llama_model_free);
        if (!model) {
            throw std::runtime_error("model load failed: " + path);
        }
        return model;
    }

    llama_context_params context_params(bool gpu, bool destination = false) const {
        llama_context_params params = llama_context_default_params();
        params.n_ctx = cfg.context;
        params.n_batch = cfg.batch;
        params.n_ubatch = cfg.ubatch;
        params.n_seq_max = 1;
        params.n_threads = cfg.threads;
        params.n_threads_batch = cfg.threads_batch;
        params.type_k = GGML_TYPE_F16;
        params.type_v = GGML_TYPE_F16;
        params.flash_attn_type = target_only() ? LLAMA_FLASH_ATTN_TYPE_ENABLED : LLAMA_FLASH_ATTN_TYPE_DISABLED;
        params.swa_full = false;
        params.offload_kqv = gpu;
        params.op_offload = gpu;
        params.kv_cpu_shared = gpu && !target_only();
        params.kv_handoff_strict = target_only() && (gpu || destination);
        params.kv_handoff_destination = target_only() && destination;
        params.n_rs_seq = target_only() ? 3 : 0;
        params.n_outputs_max = cfg.batch;
        params.n_outputs_max_per_seq = cfg.batch;
        return params;
    }

    common_params threadpool_params() const {
        common_params params;
        params.cpuparams.n_threads = cfg.threads;
        params.cpuparams_batch.n_threads = cfg.threads_batch;
        return params;
    }

    context_ptr make_context(llama_model * model, llama_context_params params, std::unique_ptr<common_threadpools> & threadpools) const {
        context_ptr context(llama_init_from_model(model, params), llama_free);
        if (!context) {
            throw std::runtime_error("context creation failed");
        }
        threadpools.reset();
        if (cfg.threadpools) {
            threadpools = std::make_unique<common_threadpools>();
            threadpools->init(context.get(), threadpool_params());
            if (!threadpools->initialized()) {
                llama_detach_threadpool(context.get());
                threadpools.reset();
                throw std::runtime_error("threadpool initialization failed");
            }
        }
        return context;
    }

    void reset_context(context_ptr & context, std::unique_ptr<common_threadpools> & threadpools) {
        if (context && threadpools) {
            llama_detach_threadpool(context.get());
        }
        context.reset();
        threadpools.reset();
    }

    void load_models() {
        cpu_target = load_model(cfg.model_path, false);
        if (!target_only()) {
            draft_model = load_model(cfg.draft_path, false);
        }
        gpu_target = load_model(cfg.model_path, true);
        char target_arch[64] = {};
        llama_model_meta_val_str(cpu_target.get(), "general.architecture", target_arch, sizeof(target_arch));
        if (target_only()) {
            if (std::string(target_arch) != "qwen35" || llama_model_n_layer_nextn(cpu_target.get()) != 0) {
                throw std::runtime_error("target-only service requires Qwen35 without embedded MTP");
            }
        } else {
            char draft_arch[64] = {};
            llama_model_meta_val_str(draft_model.get(), "general.architecture", draft_arch, sizeof(draft_arch));
            if (std::string(target_arch) != "gemma4" || std::string(draft_arch) != "gemma4-assistant") {
                throw std::runtime_error("draft service requires Gemma4 target and assistant models");
            }
        }
        templates = common_chat_templates_init(cpu_target.get(), "", "");
        if (cfg.model_sampling) {
            common_params_sampling_init_from_model(cpu_target.get(), sampling_defaults);
        }
        sampling_defaults.backend_sampling = false;
        logit_bias_eog = gemma_hybrid::eog_biases(llama_model_get_vocab(cpu_target.get()));
    }

    void reset_runtime() {
        speculative.reset();
        reset_context(draft_ctx, draft_threadpools);
        reset_context(target_ctx, target_threadpools);
        history.clear();
        committed = json::array();
        prior_tools = json::array();
        stable_prefix = 0;
        round = 0;
        current_zero_copy_ready = false;
    }

    static bool abort_callback(void * data) {
        return (*static_cast<const std::function<bool()> *>(data))();
    }

    static void evaluate(
            llama_context * context,
            const std::vector<llama_token> & tokens,
            int32_t first,
            int32_t count,
            common_speculative * spec,
            const std::function<bool()> & should_stop) {
        if (should_stop()) {
            throw std::runtime_error("request cancelled");
        }
        llama_set_abort_callback(context, abort_callback, const_cast<std::function<bool()> *>(&should_stop));
        llama_batch batch = llama_batch_init(count, 0, 1);
        for (int32_t i = 0; i < count; ++i) {
            batch.token[i] = tokens[first + i];
            batch.pos[i] = first + i;
            batch.n_seq_id[i] = 1;
            batch.seq_id[i][0] = 0;
            batch.logits[i] = i + 1 == count;
        }
        batch.n_tokens = count;
        const int32_t rc = llama_decode(context, batch);
        const bool processed = rc == 0 && (!spec || common_speculative_process(spec, batch));
        llama_batch_free(batch);
        llama_set_abort_callback(context, nullptr, nullptr);
        if (!processed) {
            throw std::runtime_error(should_stop() ? "request cancelled" : "decode or speculative process failed");
        }
    }

    void init_cpu_mtp() {
        if (target_only()) return;
        llama_context_params params = context_params(false);
        params.ctx_type = LLAMA_CONTEXT_TYPE_MTP;
        params.ctx_other = target_ctx.get();
        draft_ctx = make_context(draft_model.get(), params, draft_threadpools);
        common_params_speculative spec_params;
        spec_params.types = {COMMON_SPECULATIVE_TYPE_DRAFT_MTP};
        spec_params.draft.ctx_tgt = target_ctx.get();
        spec_params.draft.ctx_dft = draft_ctx.get();
        spec_params.draft.n_max = cfg.draft_max;
        spec_params.draft.n_min = cfg.draft_min;
        spec_params.draft.backend_sampling = false;
        speculative.reset(common_speculative_init(spec_params, 1));
        if (!speculative) {
            throw std::runtime_error("MTP initialization failed");
        }
    }

    common_chat_params render_chat(const json & request) const {
        common_chat_templates_inputs inputs;
        inputs.messages = common_chat_msgs_parse_oaicompat(common_json::parse(request.at("messages").dump()));
        inputs.tools = common_chat_tools_parse_oaicompat(common_json::parse(request.at("tools").dump()));
        inputs.add_generation_prompt = true;
        inputs.enable_thinking = false;
        inputs.parallel_tool_calls = request.value("parallel_tool_calls", false);
        inputs.tool_choice = common_chat_tool_choice_parse_oaicompat(request.value("tool_choice", std::string("auto")));
        // Target-only Qwen renders with thinking disabled. Gemma retains its
        // reasoning channel in the template; response parsing below strips an
        // empty thought marker from either model before exposing content.
        inputs.reasoning_format = target_only() ? COMMON_REASONING_FORMAT_NONE : COMMON_REASONING_FORMAT_DEEPSEEK;
        return common_chat_templates_apply(templates.get(), inputs);
    }

    common_params_sampling sampling_params(const json & request, const common_chat_params & chat) const {
        common_params_sampling params = sampling_defaults;
        params.user_sampling_config |= gemma_hybrid::sampling_override_mask(request);
        params.temp = request.value("temperature", params.temp);
        params.top_k = request.value("top_k", params.top_k);
        params.top_p = request.value("top_p", params.top_p);
        params.min_p = request.value("min_p", params.min_p);
        params.typ_p = request.value("typical_p", request.value("typ_p", params.typ_p));
        params.penalty_last_n = request.value("repeat_last_n", params.penalty_last_n);
        params.penalty_repeat = request.value("repeat_penalty", params.penalty_repeat);
        params.penalty_present = request.value("presence_penalty", params.penalty_present);
        params.penalty_freq = request.value("frequency_penalty", params.penalty_freq);
        params.seed = request.value("seed", params.seed);
        params.ignore_eos = request.value("ignore_eos", params.ignore_eos);
        if (params.ignore_eos) {
            params.logit_bias.insert(params.logit_bias.end(), logit_bias_eog.begin(), logit_bias_eog.end());
        }
        if (request.contains("samplers")) {
            if (!request.at("samplers").is_array()) throw std::invalid_argument("samplers must be an array");
            params.samplers = common_sampler_types_from_names(request.at("samplers").get<std::vector<std::string>>());
        }
        params.grammar = chat.grammar.empty() ? common_grammar() : common_grammar(COMMON_GRAMMAR_TYPE_TOOL_CALLS, chat.grammar);
        params.grammar_lazy = chat.grammar_lazy;
        params.grammar_triggers = chat.grammar_triggers;
        params.generation_prompt = chat.generation_prompt;
        const auto * vocab = llama_model_get_vocab(cpu_target.get());
        for (const auto & text : chat.preserved_tokens) {
            const auto ids = tokenize(vocab, text);
            if (ids.size() == 1) params.preserved_tokens.insert(ids[0]);
        }
        return params;
    }

    json run_turn(
            const json & request,
            const std::function<bool()> & should_stop,
            const stream_callbacks * callbacks,
            const std::string & completion_id) {
        const auto started = clock_type::now();
        const bool cold = !target_ctx;
        const bool cpu_tool_route = target_only() && !request.at("tools").empty();
        const common_chat_params chat = render_chat(request);
        const auto * vocab = llama_model_get_vocab(cpu_target.get());
        std::vector<llama_token> prompt = tokenize(vocab, chat.prompt);
        const int32_t budget = gemma_hybrid::output_budget(request, cfg.max_output);
        const int32_t draft_headroom = target_only() ? 0 : cfg.draft_max;
        if (prompt.size() + budget + draft_headroom + 1 > static_cast<size_t>(cfg.context)) {
            throw std::invalid_argument("context or output budget exceeded");
        }

        size_t reused = 0;
        while (reused < history.size() && reused < prompt.size() && history[reused] == prompt[reused]) ++reused;
        if (!cold && (reused == 0 || reused < stable_prefix)) {
            throw std::runtime_error("conversation template changed committed input prefix");
        }
        if (!cold && reused == prompt.size()) --reused;
        const size_t replayed = cold ? 0 : history.size() - reused;
        llama_kv_handoff_result transfer {};
        double prefill_s = 0;
        double handoff_ms = 0;
        if (callbacks && callbacks->prompt_progress) {
            callbacks->prompt_progress(prompt.size(), reused, reused, 0);
        }

        if (cold) {
            target_ctx = make_context(cpu_tool_route ? cpu_target.get() : gpu_target.get(), context_params(!cpu_tool_route), target_threadpools);
            const auto prefill_started = clock_type::now();
            for (size_t i = 0; i < prompt.size(); i += cfg.batch) {
                const size_t count = std::min<size_t>(cfg.batch, prompt.size() - i);
                evaluate(target_ctx.get(), prompt, i, count, nullptr, should_stop);
                if (callbacks && callbacks->prompt_progress) {
                    callbacks->prompt_progress(prompt.size(), 0, i + count, elapsed_s(prefill_started) * 1000.0);
                }
            }
            llama_synchronize(target_ctx.get());
            prefill_s = elapsed_s(prefill_started);

            if (!cpu_tool_route) {
                std::unique_ptr<common_threadpools> destination_threadpools;
                context_ptr destination = make_context(cpu_target.get(), context_params(false, true), destination_threadpools);
                const auto handoff_started = clock_type::now();
                const bool handed_off = llama_kv_handoff_cpu(destination.get(), target_ctx.get(), false, &transfer);
                if (!handed_off || transfer.shared_bytes == 0 || transfer.copied_bytes != 0) {
                    throw std::runtime_error("zero-copy handoff failed: shared_bytes=" + std::to_string(transfer.shared_bytes) + " copied_bytes=" + std::to_string(transfer.copied_bytes));
                }
                handoff_ms = elapsed_s(handoff_started) * 1000.0;
                reset_context(target_ctx, target_threadpools);
                target_ctx = std::move(destination);
                target_threadpools = std::move(destination_threadpools);
                ++handoffs;
                total_shared_bytes += transfer.shared_bytes;
                total_copied_bytes += transfer.copied_bytes;
                current_zero_copy_ready = true;
                init_cpu_mtp();
            }
            history = prompt;
            if (!cpu_tool_route) {
                if (!llama_memory_seq_rm(llama_get_memory(target_ctx.get()), 0, prompt.size() - 1, -1)) {
                    throw std::runtime_error("prime rollback failed");
                }
                evaluate(target_ctx.get(), prompt, prompt.size() - 1, 1, speculative.get(), should_stop);
            }
        } else {
            if (!llama_memory_seq_rm(llama_get_memory(target_ctx.get()), 0, reused, -1) ||
                    (!target_only() && !llama_memory_seq_rm(llama_get_memory(draft_ctx.get()), 0, reused, -1))) {
                throw std::runtime_error("prefix rollback failed");
            }
            const auto prefill_started = clock_type::now();
            for (size_t i = reused; i < prompt.size(); i += cfg.batch) {
                const size_t count = std::min<size_t>(cfg.batch, prompt.size() - i);
                evaluate(target_ctx.get(), prompt, i, count, speculative.get(), should_stop);
                if (callbacks && callbacks->prompt_progress) {
                    callbacks->prompt_progress(prompt.size(), reused, i + count, elapsed_s(prefill_started) * 1000.0);
                }
            }
            prefill_s = elapsed_s(prefill_started);
            history = prompt;
        }

        stable_prefix = input_prefix(vocab, chat, prompt);
        if (!target_only()) {
            common_speculative_begin(speculative.get(), 0, history);
        }
        auto sampler_params = sampling_params(request, chat);
        common_sampler_ptr sampler(common_sampler_init(cpu_target.get(), sampler_params));
        if (!sampler) throw std::runtime_error("sampler initialization failed");
        for (llama_token token : prompt) common_sampler_accept(sampler.get(), token, false);

        std::string raw;
        std::vector<llama_token> generated;
        int32_t drafted = 0;
        int32_t accepted = 0;
        int32_t verified = 0;
        double first_token_s = -1;
        double last_token_s = -1;
        bool eog = false;
        common_chat_parser_params parser(chat);
        parser.reasoning_format = COMMON_REASONING_FORMAT_DEEPSEEK;
        parser.parse_tool_calls = true;
        parser.parser.load(chat.parser);
        common_chat_msg partial_message;
        std::vector<std::string> tool_call_ids;
        auto emit = [&](llama_token token) {
            if (llama_vocab_is_eog(vocab, token)) {
                eog = true;
                return;
            }
            const std::string piece = token_piece(vocab, token);
            raw += piece;
            generated.push_back(token);
            if (first_token_s < 0) first_token_s = elapsed_s(started);
            last_token_s = elapsed_s(started);
            if (callbacks && callbacks->token_deltas) {
                common_chat_msg parsed = common_chat_parse(raw, true, parser);
                if (target_only()) {
                    parsed.content = gemma_hybrid::strip_empty_think_prefix(parsed.content);
                }
                if (!parsed.empty()) {
                    parsed.set_tool_call_ids(tool_call_ids, [] {
                        static std::atomic<uint64_t> next_id{0};
                        return "call_gemma_" + std::to_string(next_id.fetch_add(1));
                    });
                    const auto diffs = common_chat_msg_diff::compute_diffs(partial_message, parsed);
                    partial_message = std::move(parsed);
                    if (!diffs.empty()) {
                        callbacks->token_deltas(diffs, generated.size(), std::max(0.0, last_token_s - first_token_s) * 1000.0);
                    }
                }
            }
        };
        llama_token last = common_sampler_sample(sampler.get(), target_ctx.get(), -1);
        common_sampler_accept(sampler.get(), last, true);
        emit(last);

        while (!eog && generated.size() < static_cast<size_t>(budget)) {
            if (should_stop()) throw std::runtime_error("request cancelled");
            if (target_only()) {
                llama_batch batch = llama_batch_init(1, 0, 1);
                batch.n_tokens = 1;
                batch.token[0] = last;
                batch.pos[0] = history.size();
                batch.n_seq_id[0] = 1;
                batch.seq_id[0][0] = 0;
                batch.logits[0] = 1;
                llama_set_abort_callback(target_ctx.get(), abort_callback, const_cast<std::function<bool()> *>(&should_stop));
                const int32_t rc = llama_decode(target_ctx.get(), batch);
                llama_batch_free(batch);
                llama_set_abort_callback(target_ctx.get(), nullptr, nullptr);
                if (rc != 0) throw std::runtime_error(should_stop() ? "request cancelled" : "target decode failed");
                ++verified;
                history.push_back(last);
                last = common_sampler_sample(sampler.get(), target_ctx.get(), -1);
                common_sampler_accept(sampler.get(), last, true);
                emit(last);
                continue;
            }
            llama_tokens draft;
            auto & draft_params = common_speculative_get_draft_params(speculative.get(), 0);
            draft_params = {
                true,
                std::min<int32_t>(cfg.draft_max, budget - generated.size() - 1),
                static_cast<llama_pos>(history.size()),
                last,
                &history,
                &draft,
            };
            if (draft_params.n_max > 0) common_speculative_draft(speculative.get());
            drafted += draft.size();

            llama_batch batch = llama_batch_init(1 + draft.size(), 0, 1);
            batch.n_tokens = 1 + draft.size();
            for (int32_t i = 0; i < batch.n_tokens; ++i) {
                batch.token[i] = i ? draft[i - 1] : last;
                batch.pos[i] = history.size() + i;
                batch.n_seq_id[i] = 1;
                batch.seq_id[i][0] = 0;
                batch.logits[i] = 1;
            }
            llama_set_abort_callback(target_ctx.get(), abort_callback, const_cast<std::function<bool()> *>(&should_stop));
            const int32_t rc = llama_decode(target_ctx.get(), batch);
            const bool processed = rc == 0 && common_speculative_process(speculative.get(), batch);
            verified += batch.n_tokens;
            llama_batch_free(batch);
            llama_set_abort_callback(target_ctx.get(), nullptr, nullptr);
            if (!processed) throw std::runtime_error(should_stop() ? "request cancelled" : "MTP verification failed");

            const auto ids = common_sampler_sample_and_accept_n(sampler.get(), target_ctx.get(), draft);
            const int32_t matched = ids.size() - 1;
            accepted += matched;
            common_speculative_accept(speculative.get(), 0, matched);
            for (llama_token token : ids) {
                history.push_back(last);
                last = token;
                emit(token);
                if (eog || generated.size() >= static_cast<size_t>(budget)) break;
            }
            if (!llama_memory_seq_rm(llama_get_memory(target_ctx.get()), 0, history.size(), -1) || !llama_memory_seq_rm(llama_get_memory(draft_ctx.get()), 0, history.size(), -1)) {
                throw std::runtime_error("draft tail rollback failed");
            }
        }

        common_chat_msg message = common_chat_parse(raw, false, parser);
        if (target_only()) {
            message.content = gemma_hybrid::strip_empty_think_prefix(message.content);
        }
        if (callbacks && callbacks->token_deltas) {
            message.set_tool_call_ids(tool_call_ids, [] {
                static std::atomic<uint64_t> next_id{0};
                return "call_gemma_" + std::to_string(next_id.fetch_add(1));
            });
            const auto diffs = common_chat_msg_diff::compute_diffs(partial_message, message);
            if (!diffs.empty()) {
                callbacks->token_deltas(diffs, generated.size(), elapsed_s(started) * 1000.0);
            }
        }
        if (message.role.empty()) message.role = "assistant";
        json assistant_message = json::parse(message.to_json_oaicompat(true).dump());
        committed = request.at("messages");
        committed.push_back(assistant_message);
        prior_tools = request.at("tools");
        ++round;

        const std::string finish_reason = eog ? (message.tool_calls.empty() ? "stop" : "tool_calls") : "length";
        const double wall_s = elapsed_s(started);
        const double decode_tps = generated.size() > 1 && last_token_s > first_token_s ? (generated.size() - 1) / (last_token_s - first_token_s) : 0;
        json telemetry = {
            {"route", cpu_tool_route ? (cold ? "cpu_target_tool_fallback" : "cpu_target_tool_fallback_reuse") : target_only() ? (cold ? "vulkan_prefill_cpu_target" : "cpu_target_reuse") : (cold ? "vulkan_prefill_cpu_mtp" : "cpu_mtp_reuse")}, {"cold", cold}, {"round", round},
            {"shared_bytes", transfer.shared_bytes}, {"copied_bytes", transfer.copied_bytes}, {"zero_copy", cold && transfer.shared_bytes > 0 && transfer.copied_bytes == 0},
            {"prompt_tokens", prompt.size()}, {"cached_tokens", reused}, {"canonical_replay_tokens", replayed},
            {"generated_tokens", generated.size()}, {"verified_tokens", verified}, {"drafted", drafted}, {"accepted", accepted},
            {"prefill_s", prefill_s}, {"handoff_ms", handoff_ms}, {"first_token_s", first_token_s}, {"wall_s", wall_s}, {"decode_tps", std::isfinite(decode_tps) ? decode_tps : 0},
        };
        return {
            {"id", completion_id.empty() ? "chatcmpl-gemma-zero-copy-" + std::to_string(round) : completion_id}, {"object", "chat.completion"}, {"created", std::time(nullptr)},
            {"model", cfg.alias}, {"system_fingerprint", llama_build_info()},
            {"choices", json::array({{{"index", 0}, {"message", assistant_message}, {"finish_reason", finish_reason}}})},
            {"usage", {{"prompt_tokens", prompt.size()}, {"completion_tokens", generated.size()}, {"total_tokens", prompt.size() + generated.size()}, {"prompt_tokens_details", {{"cached_tokens", reused}}}}},
            {"timings", {{"prompt_n", prompt.size() - reused}, {"prompt_ms", prefill_s * 1000.0}, {"predicted_n", generated.size()}, {"predicted_ms", generated.size() > 1 && decode_tps > 0 ? generated.size() * 1000.0 / decode_tps : 0}}},
            {"zero_copy", telemetry},
        };
    }
};

static server_http_res_ptr response_json(const json & value, int status = 200) {
    auto response = std::make_unique<server_http_res>();
    response->status = status;
    response->data = value.dump();
    return response;
}

static std::string sse(const json & value) {
    return "data: " + value.dump() + "\n\n";
}

struct live_stream_state {
    std::mutex mutex;
    std::condition_variable ready;
    std::deque<std::string> chunks;
    std::atomic<bool> cancelled{false};
    bool finished = false;
};

class live_stream_response final : public server_http_res {
public:
    live_stream_response(std::shared_ptr<live_stream_state> state, std::thread worker)
        : state(std::move(state)), worker(std::move(worker)) {
        content_type = "text/event-stream; charset=utf-8";
        headers["Cache-Control"] = "no-cache";
        next = [stream_state = this->state](std::string & output) {
            std::unique_lock<std::mutex> lock(stream_state->mutex);
            stream_state->ready.wait(lock, [&] { return !stream_state->chunks.empty() || stream_state->finished; });
            if (!stream_state->chunks.empty()) {
                output = std::move(stream_state->chunks.front());
                stream_state->chunks.pop_front();
                return true;
            }
            output = "data: [DONE]\n\n";
            return false;
        };
    }

    void on_complete() override {
        state->cancelled.store(true);
        state->ready.notify_all();
        if (worker.joinable()) {
            worker.join();
        }
    }

    ~live_stream_response() override {
        on_complete();
    }

private:
    std::shared_ptr<live_stream_state> state;
    std::thread worker;
};

static server_http_res_ptr response_sse(
        persistent_session & session,
        json request,
        const std::string & conversation,
        const std::function<bool()> & connection_stopped,
        std::function<void()> release_outstanding) {
    auto state = std::make_shared<live_stream_state>();
    const std::string completion_id = "chatcmpl-gemma-zero-copy-stream-" +
        std::to_string(std::time(nullptr)) + "-" + std::to_string(g_completion_id.fetch_add(1));
    const std::time_t created = std::time(nullptr);
    const std::string model = session.alias();
    auto enqueue = [state](json chunk) {
        std::lock_guard<std::mutex> lock(state->mutex);
        state->chunks.push_back(sse(chunk));
        state->ready.notify_one();
    };
    enqueue({
        {"id", completion_id}, {"object", "chat.completion.chunk"}, {"created", created},
        {"model", model}, {"choices", json::array({{{"index", 0}, {"delta", {{"role", "assistant"}, {"content", nullptr}}}, {"finish_reason", nullptr}}})},
    });

    std::thread worker([state, request = std::move(request), conversation, completion_id, created, model,
                        connection_stopped, release_outstanding = std::move(release_outstanding), &session]() mutable {
        auto finish = [&] {
            {
                std::lock_guard<std::mutex> lock(state->mutex);
                state->finished = true;
            }
            state->ready.notify_all();
            release_outstanding();
        };
        auto enqueue_worker = [state](json chunk) {
            std::lock_guard<std::mutex> lock(state->mutex);
            state->chunks.push_back(sse(chunk));
            state->ready.notify_one();
        };
        const std::function<bool()> stopped = [state, connection_stopped] {
            return state->cancelled.load() || connection_stopped();
        };
        try {
            stream_callbacks callbacks;
            callbacks.prompt_progress = [&, state](size_t total, size_t cache, size_t processed, double time_ms) {
                enqueue_worker({
                    {"id", completion_id}, {"object", "chat.completion.chunk"}, {"created", created}, {"model", model},
                    {"choices", json::array({{{"index", 0}, {"delta", json::object()}, {"finish_reason", nullptr}}})},
                    {"prompt_progress", {{"total", total}, {"cache", cache}, {"processed", processed}, {"time_ms", time_ms}}},
                });
            };
            callbacks.token_deltas = [&, state](const std::vector<common_chat_msg_diff> & diffs, size_t generated, double elapsed_ms) {
                for (const auto & diff : diffs) {
                    enqueue_worker({
                        {"id", completion_id}, {"object", "chat.completion.chunk"}, {"created", created}, {"model", model},
                        {"choices", json::array({{{"index", 0}, {"delta", chat_delta(diff)}, {"finish_reason", nullptr}}})},
                        {"timings", {{"predicted_n", generated}, {"predicted_ms", elapsed_ms}}},
                    });
                }
            };
            json completion = session.complete(std::move(request), conversation, stopped, &callbacks, completion_id);
            const auto & choice = completion.at("choices").at(0);
            enqueue_worker({
                {"id", completion_id}, {"object", "chat.completion.chunk"}, {"created", created}, {"model", model},
                {"choices", json::array({{{"index", 0}, {"delta", json::object()}, {"finish_reason", choice.at("finish_reason")}}})},
                {"usage", completion.at("usage")}, {"timings", completion.at("timings")}, {"zero_copy", completion.at("zero_copy")},
            });
        } catch (const std::exception & error) {
            if (!state->cancelled.load()) {
                const bool cancelled = std::string(error.what()) == "request cancelled";
                enqueue_worker({{"error", {{"message", error.what()}, {"type", cancelled ? "cancelled" : "server_error"}, {"code", cancelled ? 499 : 500}}}});
            }
        }
        finish();
    });
    return std::make_unique<live_stream_response>(state, std::move(worker));
}

static server_http_context::handler_t safe_handler(server_http_context::handler_t handler) {
    return [handler = std::move(handler)](const server_http_req & request) -> server_http_res_ptr {
        try {
            return handler(request);
        } catch (const std::invalid_argument & error) {
            return response_json({{"error", {{"message", error.what()}, {"type", "invalid_request_error"}, {"code", 400}}}}, 400);
        } catch (const std::exception & error) {
            const bool cancelled = std::string(error.what()) == "request cancelled";
            return response_json({{"error", {{"message", error.what()}, {"type", cancelled ? "cancelled" : "server_error"}, {"code", cancelled ? 499 : 500}}}}, cancelled ? 499 : 500);
        }
    };
}

int main(int argc, char ** argv) {
    try {
        const config cfg = parse_args(argc, argv);
        std::signal(SIGINT, signal_handler);
        std::signal(SIGTERM, signal_handler);
        std::signal(SIGPIPE, SIG_IGN);
        ggml_backend_load_all();
        llama_backend_init();
        persistent_session session(cfg);

        common_params http_params;
        http_params.hostname = cfg.host;
        http_params.port = cfg.port;
        http_params.n_parallel = 1;
        http_params.n_threads_http = 4;
        http_params.ui = true;
        server_http_context http;
        g_http = &http;
        if (!http.init(http_params)) throw std::runtime_error("HTTP initialization failed");

        auto health = safe_handler([&](const server_http_req &) { return response_json(session.status()); });
        auto props = safe_handler([&](const server_http_req &) { return response_json(session.props()); });
        auto models = safe_handler([&](const server_http_req &) {
            return response_json({{"object", "list"}, {"data", json::array({{{"id", cfg.alias}, {"name", cfg.alias}, {"object", "model"}, {"owned_by", "llamacpp"}, {"created", 0}, {"in_cache", true}, {"path", cfg.model_path}, {"status", "loaded"}}})}});
        });
        std::atomic<int32_t> outstanding{0};
        auto completion = safe_handler([&](const server_http_req & request) {
            const int32_t queued = outstanding.fetch_add(1);
            if (queued >= 8) {
                outstanding.fetch_sub(1);
                throw std::invalid_argument("too many outstanding requests");
            }
            try {
                if (request.body.size() > 16 * 1024 * 1024) throw std::invalid_argument("request body exceeds 16 MiB");
                json body = json::parse(request.body);
                const bool stream = body.value("stream", false);
                const std::string conversation = gemma_hybrid::header_value(request.headers, "X-Conversation-Id");
                if (stream) {
                    return response_sse(session, std::move(body), conversation, request.should_stop, [&outstanding] {
                        outstanding.fetch_sub(1);
                    });
                }
                json result = session.complete(std::move(body), conversation, request.should_stop);
                outstanding.fetch_sub(1);
                return response_json(result);
            } catch (...) {
                outstanding.fetch_sub(1);
                throw;
            }
        });
        http.get("/health", health);
        http.get("/v1/health", health);
        http.get("/props", props);
        http.get("/models", models);
        http.get("/v1/models", models);
        auto tools_disabled = safe_handler([&](const server_http_req &) {
            return response_json({{"error", {{"message", "this feature is disabled"}, {"type", "feature_disabled"}}}}, 403);
        });
        // The embedded UI probes this route at startup. Return the same explicit
        // disabled response as llama-server when no server-side tools are set.
        // Client-supplied OpenAI tool definitions remain supported by completions.
        http.get("/tools", tools_disabled);
        http.post("/tools", tools_disabled);
        auto reset = safe_handler([&](const server_http_req & request) {
            std::string conversation = gemma_hybrid::header_value(request.headers, "X-Conversation-Id");
            if (conversation.empty()) {
                conversation = request.get_param("conv_id");
            }
            session.reset(conversation);
            return response_json({{"status", "reset"}});
        });
        http.post("/chat/completions", completion);
        http.post("/v1/chat/completions", completion);
        http.del("/v1/stream", reset);
        http.is_ready.store(true);
        if (!http.start()) throw std::runtime_error("HTTP bind failed");
        std::fprintf(stderr, "%s address=%s model=%s context=%d\n", cfg.draft_path.empty() ? "ZERO_COPY_READY" : "GEMMA_ZERO_COPY_READY", http.listening_address.c_str(), cfg.alias.c_str(), cfg.context);
        if (http.thread.joinable()) http.thread.join();
        g_http = nullptr;
        llama_backend_free();
        return 0;
    } catch (const std::exception & error) {
        std::fprintf(stderr, "ERROR: %s\n", error.what());
        return 1;
    }
}
