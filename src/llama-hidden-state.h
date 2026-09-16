#pragma once

#include "ggml-cpp.h"
#include "llama.h"

#include <cstdint>
#include <functional>
#include <memory>

struct llama_hidden_state_storage {
    ggml_backend_buffer_ptr buffer;
    uint32_t n_embd = 0;
    uint32_t n_rows = 0;
    bool deferred = false;
    uint64_t generation = 0;
    uint32_t valid_rows = 1;
    uint32_t selected_row = 0;
};

using llama_hidden_state_ptr = std::shared_ptr<llama_hidden_state_storage>;

bool llama_hidden_state_span_make(
        const llama_hidden_state_ptr & storage, uint32_t row, uint32_t n_rows, llama_hidden_state_span & span);
bool llama_hidden_state_select_row(const llama_hidden_state_ptr & storage, uint32_t row);

struct llama_hidden_state_transfer {
    llama_hidden_state_ptr dst;
    llama_hidden_state_ptr src;
    ggml_backend_buffer_ptr view;
    size_t shared_bytes = 0;

    void commit() noexcept;
};

std::unique_ptr<llama_hidden_state_transfer> llama_hidden_state_prepare(
        const llama_hidden_state_ptr & dst, const llama_hidden_state_ptr & src,
        const std::function<ggml_backend_buffer_t(ggml_backend_buffer_t, size_t, size_t)> & view);
