#pragma once

#include <nlohmann/json.hpp>

#include <map>
#include <stdexcept>
#include <string>

namespace gemma_hybrid {

using json = nlohmann::ordered_json;

enum class request_action {
    start,
    append,
};

inline void normalize_request(json & request) {
    if (!request.is_object()) {
        throw std::invalid_argument("request body must be a JSON object");
    }
    if (!request.contains("messages") || !request.at("messages").is_array() || request.at("messages").empty()) {
        throw std::invalid_argument("messages must be a non-empty array");
    }
    if (!request.contains("tools") || request.at("tools").is_null()) {
        request["tools"] = json::array();
    }
    if (!request.at("tools").is_array()) {
        throw std::invalid_argument("tools must be an array");
    }
}

inline void check_append(const json & committed, const json & prior_tools, const json & request) {
    const auto & messages = request.at("messages");
    if (committed.empty()) {
        return;
    }
    if (messages.size() <= committed.size() || request.at("tools") != prior_tools) {
        throw std::invalid_argument("conversation is not append-only");
    }
    for (size_t i = 0; i < committed.size(); ++i) {
        if (messages[i] != committed[i]) {
            throw std::invalid_argument("committed message changed");
        }
    }
    for (size_t i = committed.size(); i < messages.size(); ++i) {
        const std::string role = messages[i].value("role", std::string());
        if (role != "user" && role != "tool") {
            throw std::invalid_argument("only user and tool messages may be appended");
        }
    }
}

inline request_action classify_request(
        const std::string & active_conversation,
        const std::string & request_conversation,
        const json & committed,
        const json & prior_tools,
        const json & request) {
    if (committed.empty()) {
        return request_action::start;
    }
    if (!request_conversation.empty() && request_conversation != active_conversation) {
        return request_action::start;
    }
    try {
        check_append(committed, prior_tools, request);
        return request_action::append;
    } catch (const std::invalid_argument &) {
        return request_action::start;
    }
}

inline std::string header_value(const std::map<std::string, std::string> & headers, const std::string & name) {
    for (const auto & item : headers) {
        if (item.first.size() != name.size()) {
            continue;
        }
        bool equal = true;
        for (size_t i = 0; i < name.size(); ++i) {
            const char a = item.first[i] >= 'A' && item.first[i] <= 'Z' ? item.first[i] - 'A' + 'a' : item.first[i];
            const char b = name[i] >= 'A' && name[i] <= 'Z' ? name[i] - 'A' + 'a' : name[i];
            equal = equal && a == b;
        }
        if (equal) {
            return item.second;
        }
    }
    return {};
}

} // namespace gemma_hybrid
