#include "llama.h"
#include "chat.h"
#include "common.h"
#include "sampling.h"
#include "reasoning-budget.h"
#include "json-schema-to-grammar.h"
#include "../src/llama-grammar.h"
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

static void switch_to_answer_schema(
        sampler_ptr & sampler,
        const llama_model * model,
        const common_params_sampling & current,
        const std::string & answer_grammar) {
    auto answer = current;
    answer.grammar = common_grammar(COMMON_GRAMMAR_TYPE_OUTPUT_FORMAT, answer_grammar);
    answer.grammar_lazy = false;
    answer.grammar_triggers.clear();
    answer.generation_prompt.clear();
    answer.reasoning_budget_tokens = -1;
    answer.reasoning_budget_start.clear();
    answer.reasoning_budget_end.clear();
    answer.reasoning_budget_forced.clear();
    answer.reasoning_budget_message.clear();
    answer.reasoning_control = false;
    sampler.reset(common_sampler_init(model, answer));
    require(bool(sampler), "answer_schema_sampler");
}

static bool maybe_switch_to_answer_schema(
        sampler_ptr & sampler,
        const llama_model * model,
        const common_params_sampling & reasoning,
        const std::string & answer_grammar,
        bool eog,
        const std::vector<llama_token> & generated,
        const std::vector<llama_tokens> & end_sequences) {
    if (!should_activate_answer_schema(eog, generated, end_sequences)) return false;
    switch_to_answer_schema(sampler, model, reasoning, answer_grammar);
    return true;
}

static std::vector<llama_token> tokenize(const llama_vocab * vocab, const std::string & text) {
    return common_tokenize(vocab, text, false, true);
}

static void accept_sampler_text(common_sampler * sampler, const llama_vocab * vocab, const std::string & text) {
    for (const auto token : tokenize(vocab, text)) common_sampler_accept(sampler, token, true);
}

static llama_token sample_forced_token(llama_sampler * sampler, const llama_vocab * vocab) {
    const int32_t n_vocab = llama_vocab_n_tokens(vocab);
    std::vector<llama_token_data> data;
    data.reserve(n_vocab);
    for (int32_t i = 0; i < n_vocab; ++i) data.push_back({i, 0.0f, 0.0f});
    llama_token_data_array candidates = {data.data(), data.size(), -1, false};
    llama_sampler_apply(sampler, &candidates);
    llama_token selected = LLAMA_TOKEN_NULL;
    size_t finite = 0;
    for (const auto & candidate : data) {
        if (std::isfinite(candidate.logit)) {
            selected = candidate.id;
            finite++;
        }
    }
    require(finite == 1, "forced_sampler_single_candidate");
    return selected;
}

static void accept_reasoning_tokens(llama_sampler * sampler, const std::vector<llama_token> & tokens) {
    for (const auto token : tokens) llama_sampler_accept(sampler, token);
}

static bool grammar_accepts_complete(const llama_vocab * vocab, const std::string & grammar_text, const std::string & text) {
    std::unique_ptr<llama_grammar, decltype(&llama_grammar_free_impl)> grammar(
        llama_grammar_init_impl(vocab, grammar_text.c_str(), "root", false, nullptr, 0, nullptr, 0),
        llama_grammar_free_impl);
    require(bool(grammar), "test_answer_grammar");
    try {
        for (const auto token : tokenize(vocab, text)) {
            llama_grammar_accept_token(*grammar, token, common_token_to_piece(vocab, token, true));
        }
    } catch (const std::runtime_error &) {
        return false;
    }
    const auto & stacks = llama_grammar_get_stacks(grammar.get());
    return std::any_of(stacks.begin(), stacks.end(), [](const llama_grammar_stack & stack) { return stack.empty(); });
}

