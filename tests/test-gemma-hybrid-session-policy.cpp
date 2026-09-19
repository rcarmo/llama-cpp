#include "session-policy.h"

#include <cstdio>
#include <map>
#include <stdexcept>
#include <string>

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
