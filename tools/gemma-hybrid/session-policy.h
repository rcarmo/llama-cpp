#pragma once

#include "common.h"

#include <nlohmann/json.hpp>

#include <atomic>
#include <cctype>
#include <cmath>
#include <cstdint>
#include <map>
#include <mutex>
#include <stdexcept>
#include <string>
#include <vector>

namespace gemma_hybrid {

using json = nlohmann::ordered_json;

enum class request_action {
    start,
    append,
};

enum class inference_route {
    idle,
    vulkan_prefill_cpu_mtp,
    cpu_mtp_reuse,
    vulkan_prefill_cpu_target,
    cpu_target_reuse,
    cpu_target_tool_fallback,
    cpu_target_tool_fallback_reuse,
};

inline inference_route select_inference_route(bool target_only, bool has_tools, bool cold) {
    if (!target_only) {
        return cold ? inference_route::vulkan_prefill_cpu_mtp : inference_route::cpu_mtp_reuse;
    }
    if (has_tools) {
        return cold ? inference_route::cpu_target_tool_fallback : inference_route::cpu_target_tool_fallback_reuse;
    }
    return cold ? inference_route::vulkan_prefill_cpu_target : inference_route::cpu_target_reuse;
}

inline const char * inference_route_name(inference_route route) {
    switch (route) {
        case inference_route::idle: return "idle";
        case inference_route::vulkan_prefill_cpu_mtp: return "vulkan_prefill_cpu_mtp";
        case inference_route::cpu_mtp_reuse: return "cpu_mtp_reuse";
        case inference_route::vulkan_prefill_cpu_target: return "vulkan_prefill_cpu_target";
        case inference_route::cpu_target_reuse: return "cpu_target_reuse";
        case inference_route::cpu_target_tool_fallback: return "cpu_target_tool_fallback";
        case inference_route::cpu_target_tool_fallback_reuse: return "cpu_target_tool_fallback_reuse";
    }
    throw std::invalid_argument("invalid inference route");
}

struct inference_route_snapshot {
    inference_route route = inference_route::idle;
    bool zero_copy_ready = false;
    size_t shared_bytes = 0;
    size_t copied_bytes = 0;
};

class inference_route_state {
public:
    inference_route_snapshot snapshot() const {
        std::lock_guard<std::mutex> lock(mutex);
        return current;
    }

    void begin(inference_route next, bool cold) {
        std::lock_guard<std::mutex> lock(mutex);
        if (cold) {
            current.zero_copy_ready = false;
            current.shared_bytes = 0;
            current.copied_bytes = 0;
        }
        current.route = next;
    }

    void record_handoff(size_t shared, size_t copied) {
        std::lock_guard<std::mutex> lock(mutex);
        current.shared_bytes = shared;
        current.copied_bytes = copied;
        current.zero_copy_ready = shared > 0 && copied == 0;
    }

    void reset() {
        std::lock_guard<std::mutex> lock(mutex);
        current = {};
    }

private:
    mutable std::mutex mutex;
    inference_route_snapshot current;
};

struct inference_lifetime_snapshot {
    int32_t round = 0;
    size_t handoffs = 0;
    size_t shared_bytes = 0;
    size_t copied_bytes = 0;
};

inline json make_health_status(
        const std::string & model,
        int32_t context_size,
        bool processing,
        bool target_only,
        bool vulkan_model_resident,
        const inference_route_snapshot & current,
        const inference_lifetime_snapshot * lifetime = nullptr) {
    json result = {
        {"status", "ok"},
        {"model", model},
        {"context_size", context_size},
        {"processing", processing},
        {"route", inference_route_name(current.route)},
        {"zero_copy_ready", current.zero_copy_ready},
        {"current_shared_bytes", current.shared_bytes},
        {"current_copied_bytes", current.copied_bytes},
        {"mode", target_only ? "qwen35-target" : "gemma4-mtp"},
        {"vulkan_model_resident", vulkan_model_resident},
    };
    if (lifetime) {
        result["round"] = lifetime->round;
        result["handoffs"] = lifetime->handoffs;
        result["shared_bytes"] = lifetime->shared_bytes;
        result["copied_bytes"] = lifetime->copied_bytes;
        result["handoffs_total"] = lifetime->handoffs;
        result["shared_bytes_total"] = lifetime->shared_bytes;
        result["copied_bytes_total"] = lifetime->copied_bytes;
    }
    return result;
}

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

inline std::string strip_empty_think_prefix(const std::string & content) {
    static const std::string open = "<think>";
    static const std::string close = "</think>";
    size_t first = 0;
    while (first < content.size() && std::isspace(static_cast<unsigned char>(content[first]))) {
        ++first;
    }
    const size_t available = content.size() - first;
    if (available < open.size()) {
        return open.compare(0, available, content, first, available) == 0 ? std::string() : content;
    }
    if (content.compare(first, open.size(), open) != 0) {
        return content;
    }
    const size_t body = first + open.size();
    const size_t end = content.find(close, body);
    if (end == std::string::npos) {
        size_t candidate = body;
        while (candidate < content.size() && std::isspace(static_cast<unsigned char>(content[candidate]))) {
            ++candidate;
        }
        const size_t close_available = content.size() - candidate;
        return close.compare(0, close_available, content, candidate, close_available) == 0 ? std::string() : content;
    }
    for (size_t i = body; i < end; ++i) {
        if (!std::isspace(static_cast<unsigned char>(content[i]))) {
            return content;
        }
    }
    size_t visible = end + close.size();
    while (visible < content.size() && std::isspace(static_cast<unsigned char>(content[visible]))) {
        ++visible;
    }
    return content.substr(visible);
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

struct conversation_admission {
    request_action action = request_action::start;
    uint64_t generation = 0;
};

struct conversation_reset_token {
    std::string conversation;
    uint64_t generation = 0;
};

class conversation_owner_state {
public:
    conversation_admission classify_and_update(
            const std::string & request_conversation,
            const json & committed,
            const json & prior_tools,
            const json & request,
            uint64_t request_epoch,
            const std::atomic<uint64_t> & cancel_epoch) {
        std::lock_guard<std::mutex> lock(mutex);
        if (request_epoch != cancel_epoch.load()) {
            throw std::runtime_error("request cancelled");
        }
        const auto action = classify_request(active, request_conversation, committed, prior_tools, request);
        if (action == request_action::start) {
            active = request_conversation;
        }
        return {action, ++generation};
    }

    conversation_reset_token request_cancel(const std::string & request_conversation, std::atomic<uint64_t> & cancel_epoch) const {
        std::lock_guard<std::mutex> lock(mutex);
        require_reset_owner(active, request_conversation);
        cancel_epoch.fetch_add(1);
        return {request_conversation, generation};
    }

    void require(const conversation_reset_token & token) const {
        std::lock_guard<std::mutex> lock(mutex);
        require_reset_owner(active, token.conversation);
        if (token.generation != generation) {
            throw std::invalid_argument("conversation ownership changed during reset");
        }
    }

    void clear() {
        std::lock_guard<std::mutex> lock(mutex);
        active.clear();
    }

    std::string value() const {
        std::lock_guard<std::mutex> lock(mutex);
        return active;
    }

private:
    mutable std::mutex mutex;
    std::string active;
    uint64_t generation = 0;
};

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