static void test_schema_sampler_lifecycle(const llama_model * model) {
    const auto * vocab = llama_model_get_vocab(model);
    require(vocab != nullptr, "test_schema_vocab");
    const auto start = tokenize(vocab, "<think>");
    const auto end = tokenize(vocab, "</think>");
    require(!start.empty() && !end.empty(), "test_schema_tags");
    const common_json schema = common_json::parse(R"({"type":"object","properties":{"ok":{"type":"boolean"}},"required":["ok"],"additionalProperties":false})");
    const std::string grammar = json_schema_to_grammar(schema);
    common_params_sampling reasoning;
    reasoning.temp = 0;
    reasoning.reasoning_budget_tokens = 32;
    reasoning.reasoning_budget_start = start;
    reasoning.reasoning_budget_end = {end};
    reasoning.reasoning_budget_forced = end;
    const auto thought = tokenize(vocab, "Let me check.");

    // Direct common reasoning-budget sampler must observe the natural close as DONE; separately
    // the coupled common_sampler below tests how that completed end is replayed into lazy grammar.
    std::unique_ptr<llama_sampler, decltype(&llama_sampler_free)> natural_budget(
        common_reasoning_budget_init(vocab, {start}, {end}, end, 32), llama_sampler_free);
    accept_reasoning_tokens(natural_budget.get(), start);
    accept_reasoning_tokens(natural_budget.get(), thought);
    for (size_t i = 0; i < end.size(); ++i) {
        llama_sampler_accept(natural_budget.get(), end[i]);
        require(common_reasoning_budget_get_state(natural_budget.get()) ==
            (i + 1 == end.size() ? REASONING_BUDGET_DONE : REASONING_BUDGET_COUNTING), "natural_budget_end_boundary");
    }
    require(common_reasoning_budget_get_state(natural_budget.get()) == REASONING_BUDGET_DONE, "natural_budget_done");
    const auto * natural_match = common_reasoning_budget_get_end_match(natural_budget.get());
    require(natural_match && *natural_match == end, "natural_budget_end_match");

    // Configure the actual coupled lazy-grammar/reasoning-budget sampler. Grammar remains awaiting
    // its start trigger while thinking; common_sampler_accept must replay the matched end sequence
    // into the grammar state when reasoning reaches DONE.
    auto coupled_params = reasoning;
    const std::string trigger = regex_escape(common_token_to_piece(vocab, end.front(), true)) + "[\\s\\S]*?(\\{)";
    coupled_params.grammar = common_grammar(COMMON_GRAMMAR_TYPE_OUTPUT_FORMAT, grammar);
    coupled_params.grammar_lazy = true;
    coupled_params.grammar_triggers = {{COMMON_GRAMMAR_TRIGGER_TYPE_PATTERN, trigger}};
    sampler_ptr coupled(common_sampler_init(model, coupled_params), common_sampler_free);
    require(bool(coupled), "coupled_lazy_sampler");
    for (auto token : start) common_sampler_accept(coupled.get(), token, true);
    for (auto token : thought) common_sampler_accept(coupled.get(), token, true);
    require(common_sampler_reasoning_budget_state_get(coupled.get()) == REASONING_BUDGET_COUNTING, "coupled_still_counting");
    std::vector<llama_token> coupled_seen = start;
    coupled_seen.insert(coupled_seen.end(), thought.begin(), thought.end());
    for (size_t i = 0; i < end.size(); ++i) {
        common_sampler_accept(coupled.get(), end[i], true);
        coupled_seen.push_back(end[i]);
        require(should_activate_answer_schema(false, coupled_seen, {end}) == (i + 1 == end.size()), "coupled_end_boundary");
    }
    require(common_sampler_reasoning_budget_state_get(coupled.get()) == REASONING_BUDGET_DONE, "coupled_budget_done_after_natural_end");
    // Do not manually replace this sampler: this tests the existing budget->grammar end replay
    // and lazy '{' trigger as tokens flow through the same common_sampler instance.
    accept_sampler_text(coupled.get(), vocab, R"({"ok":true})");
    require(grammar_accepts_complete(vocab, grammar, R"({"ok":true})"), "coupled_lazy_grammar_valid_answer");
    common_sampler_reset(coupled.get());
    for (auto token : start) common_sampler_accept(coupled.get(), token, true);
    for (auto token : thought) common_sampler_accept(coupled.get(), token, true);
    for (auto token : end) common_sampler_accept(coupled.get(), token, true);
    bool coupled_invalid_rejected = false;
    try {
        accept_sampler_text(coupled.get(), vocab, R"({"ok":maybe})");
    } catch (const std::runtime_error &) {
        coupled_invalid_rejected = true;
    }
    require(coupled_invalid_rejected, "coupled_lazy_grammar_rejects_invalid_answer");

    // The common sampler path likewise remains in reasoning through a partial marker, then switches after the whole marker.
    auto natural_params = reasoning;
    const std::string trigger_pattern = regex_escape(common_token_to_piece(vocab, end.front(), true)) + "[\\s\\S]*?(\\{)";
    natural_params.grammar = common_grammar(COMMON_GRAMMAR_TYPE_OUTPUT_FORMAT, grammar);
    natural_params.grammar_lazy = true;
    natural_params.grammar_triggers = {{COMMON_GRAMMAR_TRIGGER_TYPE_PATTERN, trigger_pattern}};
    sampler_ptr natural(common_sampler_init(model, natural_params), common_sampler_free);
    require(bool(natural), "natural_reasoning_sampler");
    for (auto token : start) common_sampler_accept(natural.get(), token, true);
    for (auto token : thought) common_sampler_accept(natural.get(), token, true);
    std::vector<llama_token> seen = start;
    seen.insert(seen.end(), thought.begin(), thought.end());
    bool natural_switched = false;
    for (size_t i = 0; i < end.size(); ++i) {
        common_sampler_accept(natural.get(), end[i], true);
        seen.push_back(end[i]);
        require(should_activate_answer_schema(false, seen, {end}) == (i + 1 == end.size()), "natural_end_stage_boundary");
        if (!natural_switched) {
            natural_switched = maybe_switch_to_answer_schema(natural, model, natural_params, grammar, false, seen, {end});
            require(natural_switched == (i + 1 == end.size()), "natural_only_switch_after_complete_end");
        }
    }
    require(natural_switched, "natural_full_stage_switch");
    accept_sampler_text(natural.get(), vocab, R"({"ok":true})");
    require(grammar_accepts_complete(vocab, grammar, R"({"ok":true})"), "natural_answer_complete");
    common_sampler_reset(natural.get());
    accept_sampler_text(natural.get(), vocab, R"({"ok":false})");
    require(grammar_accepts_complete(vocab, grammar, R"({"ok":false})"), "answer_grammar_reset_reusable");
    common_sampler_reset(natural.get());
    accept_sampler_text(natural.get(), vocab, "{");
    bool second_open_accepted = true;
    try {
        accept_sampler_text(natural.get(), vocab, "{");
    } catch (const std::runtime_error &) {
        second_open_accepted = false;
    }
    require(!second_open_accepted, "answer_grammar_state_advanced");
    common_sampler_reset(natural.get());
    bool root_restored = true;
    try {
        accept_sampler_text(natural.get(), vocab, "{");
    } catch (const std::runtime_error &) {
        root_restored = false;
    }
    require(root_restored, "same_instance_partial_answer_reset");
    common_sampler_reset(natural.get());
    accept_sampler_text(natural.get(), vocab, R"({"ok":false})");
    require(grammar_accepts_complete(vocab, grammar, R"({"ok":false})"), "reset_after_partial_answer_reusable");
    require(!grammar_accepts_complete(vocab, grammar, R"({"ok":)"), "truncated_answer_rejected");
    require(!grammar_accepts_complete(vocab, grammar, R"({"ok":maybe})"), "invalid_answer_rejected");

    // The actual common reasoning-budget sampler must force each configured message/end token and report DONE.
    auto forced_params = reasoning;
    const auto notice = tokenize(vocab, "Stop.");
    forced_params.reasoning_budget_forced = notice;
    forced_params.reasoning_budget_forced.insert(forced_params.reasoning_budget_forced.end(), end.begin(), end.end());
    std::unique_ptr<llama_sampler, decltype(&llama_sampler_free)> forced_budget(
        common_reasoning_budget_init(vocab, {start}, {end}, forced_params.reasoning_budget_forced, 32), llama_sampler_free);
    accept_reasoning_tokens(forced_budget.get(), start);
    const auto lead = tokenize(vocab, "x");
    accept_reasoning_tokens(forced_budget.get(), lead);
    require(common_reasoning_budget_force(forced_budget.get()), "manual_reasoning_force");
    for (const auto token : forced_params.reasoning_budget_forced) {
        require(sample_forced_token(forced_budget.get(), vocab) == token, "forced_budget_token_matches");
        llama_sampler_accept(forced_budget.get(), token);
    }
    require(common_reasoning_budget_get_state(forced_budget.get()) == REASONING_BUDGET_DONE, "forced_budget_done");
    const auto * forced_match = common_reasoning_budget_get_end_match(forced_budget.get());
    require(forced_match && *forced_match == end, "forced_budget_end_match");

    // Exercise the common sampler's force API and the same D3 stage-switch helper.
    auto forced_sampler_params = forced_params;
    forced_sampler_params.grammar = common_grammar(COMMON_GRAMMAR_TYPE_OUTPUT_FORMAT, grammar);
    forced_sampler_params.grammar_lazy = true;
    forced_sampler_params.grammar_triggers = {{COMMON_GRAMMAR_TRIGGER_TYPE_PATTERN, trigger_pattern}};
    sampler_ptr forced(common_sampler_init(model, forced_sampler_params), common_sampler_free);
    for (auto token : start) common_sampler_accept(forced.get(), token, true);
    for (auto token : lead) common_sampler_accept(forced.get(), token, true);
    require(common_sampler_reasoning_budget_force(forced.get()), "common_manual_reasoning_force");
    std::vector<llama_token> forced_seen = start;
    forced_seen.insert(forced_seen.end(), lead.begin(), lead.end());
    bool forced_switched = false;
    for (size_t i = 0; i < forced_params.reasoning_budget_forced.size(); ++i) {
        const auto token = forced_params.reasoning_budget_forced[i];
        common_sampler_accept(forced.get(), token, true);
        forced_seen.push_back(token);
        if (!forced_switched) {
            forced_switched = maybe_switch_to_answer_schema(
                forced, model, forced_sampler_params, grammar, false, forced_seen, {end});
            const bool end_complete = i + 1 == forced_params.reasoning_budget_forced.size();
            require(forced_switched == end_complete, "forced_only_switch_after_complete_end");
        }
    }
    require(forced_switched, "forced_full_stage_switch");
    accept_sampler_text(forced.get(), vocab, R"({"ok":false})");
    require(grammar_accepts_complete(vocab, grammar, R"({"ok":false})"), "forced_answer_complete");

    // Reset is the interruption/retry boundary: discard partial reasoning and re-arm the real budget sampler.
    sampler_ptr reset_sampler(common_sampler_init(model, natural_params), common_sampler_free);
    for (auto token : start) common_sampler_accept(reset_sampler.get(), token, true);
    require(common_sampler_reasoning_budget_state_get(reset_sampler.get()) == REASONING_BUDGET_COUNTING, "reset_test_enters_counting");
    if (start.size() > 1) common_sampler_accept(reset_sampler.get(), start.front(), true);
    common_sampler_reset(reset_sampler.get());
    require(common_sampler_reasoning_budget_state_get(reset_sampler.get()) == REASONING_BUDGET_IDLE, "reset_clears_budget_state");
    for (auto token : end) common_sampler_accept(reset_sampler.get(), token, true);
    require(common_sampler_reasoning_budget_state_get(reset_sampler.get()) == REASONING_BUDGET_IDLE, "reset_ignores_stale_end_marker");
    for (auto token : start) common_sampler_accept(reset_sampler.get(), token, true);
    require(common_sampler_reasoning_budget_state_get(reset_sampler.get()) == REASONING_BUDGET_COUNTING, "reset_rearms_on_fresh_start");
    for (size_t i = 0; i < end.size(); ++i) {
        common_sampler_accept(reset_sampler.get(), end[i], true);
        require(should_activate_answer_schema(false, std::vector<llama_token>(end.begin(), end.begin() + i + 1), {end}) == (i + 1 == end.size()), "reset_rearms_stage_boundary");
    }
    require(common_sampler_reasoning_budget_state_get(reset_sampler.get()) == REASONING_BUDGET_DONE, "reset_fresh_close_reaches_done");
    require(should_activate_answer_schema(false, end, {end}), "reset_natural_end");
    auto reset_answer_params = natural_params;
    switch_to_answer_schema(reset_sampler, model, reset_answer_params, grammar);
    accept_sampler_text(reset_sampler.get(), vocab, R"({"ok":true})");
    require(grammar_accepts_complete(vocab, grammar, R"({"ok":true})"), "reset_answer_complete");
    common_sampler_reset(reset_sampler.get());
    accept_sampler_text(reset_sampler.get(), vocab, R"({"ok":false})");
    require(grammar_accepts_complete(vocab, grammar, R"({"ok":false})"), "reset_answer_grammar_reusable");
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
    const std::string test_mode = argc > 1 ? argv[1] : "";
    if (test_mode == "--test-schema-transition" && argc == 2) {
        try {
            test_schema_transition_suffixes();
            std::printf("schema transition suffix predicate tests: PASS (7 cases)\n");
            return 0;
        } catch (const std::exception & e) {
            std::fprintf(stderr, "schema transition suffix predicate tests: FAIL (%s)\n", e.what());
            return 1;
        }
    }
    if (test_mode == "--test-schema-lifecycle" && argc == 3) {
        try {
            common_init(); ggml_backend_load_all(); llama_backend_init();
            auto mp = llama_model_default_params();
            mp.vocab_only = true;
            mp.n_gpu_layers = 0;
            model_ptr model(llama_model_load_from_file(argv[2], mp), llama_model_free);
            require(bool(model), "schema_test_vocabulary_load");
            test_schema_sampler_lifecycle(model.get());
            llama_backend_free();
            test_schema_transition_suffixes();
            std::printf("schema transition lifecycle tests: PASS (predicate + natural/forced sampler lifecycle, invalid/truncated JSON, reset)\n");
            return 0;
        } catch (const std::exception & e) {
            std::fprintf(stderr, "schema transition lifecycle tests: FAIL (%s)\n", e.what());
            return 1;
        }
    }
    if (argc != 5 || (std::string(argv[1]) != "cpu" && std::string(argv[1]) != "handoff")) {
        std::fprintf(stderr, "usage: %s cpu|handoff MODEL REQUEST.json OUTPUT.json | --test-schema-transition | --test-schema-lifecycle MODEL\n", argv[0]);
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
                    answer_schema_active = maybe_switch_to_answer_schema(
                        sampler, cpu.get(), sp, answer_schema_grammar, false, generated, answer_end_sequences);
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
