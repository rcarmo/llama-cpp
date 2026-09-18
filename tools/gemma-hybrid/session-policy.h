#pragma once

#include "common.h"

#include <nlohmann/json.hpp>

#include <cmath>
#include <cstdint>
#include <map>
#include <stdexcept>
#include <string>
#include <vector>

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

inline std::string normalize_tool_choice(json & request) {
    if (!request.contains("tool_choice") || request.at("tool_choice").is_null()) {
        return "auto";
    }
    const json & choice = request.at("tool_choice");
    if (choice.is_string()) {
        const std::string value = choice.get<std::string>();
        if (value != "auto" && value != "none" && value != "required") {
            throw std::invalid_argument("tool_choice must be auto, none, required or a named function");
        }
        return value;
    }
    if (!choice.is_object() || choice.value("type", std::string()) != "function" ||
            !choice.contains("function") || !choice.at("function").is_object()) {
        throw std::invalid_argument("invalid tool_choice object");
    }
    const std::string name = choice.at("function").value("name", std::string());
    if (name.empty()) {
        throw std::invalid_argument("tool_choice function name is required");
    }
    json selected = json::array();
    for (const auto & tool : request.at("tools")) {
        if (tool.is_object() && tool.value("type", std::string()) == "function" &&
                tool.contains("function") && tool.at("function").is_object() &&
                tool.at("function").value("name", std::string()) == name) {
            selected.push_back(tool);
        }
    }
    if (selected.empty()) {
        throw std::invalid_argument("tool_choice function is not present in tools");
    }
    request["tools"] = std::move(selected);
    request["tool_choice"] = "required";
    return "required";
}

inline uint64_t sampling_override_mask(const json & request) {
    uint64_t result = 0;
    if (request.contains("samplers")) result |= COMMON_PARAMS_SAMPLING_CONFIG_SAMPLERS;
    if (request.contains("top_k")) result |= COMMON_PARAMS_SAMPLING_CONFIG_TOP_K;
    if (request.contains("top_p")) result |= COMMON_PARAMS_SAMPLING_CONFIG_TOP_P;
    if (request.contains("min_p")) result |= COMMON_PARAMS_SAMPLING_CONFIG_MIN_P;
    if (request.contains("xtc_probability")) result |= COMMON_PARAMS_SAMPLING_CONFIG_XTC_PROBABILITY;
    if (request.contains("xtc_threshold")) result |= COMMON_PARAMS_SAMPLING_CONFIG_XTC_THRESHOLD;
    if (request.contains("temperature")) result |= COMMON_PARAMS_SAMPLING_CONFIG_TEMP;
    if (request.contains("repeat_last_n")) result |= COMMON_PARAMS_SAMPLING_CONFIG_PENALTY_LAST_N;
    if (request.contains("repeat_penalty")) result |= COMMON_PARAMS_SAMPLING_CONFIG_PENALTY_REPEAT;
    if (request.contains("mirostat")) result |= COMMON_PARAMS_SAMPLING_CONFIG_MIROSTAT;
    if (request.contains("mirostat_tau")) result |= COMMON_PARAMS_SAMPLING_CONFIG_MIROSTAT_TAU;
    if (request.contains("mirostat_eta")) result |= COMMON_PARAMS_SAMPLING_CONFIG_MIROSTAT_ETA;
    return result;
}

inline std::vector<llama_logit_bias> eog_biases(const llama_vocab * vocab) {
    std::vector<llama_logit_bias> result;
    for (llama_token token = 0; token < llama_vocab_n_tokens(vocab); ++token) {
        if (llama_vocab_is_eog(vocab, token)) {
            result.push_back({token, -INFINITY});
        }
    }
    return result;
}

inline int32_t output_budget(const json & request, int32_t configured_max) {
    const int32_t requested = request.value("max_tokens", configured_max);
    if (requested == -1) {
        return configured_max;
    }
    if (requested < 1 || requested > configured_max) {
        throw std::invalid_argument("max_tokens must be -1 or between 1 and the configured maximum");
    }
    return requested;
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

inline void require_reset_owner(const std::string & active_conversation, const std::string & request_conversation) {
    if (request_conversation.empty()) {
        throw std::invalid_argument("conversation identity is required");
    }
    if (!active_conversation.empty() && request_conversation != active_conversation) {
        throw std::invalid_argument("conversation does not own the resident slot");
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
