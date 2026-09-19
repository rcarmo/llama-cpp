#include "session-policy.h"

#include <atomic>
#include <cstdio>
#include <map>
#include <stdexcept>
#include <string>
#include <thread>

using gemma_hybrid::json;

#define CHECK(condition) do { if (!(condition)) { std::fprintf(stderr, "CHECK failed at line %d: %s\n", __LINE__, #condition); return 1; } } while (0)

static json message(const char * role, const char * content) {
    return {{"role", role}, {"content", content}};
}

int main() {
    common_threadpools empty_threadpools;
    CHECK(!empty_threadpools.initialized());

    json first = {{"messages", json::array({message("user", "one")})}};
    gemma_hybrid::normalize_request(first);
    CHECK(first.at("tools") == json::array());
    CHECK(gemma_hybrid::output_budget(first, 2048) == 2048);
    first["max_tokens"] = 512;
    CHECK(gemma_hybrid::output_budget(first, 2048) == 512);
    first["max_tokens"] = -1;
    CHECK(gemma_hybrid::output_budget(first, 2048) == 2048);
    first.erase("max_tokens");
    bool invalid_budget = false;
    try {
        json invalid = first;
        invalid["max_tokens"] = 2049;
        (void) gemma_hybrid::output_budget(invalid, 2048);
    } catch (const std::invalid_argument &) {
        invalid_budget = true;
    }
    CHECK(invalid_budget);
    CHECK(gemma_hybrid::classify_request("", "conversation-a", json::array(), json::array(), first) == gemma_hybrid::request_action::start);

    using gemma_hybrid::inference_route;
    CHECK(gemma_hybrid::select_inference_route(false, false, true) == inference_route::vulkan_prefill_cpu_mtp);
    CHECK(gemma_hybrid::select_inference_route(false, false, false) == inference_route::cpu_mtp_reuse);
    CHECK(gemma_hybrid::select_inference_route(false, true, true) == inference_route::vulkan_prefill_cpu_mtp);
    CHECK(gemma_hybrid::select_inference_route(false, true, false) == inference_route::cpu_mtp_reuse);
    CHECK(gemma_hybrid::select_inference_route(true, false, true) == inference_route::vulkan_prefill_cpu_target);
    CHECK(gemma_hybrid::select_inference_route(true, false, false) == inference_route::cpu_target_reuse);
    CHECK(gemma_hybrid::select_inference_route(true, true, true) == inference_route::cpu_target_tool_fallback);
    CHECK(gemma_hybrid::select_inference_route(true, true, false) == inference_route::cpu_target_tool_fallback_reuse);
    CHECK(std::string(gemma_hybrid::inference_route_name(inference_route::idle)) == "idle");
    CHECK(std::string(gemma_hybrid::inference_route_name(inference_route::vulkan_prefill_cpu_mtp)) == "vulkan_prefill_cpu_mtp");
    CHECK(std::string(gemma_hybrid::inference_route_name(inference_route::cpu_mtp_reuse)) == "cpu_mtp_reuse");
    CHECK(std::string(gemma_hybrid::inference_route_name(inference_route::vulkan_prefill_cpu_target)) == "vulkan_prefill_cpu_target");
    CHECK(std::string(gemma_hybrid::inference_route_name(inference_route::cpu_target_reuse)) == "cpu_target_reuse");
    CHECK(std::string(gemma_hybrid::inference_route_name(inference_route::cpu_target_tool_fallback)) == "cpu_target_tool_fallback");
    CHECK(std::string(gemma_hybrid::inference_route_name(inference_route::cpu_target_tool_fallback_reuse)) == "cpu_target_tool_fallback_reuse");

    gemma_hybrid::inference_route_state route_state;
    auto route_snapshot = route_state.snapshot();
    CHECK(route_snapshot.route == inference_route::idle);
    CHECK(!route_snapshot.zero_copy_ready);
    CHECK(route_snapshot.shared_bytes == 0);
    CHECK(route_snapshot.copied_bytes == 0);
    route_state.begin(inference_route::vulkan_prefill_cpu_target, true);
    route_snapshot = route_state.snapshot();
    CHECK(route_snapshot.route == inference_route::vulkan_prefill_cpu_target);
    CHECK(!route_snapshot.zero_copy_ready);
    CHECK(route_snapshot.shared_bytes == 0);
    CHECK(route_snapshot.copied_bytes == 0);
    route_state.record_handoff(4096, 0);
    route_snapshot = route_state.snapshot();
    CHECK(route_snapshot.route == inference_route::vulkan_prefill_cpu_target);
    CHECK(route_snapshot.zero_copy_ready);
    CHECK(route_snapshot.shared_bytes == 4096);
    CHECK(route_snapshot.copied_bytes == 0);
    route_state.begin(inference_route::cpu_target_reuse, false);
    route_snapshot = route_state.snapshot();
    CHECK(route_snapshot.route == inference_route::cpu_target_reuse);
    CHECK(route_snapshot.zero_copy_ready);
    CHECK(route_snapshot.shared_bytes == 4096);
    route_state.begin(inference_route::cpu_target_tool_fallback, true);
    route_snapshot = route_state.snapshot();
    CHECK(route_snapshot.route == inference_route::cpu_target_tool_fallback);
    CHECK(!route_snapshot.zero_copy_ready);
    CHECK(route_snapshot.shared_bytes == 0);
    CHECK(route_snapshot.copied_bytes == 0);
    route_state.record_handoff(4096, 8);
    route_snapshot = route_state.snapshot();
    CHECK(!route_snapshot.zero_copy_ready);
    CHECK(route_snapshot.shared_bytes == 4096);
    CHECK(route_snapshot.copied_bytes == 8);
    route_state.reset();
    route_snapshot = route_state.snapshot();
    CHECK(route_snapshot.route == inference_route::idle);
    CHECK(!route_snapshot.zero_copy_ready);
    CHECK(route_snapshot.shared_bytes == 0);
    CHECK(route_snapshot.copied_bytes == 0);

    std::atomic<bool> route_writer_done{false};
    std::atomic<bool> invalid_route_snapshot{false};
    std::thread route_writer([&] {
        for (int i = 0; i < 10000; ++i) {
            route_state.begin(inference_route::cpu_target_tool_fallback, true);
            route_state.begin(inference_route::vulkan_prefill_cpu_target, true);
            route_state.record_handoff(4096, 0);
            route_state.begin(inference_route::cpu_target_reuse, false);
            route_state.reset();
        }
        route_writer_done.store(true);
    });
    while (!route_writer_done.load()) {
        const auto current = route_state.snapshot();
        const bool idle = current.route == inference_route::idle && !current.zero_copy_ready && current.shared_bytes == 0 && current.copied_bytes == 0;
        const bool tool = current.route == inference_route::cpu_target_tool_fallback && !current.zero_copy_ready && current.shared_bytes == 0 && current.copied_bytes == 0;
        const bool prefill = current.route == inference_route::vulkan_prefill_cpu_target && !current.zero_copy_ready && current.shared_bytes == 0 && current.copied_bytes == 0;
        const bool handed_off = current.route == inference_route::vulkan_prefill_cpu_target && current.zero_copy_ready && current.shared_bytes == 4096 && current.copied_bytes == 0;
        const bool warm = current.route == inference_route::cpu_target_reuse && current.zero_copy_ready && current.shared_bytes == 4096 && current.copied_bytes == 0;
        if (!idle && !tool && !prefill && !handed_off && !warm) {
            invalid_route_snapshot.store(true);
            break;
        }
    }
    route_writer.join();
    CHECK(!invalid_route_snapshot.load());

    const gemma_hybrid::inference_route_snapshot health_current = {
        inference_route::vulkan_prefill_cpu_target,
        true,
        4096,
        0,
    };
    const json busy_health = gemma_hybrid::make_health_status("model", 2048, true, true, true, health_current);
    const json expected_busy_health = {
        {"status", "ok"},
        {"model", "model"},
        {"context_size", 2048},
        {"processing", true},
        {"route", "vulkan_prefill_cpu_target"},
        {"zero_copy_ready", true},
        {"current_shared_bytes", 4096},
        {"current_copied_bytes", 0},
        {"mode", "qwen35-target"},
        {"vulkan_model_resident", true},
    };
    CHECK(busy_health == expected_busy_health);
    const gemma_hybrid::inference_lifetime_snapshot health_lifetime = {2, 3, 8192, 0};
    const json idle_health = gemma_hybrid::make_health_status("model", 32768, false, false, true, health_current, &health_lifetime);
    const json expected_idle_health = {
        {"status", "ok"},
        {"model", "model"},
        {"context_size", 32768},
        {"processing", false},
        {"route", "vulkan_prefill_cpu_target"},
        {"zero_copy_ready", true},
        {"current_shared_bytes", 4096},
        {"current_copied_bytes", 0},
        {"mode", "gemma4-mtp"},
        {"vulkan_model_resident", true},
        {"round", 2},
        {"handoffs", 3},
        {"shared_bytes", 8192},
        {"copied_bytes", 0},
        {"handoffs_total", 3},
        {"shared_bytes_total", 8192},
        {"copied_bytes_total", 0},
    };
    CHECK(idle_health == expected_idle_health);

    json sampling = {
        {"samplers", json::array({"top_k", "temperature"})},
        {"top_k", 1},
        {"top_p", 0.9},
        {"min_p", 0.0},
        {"xtc_probability", 0.1},
        {"xtc_threshold", 0.2},
        {"temperature", 0.0},
        {"repeat_last_n", 32},
        {"repeat_penalty", 1.1},
        {"mirostat", 1},
        {"mirostat_tau", 4.0},
        {"mirostat_eta", 0.2},
    };
    const uint64_t sampling_mask = gemma_hybrid::sampling_override_mask(sampling);
    CHECK((sampling_mask & COMMON_PARAMS_SAMPLING_CONFIG_SAMPLERS) != 0);
    CHECK((sampling_mask & COMMON_PARAMS_SAMPLING_CONFIG_TOP_K) != 0);
    CHECK((sampling_mask & COMMON_PARAMS_SAMPLING_CONFIG_TOP_P) != 0);
    CHECK((sampling_mask & COMMON_PARAMS_SAMPLING_CONFIG_MIN_P) != 0);
    CHECK((sampling_mask & COMMON_PARAMS_SAMPLING_CONFIG_XTC_PROBABILITY) != 0);
    CHECK((sampling_mask & COMMON_PARAMS_SAMPLING_CONFIG_XTC_THRESHOLD) != 0);
    CHECK((sampling_mask & COMMON_PARAMS_SAMPLING_CONFIG_TEMP) != 0);
    CHECK((sampling_mask & COMMON_PARAMS_SAMPLING_CONFIG_PENALTY_LAST_N) != 0);
    CHECK((sampling_mask & COMMON_PARAMS_SAMPLING_CONFIG_PENALTY_REPEAT) != 0);
    CHECK((sampling_mask & COMMON_PARAMS_SAMPLING_CONFIG_MIROSTAT) != 0);
    CHECK((sampling_mask & COMMON_PARAMS_SAMPLING_CONFIG_MIROSTAT_TAU) != 0);
    CHECK((sampling_mask & COMMON_PARAMS_SAMPLING_CONFIG_MIROSTAT_ETA) != 0);
    CHECK(gemma_hybrid::sampling_override_mask(json::object()) == 0);

    CHECK(gemma_hybrid::strip_empty_think_prefix("").empty());
    CHECK(gemma_hybrid::strip_empty_think_prefix("<thi").empty());
    CHECK(gemma_hybrid::strip_empty_think_prefix("<think>").empty());
    CHECK(gemma_hybrid::strip_empty_think_prefix("<think>\n\n</thi").empty());
    CHECK(gemma_hybrid::strip_empty_think_prefix("<think>\n\n</think>\n\n").empty());
    CHECK(gemma_hybrid::strip_empty_think_prefix(" <think>\n\t</think>\nvisible") == "visible");
    CHECK(gemma_hybrid::strip_empty_think_prefix("<think>reasoning</think>\nvisible") == "<think>reasoning</think>\nvisible");
    CHECK(gemma_hybrid::strip_empty_think_prefix("<think>\nnot empty") == "<think>\nnot empty");
    CHECK(gemma_hybrid::strip_empty_think_prefix("plain content") == "plain content");
    CHECK(gemma_hybrid::strip_empty_think_prefix("<thinking>") == "<thinking>");

    json tool_request = {
        {"messages", json::array({message("user", "tool")})},
        {"tools", json::array({
            {{"type", "function"}, {"function", {{"name", "one"}}}},
            {{"type", "function"}, {"function", {{"name", "two"}}}}
        })},
        {"tool_choice", {{"type", "function"}, {"function", {{"name", "two"}}}}}
    };
    gemma_hybrid::normalize_request(tool_request);
    CHECK(gemma_hybrid::normalize_tool_choice(tool_request) == "required");
    CHECK(tool_request.at("tool_choice") == "required");
    CHECK(tool_request.at("tools").size() == 1);
    CHECK(tool_request.at("tools")[0].at("function").at("name") == "two");
    for (const char * value : {"auto", "none", "required"}) {
        json string_choice = {{"messages", json::array({message("user", "tool")})}, {"tools", json::array()}, {"tool_choice", value}};
        gemma_hybrid::normalize_request(string_choice);
        CHECK(gemma_hybrid::normalize_tool_choice(string_choice) == value);
    }
    bool invalid_choice = false;
    try {
        json missing = {
            {"messages", json::array({message("user", "tool")})},
            {"tools", json::array({{{"type", "function"}, {"function", {{"name", "one"}}}}})},
            {"tool_choice", {{"type", "function"}, {"function", {{"name", "missing"}}}}}
        };
        gemma_hybrid::normalize_request(missing);
        gemma_hybrid::normalize_tool_choice(missing);
    } catch (const std::invalid_argument &) {
        invalid_choice = true;
    }
    CHECK(invalid_choice);
    invalid_choice = false;
    try {
        json malformed = {{"messages", json::array({message("user", "tool")})}, {"tools", json::array()}, {"tool_choice", json::object()}};
        gemma_hybrid::normalize_request(malformed);
        gemma_hybrid::normalize_tool_choice(malformed);
    } catch (const std::invalid_argument &) {
        invalid_choice = true;
    }
    CHECK(invalid_choice);

    json committed = first.at("messages");
    committed.push_back(message("assistant", "answer"));
    json append = {{"messages", committed}, {"tools", json::array()}};
    append["messages"].push_back(message("user", "two"));
    CHECK(gemma_hybrid::classify_request("conversation-a", "conversation-a", committed, json::array(), append) == gemma_hybrid::request_action::append);

    gemma_hybrid::conversation_owner_state owner_state;
    std::atomic<uint64_t> owner_cancel_epoch{0};
    const auto first_admission = owner_state.classify_and_update("conversation-a", json::array(), json::array(), first, 0, owner_cancel_epoch);
    CHECK(first_admission.action == gemma_hybrid::request_action::start);
    CHECK(owner_state.value() == "conversation-a");
    const auto append_admission = owner_state.classify_and_update("conversation-a", committed, json::array(), append, 0, owner_cancel_epoch);
    CHECK(append_admission.action == gemma_hybrid::request_action::append);
    CHECK(append_admission.generation > first_admission.generation);
    const auto valid_reset = owner_state.request_cancel("conversation-a", owner_cancel_epoch);
    CHECK(owner_cancel_epoch.load() == 1);
    owner_state.require(valid_reset);
    bool cancelled_admission_rejected = false;
    try {
        (void) owner_state.classify_and_update("conversation-a", committed, json::array(), append, 0, owner_cancel_epoch);
    } catch (const std::runtime_error & error) {
        cancelled_admission_rejected = std::string(error.what()) == "request cancelled";
    }
    CHECK(cancelled_admission_rejected);
    owner_state.require(valid_reset);
    const auto newer_admission = owner_state.classify_and_update("conversation-a", committed, json::array(), append, 1, owner_cancel_epoch);
    CHECK(newer_admission.action == gemma_hybrid::request_action::append);
    bool stale_reset_rejected = false;
    try {
        owner_state.require(valid_reset);
    } catch (const std::invalid_argument &) {
        stale_reset_rejected = true;
    }
    CHECK(stale_reset_rejected);
    bool wrong_owner_rejected = false;
    try {
        (void) owner_state.request_cancel("conversation-b", owner_cancel_epoch);
    } catch (const std::invalid_argument &) {
        wrong_owner_rejected = true;
    }
    CHECK(wrong_owner_rejected);
    CHECK(owner_cancel_epoch.load() == 1);
    std::atomic<bool> owner_reader_done{false};
    std::atomic<bool> owner_reader_invalid{false};
    std::thread owner_reader([&] {
        while (!owner_reader_done.load()) {
            const std::string owner = owner_state.value();
            if (!owner.empty() && owner != "conversation-a") {
                owner_reader_invalid.store(true);
                break;
            }
        }
    });
    for (int i = 0; i < 10000; ++i) {
        owner_state.clear();
        CHECK(owner_state.classify_and_update("conversation-a", json::array(), json::array(), first, 1, owner_cancel_epoch).action == gemma_hybrid::request_action::start);
    }
    owner_reader_done.store(true);
    owner_reader.join();
    CHECK(!owner_reader_invalid.load());
    owner_state.clear();
    CHECK(owner_state.value().empty());

    json tool_append = append;
    tool_append["messages"].back() = {{"role", "tool"}, {"tool_call_id", "call-1"}, {"content", "result"}};
    gemma_hybrid::check_append(committed, json::array(), tool_append);

    json replacement = append;
    replacement["messages"][0]["content"] = "changed";
    CHECK(gemma_hybrid::classify_request("conversation-a", "conversation-a", committed, json::array(), replacement) == gemma_hybrid::request_action::start);
    CHECK(gemma_hybrid::classify_request("conversation-a", "conversation-b", committed, json::array(), replacement) == gemma_hybrid::request_action::start);
    CHECK(gemma_hybrid::classify_request("conversation-a", "", committed, json::array(), replacement) == gemma_hybrid::request_action::start);

    json changed_tools = append;
    changed_tools["tools"] = json::array({{{"type", "function"}, {"function", {{"name", "x"}}}}});
    bool rejected = false;
    try {
        gemma_hybrid::check_append(committed, json::array(), changed_tools);
    } catch (const std::invalid_argument &) {
        rejected = true;
    }
    CHECK(rejected);
    CHECK(gemma_hybrid::classify_request("conversation-a", "conversation-a", committed, json::array(), changed_tools) == gemma_hybrid::request_action::start);

    json invalid_role = append;
    invalid_role["messages"].back()["role"] = "assistant";
    rejected = false;
    try {
        gemma_hybrid::check_append(committed, json::array(), invalid_role);
    } catch (const std::invalid_argument &) {
        rejected = true;
    }
    CHECK(rejected);
    CHECK(gemma_hybrid::classify_request("conversation-a", "conversation-a", committed, json::array(), invalid_role) == gemma_hybrid::request_action::start);

    std::map<std::string, std::string> headers = {{"x-conversation-id", "conversation-a"}};
    CHECK(gemma_hybrid::header_value(headers, "X-Conversation-Id") == "conversation-a");
    CHECK(gemma_hybrid::header_value(headers, "missing").empty());

    gemma_hybrid::require_reset_owner("conversation-a", "conversation-a");
    gemma_hybrid::require_reset_owner("", "conversation-a");
    bool rejected_reset = false;
    try {
        gemma_hybrid::require_reset_owner("conversation-a", "");
    } catch (const std::invalid_argument &) {
        rejected_reset = true;
    }
    CHECK(rejected_reset);
    rejected_reset = false;
    try {
        gemma_hybrid::require_reset_owner("conversation-a", "conversation-b");
    } catch (const std::invalid_argument &) {
        rejected_reset = true;
    }
    CHECK(rejected_reset);
    return 0;
}
