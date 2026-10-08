#include "llama.h"
#include "chat.h"
#include "common.h"
#include "sampling.h"
#include "json-schema-to-grammar.h"
#include "nlohmann/json.hpp"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <fstream>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

using json = nlohmann::json;
using model_ptr = std::unique_ptr<llama_model, decltype(&llama_model_free)>;
using context_ptr = std::unique_ptr<llama_context, decltype(&llama_free)>;
using sampler_ptr = std::unique_ptr<common_sampler, decltype(&common_sampler_free)>;

static void require(bool ok, const char * phase) {
    if (!ok) throw std::runtime_error(phase);
}

static llama_context_params context_params(bool gpu, bool destination) {
    auto p = llama_context_default_params();
    p.n_ctx = 4096; p.n_batch = 512; p.n_ubatch = 128;
    p.n_threads = 4; p.n_threads_batch = 4;
    p.n_seq_max = 1; p.n_rs_seq = 3;
    p.n_outputs_max = 1; p.n_outputs_max_per_seq = 1;
    p.type_k = GGML_TYPE_F16; p.type_v = GGML_TYPE_F16;
    p.flash_attn_type = LLAMA_FLASH_ATTN_TYPE_DISABLED;
    p.offload_kqv = gpu; p.op_offload = gpu;
    p.kv_handoff_strict = gpu || destination;
    p.kv_handoff_destination = destination;
    return p;
}

static bool token_sequence_is_suffix(const std::vector<llama_token> & tokens, const std::vector<llama_token> & suffix) {
    return !suffix.empty() && tokens.size() >= suffix.size() &&
        std::equal(suffix.rbegin(), suffix.rend(), tokens.rbegin());
}

static bool should_activate_answer_schema(
        bool eog,
        const std::vector<llama_token> & generated,
        const std::vector<llama_tokens> & end_sequences) {
    if (eog) return false;
    return std::any_of(end_sequences.begin(), end_sequences.end(), [&](const llama_tokens & seq) {
        return token_sequence_is_suffix(generated, seq);
    });
}

static void test_schema_transition_suffixes() {
    const llama_tokens end_a = {101, 102, 103};
    const llama_tokens end_b = {201, 202};
    const std::vector<llama_tokens> ends = {end_a, end_b};
    require(!should_activate_answer_schema(false, {7, 101, 102}, ends), "schema_partial_end_not_triggered");
    require(should_activate_answer_schema(false, {7, 101, 102, 103}, ends), "schema_natural_multitoken_end");
    // A forced budget ending emits the same configured token sequence and takes the same transition.
    require(should_activate_answer_schema(false, {5, 201, 202}, ends), "schema_forced_alternate_end");
    require(!should_activate_answer_schema(false, {7, 101, 102, 104}, ends), "schema_near_end_not_triggered");
    require(!should_activate_answer_schema(false, {101, 102}, ends), "schema_short_prefix_not_triggered");
    require(!should_activate_answer_schema(false, {7}, {}), "schema_empty_end_not_triggered");
    require(!should_activate_answer_schema(true, {7, 101, 102, 103}, ends), "schema_eog_does_not_transition");
}

static void decode(llama_context * ctx, const std::vector<llama_token> & ids, size_t begin, size_t end) {
    for (size_t off = begin; off < end; off += 128) {
        const size_t n = std::min<size_t>(128, end - off);
        auto b = llama_batch_init((int) n, 0, 1);
        b.n_tokens = (int) n;
        for (size_t i = 0; i < n; ++i) {
            b.token[i] = ids[off+i]; b.pos[i] = (llama_pos) (off+i);
            b.n_seq_id[i] = 1; b.seq_id[i][0] = 0; b.logits[i] = i+1 == n;
        }
        const int rc = llama_decode(ctx, b);
        llama_batch_free(b);
        require(rc == 0, "decode");
        llama_synchronize(ctx);
        const float * logits = llama_get_logits(ctx);
        const int n_vocab = llama_vocab_n_tokens(llama_model_get_vocab(llama_get_model(ctx)));
        for (int i = 0; i < n_vocab; ++i) require(std::isfinite(logits[i]), "nonfinite_logits");
    }
}

