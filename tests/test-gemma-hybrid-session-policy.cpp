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
    return 0;
}
