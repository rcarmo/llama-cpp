#include "llama-hidden-state.h"

bool llama_hidden_state_span_make(
        const llama_hidden_state_ptr & storage, uint32_t row, uint32_t n_rows, llama_hidden_state_span & span) {
    if (!storage || storage->deferred || !storage->buffer || row > storage->valid_rows ||
        n_rows > storage->valid_rows - row) return false;
    span = {storage.get(), row, n_rows, storage->generation};
    return true;
}

bool llama_hidden_state_select_row(const llama_hidden_state_ptr & storage, uint32_t row) {
    if (!storage || row >= storage->valid_rows) return false;
    storage->selected_row = row;
    return true;
}

void llama_hidden_state_transfer::commit() noexcept {
    dst->buffer = std::move(view);
    dst->deferred = false;
    dst->generation = src->generation + 1;
    dst->valid_rows = src->valid_rows;
    dst->selected_row = src->selected_row;
}

std::unique_ptr<llama_hidden_state_transfer> llama_hidden_state_prepare(
        const llama_hidden_state_ptr & dst, const llama_hidden_state_ptr & src,
        const std::function<ggml_backend_buffer_t(ggml_backend_buffer_t, size_t, size_t)> & view) {
    if (!dst || !src || !dst->deferred || src->deferred || dst->buffer || !src->buffer ||
        dst->n_embd != src->n_embd || dst->n_rows != src->n_rows || !view) return nullptr;
    const size_t n = ggml_backend_buffer_get_size(src->buffer.get());
    ggml_backend_buffer_ptr acquired(view(src->buffer.get(), 0, n));
    if (!acquired || !ggml_backend_buffer_is_host(acquired.get()) ||
        ggml_backend_buffer_get_size(acquired.get()) < n || !ggml_backend_buffer_get_base(acquired.get())) return nullptr;
    auto result = std::make_unique<llama_hidden_state_transfer>();
    result->dst = dst;
    result->src = src;
    result->view = std::move(acquired);
    result->shared_bytes = n;
    return result;
}