int main(int argc, char ** argv) {
    if (argc == 2 && std::string(argv[1]) == "--test-schema-transition") {
        try {
            test_schema_transition_suffixes();
            std::printf("schema transition suffix tests: PASS (7 cases)\n");
            return 0;
        } catch (const std::exception & e) {
            std::fprintf(stderr, "schema transition suffix tests: FAIL (%s)\n", e.what());
            return 1;
        }
    }
    if (argc != 5 || (std::string(argv[1]) != "cpu" && std::string(argv[1]) != "handoff")) {
        std::fprintf(stderr, "usage: %s cpu|handoff MODEL REQUEST.json OUTPUT.json\n", argv[0]);
        return 2;
    }
    json report = {{"profile", argv[1]}, {"turns", json::array()}, {"shared_bytes", 0}, {"copied_bytes", 0}};
    auto save = [&]() { std::ofstream(argv[4]) << report.dump(2) << '\n'; };
    const auto start = std::chrono::steady_clock::now();
    try {
        common_init(); ggml_backend_load_all(); llama_backend_init();
        std::ifstream input(argv[3]); const json request = json::parse(input);
        const int max_tokens = request.value("max_tokens", 256);
        const int reasoning_budget = request.value("reasoning_budget", -1);
        require(max_tokens > 0 && reasoning_budget >= -1, "invalid_generation_budget");
        require(reasoning_budget < 0 || (request.value("thinking", false) && max_tokens > 64 && reasoning_budget < max_tokens - 64), "missing_answer_reserve");
        const bool handoff = std::string(argv[1]) == "handoff";
        auto mp = llama_model_default_params(); mp.load_mode = LLAMA_LOAD_MODE_MMAP; mp.n_gpu_layers = 0;
        model_ptr cpu(llama_model_load_from_file(argv[2], mp), llama_model_free); require(bool(cpu), "cpu_model");
        model_ptr gpu(nullptr, llama_model_free);
        if (handoff) { mp.n_gpu_layers = 999; gpu.reset(llama_model_load_from_file(argv[2], mp)); require(bool(gpu), "gpu_model"); }
        auto templates = common_chat_templates_init(cpu.get(), "");
        const auto * vocab = llama_model_get_vocab(cpu.get());
        context_ptr active(llama_init_from_model(handoff ? gpu.get() : cpu.get(), context_params(handoff, false)), llama_free);
        require(bool(active), "source_context");
        json messages = request.at("messages");
        std::vector<llama_token> history;
        const auto turns = request.value("followups", json::array());
        for (size_t round = 0; round <= turns.size(); ++round) {
            if (round) {
                for (auto message : turns.at(round-1)) {
                    if (message.value("tool_call_id", "") == "$last_tool_call_id") {
                        message["tool_call_id"] = messages.back().at("tool_calls").at(0).at("id");
                    }
                    messages.push_back(message);
                }
            }
            common_chat_templates_inputs ci;
            ci.messages = common_chat_msgs_parse_oaicompat(common_json::parse(messages.dump()));
            ci.enable_thinking = request.value("thinking", false);
            ci.reasoning_format = COMMON_REASONING_FORMAT_DEEPSEEK;
            ci.chat_template_kwargs["enable_thinking"] = ci.enable_thinking ? "true" : "false";
            ci.now = std::chrono::system_clock::from_time_t(1791417600);
            if (request.contains("tools")) ci.tools = common_chat_tools_parse_oaicompat(common_json::parse(request.at("tools").dump()));
            ci.tool_choice = round == 0 && request.value("tool_required", false) ? COMMON_CHAT_TOOL_CHOICE_REQUIRED : COMMON_CHAT_TOOL_CHOICE_AUTO;
            const auto chat = common_chat_templates_apply(templates.get(), ci);
            const std::string answer_schema_grammar = request.contains("json_schema")
                ? json_schema_to_grammar(common_json::parse(request.at("json_schema").dump()))
                : std::string();
            const auto tokens = common_tokenize(vocab, chat.prompt, true, true);
            require(tokens.size() > 1 && tokens.size() + request.value("max_tokens", 256) < 4096, "context_bound");
            size_t common = 0;
            while (common < history.size() && common < tokens.size() && history[common] == tokens[common]) ++common;
            if (common < history.size()) {
                require(history.size() - common <= 3, "warm_prefix_exceeds_rollback");
                require(llama_memory_seq_rm(llama_get_memory(active.get()), 0, (llama_pos) common, -1), "warm_rollback");
                history.resize(common);
            }
            report["phase"] = "prefill_started"; report["round"] = round; save();
            decode(active.get(), tokens, common, tokens.size()); history = tokens;
            if (handoff && round == 0) {
                context_ptr destination(llama_init_from_model(cpu.get(), context_params(false, true)), llama_free);
                require(bool(destination), "destination_context");
                llama_kv_handoff_result transfer{};
                require(llama_kv_handoff_cpu(destination.get(), active.get(), false, &transfer), "handoff");
                require(transfer.shared_bytes > 0 && transfer.copied_bytes == 0, "copy_accounting");
                require(!llama_get_memory(active.get()), "source_consumed");
                active.reset(); gpu.reset(); active = std::move(destination);
                report["shared_bytes"] = transfer.shared_bytes; report["copied_bytes"] = transfer.copied_bytes;
                require(llama_memory_seq_rm(llama_get_memory(active.get()), 0, (llama_pos) tokens.size()-1, -1), "last_token_rollback");
                decode(active.get(), tokens, tokens.size()-1, tokens.size());
                report["source_gpu_owner_destroyed"] = true;
            }
            common_params_sampling sp;
            sp.temp = request.value("temperature", 0.0f); sp.top_p = 0.95f; sp.min_p = 0.0f; sp.seed = 42;
            const bool answer_schema = request.contains("json_schema");
            require(!answer_schema || (reasoning_budget >= 0 && !answer_schema_grammar.empty()), "schema_requires_bounded_reasoning");
            sp.grammar = !answer_schema && !chat.grammar.empty()
                ? common_grammar(COMMON_GRAMMAR_TYPE_TOOL_CALLS, chat.grammar)
                : common_grammar();
            sp.grammar_lazy = !answer_schema && chat.grammar_lazy; sp.grammar_triggers = !answer_schema ? chat.grammar_triggers : std::vector<common_grammar_trigger>{};
            sp.generation_prompt = chat.generation_prompt;
            if (reasoning_budget >= 0) {
                require(!chat.thinking_start_tag.empty() && !chat.thinking_end_tags.empty(), "missing_reasoning_tags");
                sp.reasoning_budget_tokens = reasoning_budget;
                sp.reasoning_budget_start = common_tokenize(vocab, chat.thinking_start_tag, false, true);
                for (const auto & tag : chat.thinking_end_tags) {
                    sp.reasoning_budget_end.push_back(common_tokenize(vocab, tag, false, true));
                }
                require(!sp.reasoning_budget_start.empty() && !sp.reasoning_budget_end.front().empty(), "empty_reasoning_tokens");
                sp.reasoning_budget_forced = common_tokenize(vocab, request.value("reasoning_budget_message", std::string()), false, true);
                const auto & end = sp.reasoning_budget_end.front();
                sp.reasoning_budget_forced.insert(sp.reasoning_budget_forced.end(), end.begin(), end.end());
            }
            for (const auto & text : chat.preserved_tokens) {
                auto ids = common_tokenize(vocab, text, false, true);
                if (ids.size() == 1) sp.preserved_tokens.insert(ids[0]);
            }
            sampler_ptr sampler(common_sampler_init(cpu.get(), sp), common_sampler_free);
            require(bool(sampler), "sampler");
            for (auto id : tokens) common_sampler_accept(sampler.get(), id, false);
            std::string raw; std::vector<llama_token> generated;
            bool ended = false;
            bool answer_schema_active = !answer_schema;
            std::vector<llama_tokens> answer_end_sequences;
            if (answer_schema) {
                for (const auto & tag : chat.thinking_end_tags) {
                    auto seq = common_tokenize(vocab, tag, false, true);
                    if (!seq.empty()) answer_end_sequences.push_back(std::move(seq));
                }
                require(!answer_end_sequences.empty(), "missing_reasoning_tags");
            }
            const int limit = max_tokens;
            const auto generation_start = std::chrono::steady_clock::now();
            report["phase"] = "generation_started"; save();
            for (int i = 0; i < limit; ++i) {
                const auto id = common_sampler_sample(sampler.get(), active.get(), -1);
                common_sampler_accept(sampler.get(), id, true);
                if (llama_vocab_is_eog(vocab, id)) { ended = true; break; }
                generated.push_back(id); raw += common_token_to_piece(vocab, id, true);
                history.push_back(id); decode(active.get(), history, history.size()-1, history.size());
                if (answer_schema && !answer_schema_active) {
                    if (should_activate_answer_schema(false, generated, answer_end_sequences)) {
                        common_params_sampling answer_sp = sp;
                        answer_sp.grammar = common_grammar(COMMON_GRAMMAR_TYPE_OUTPUT_FORMAT, answer_schema_grammar);
                        answer_sp.grammar_lazy = false;
                        answer_sp.grammar_triggers.clear();
                        answer_sp.generation_prompt.clear();
                        answer_sp.reasoning_budget_tokens = -1;
                        answer_sp.reasoning_budget_start.clear();
                        answer_sp.reasoning_budget_end.clear();
                        answer_sp.reasoning_budget_forced.clear();
                        answer_sp.reasoning_budget_message.clear();
                        answer_sp.reasoning_control = false;
                        sampler.reset(common_sampler_init(cpu.get(), answer_sp));
                        require(bool(sampler), "answer_schema_sampler");
                        // The JSON grammar begins after the reasoning close token. Do not replay the prior reasoning text into its parser.
                        answer_schema_active = true;
                    }
                }
            }
            require(answer_schema_active, "answer_schema_not_entered");
            common_chat_parser_params pp(chat); pp.reasoning_format = COMMON_REASONING_FORMAT_DEEPSEEK;
            pp.parser.load(chat.parser);
            auto parsed = common_chat_parse(raw, false, pp);
            for (size_t i = 0; i < parsed.tool_calls.size(); ++i) {
                if (parsed.tool_calls[i].id.empty()) parsed.tool_calls[i].id = "call_native_" + std::to_string(round) + "_" + std::to_string(i);
            }
            auto assistant = json::parse(parsed.to_json_oaicompat().dump()); assistant["role"] = "assistant";
            json sampler_names = json::array();
            for (const auto type : sp.samplers) sampler_names.push_back(common_sampler_type_to_str(type));
            json row = {{"round", round}, {"chat_format", common_chat_format_name(chat.format)}, {"generation_prompt", chat.generation_prompt}, {"rendered_prompt", chat.prompt}, {"prompt_tokens", tokens},
                {"cached_tokens", common}, {"evaluated_tokens", tokens.size()-common}, {"generated_tokens", generated},
                {"sampling", {{"temperature", sp.temp}, {"top_k", sp.top_k}, {"top_p", sp.top_p}, {"min_p", sp.min_p}, {"seed", sp.seed}, {"chain", sampler_names}, {"reasoning_budget", sp.reasoning_budget_tokens}, {"reasoning_budget_message", request.value("reasoning_budget_message", std::string())}, {"max_tokens", max_tokens}}},
                {"raw", raw}, {"parsed", assistant}, {"finish", ended ? "eog" : "length"},
                {"final_pos", llama_memory_seq_pos_max(llama_get_memory(active.get()), 0)},
                {"generation_ms", std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-generation_start).count()}};
            report["turns"].push_back(row); save();
            require(ended, "generation_truncated");
            messages.push_back(assistant);
        }
        report["phase"] = "complete"; report["passed_native"] = true;
    } catch (const std::exception & e) { report["error"] = e.what(); }
    report["total_ms"] = std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-start).count();
    save(); std::printf("SEMANTIC_RESULT %s\n", report.dump().c_str());
    return report.value("passed_native", false) ? 0 : 1;
}
