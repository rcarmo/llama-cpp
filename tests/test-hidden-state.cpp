#include "../src/llama-hidden-state.h"
#include "ggml-backend.h"
#include <cstdio>

int main() {
    auto storage = std::make_shared<llama_hidden_state_storage>();
    storage->n_embd = 8;
    storage->n_rows = 17;
    storage->valid_rows = 9;
    storage->generation = 4;
    storage->selected_row = 8;
    storage->buffer.reset(ggml_backend_buft_alloc_buffer(ggml_backend_cpu_buffer_type(),
            storage->n_embd*storage->n_rows*sizeof(float)));
    GGML_ASSERT(storage->buffer);

    llama_hidden_state_span span {};
    GGML_ASSERT(llama_hidden_state_span_make(storage, 4, 5, span));
    GGML_ASSERT(span.storage == storage.get() && span.row == 4 && span.n_rows == 5 && span.generation == 4);
    GGML_ASSERT(!llama_hidden_state_span_make(storage, 5, 5, span));
    GGML_ASSERT(!llama_hidden_state_span_make(storage, 10, 0, span));
    GGML_ASSERT(llama_hidden_state_select_row(storage, 7) && storage->selected_row == 7);
    GGML_ASSERT(!llama_hidden_state_select_row(storage, 9));

    const auto stale = span;
    storage->generation++;
    GGML_ASSERT(stale.generation != storage->generation);
    storage->deferred = true;
    GGML_ASSERT(!llama_hidden_state_span_make(storage, 0, 1, span));

    storage->deferred = false;
    auto dst = std::make_shared<llama_hidden_state_storage>();
    dst->n_embd = storage->n_embd;
    dst->n_rows = storage->n_rows;
    dst->deferred = true;
    int calls = 0;
    auto fail = [&](ggml_backend_buffer_t, size_t, size_t) -> ggml_backend_buffer_t { ++calls; return nullptr; };
    GGML_ASSERT(!llama_hidden_state_prepare(dst, storage, fail) && calls == 1 && dst->deferred && !dst->buffer);
    auto view = [&](ggml_backend_buffer_t src, size_t off, size_t n) {
        ++calls;
        GGML_ASSERT(off == 0 && n == ggml_backend_buffer_get_size(src));
        return ggml_backend_cpu_buffer_from_ptr((uint8_t *) ggml_backend_buffer_get_base(src) + off, n);
    };
    auto abandoned = llama_hidden_state_prepare(dst, storage, view);
    GGML_ASSERT(abandoned && dst->deferred && !dst->buffer);
    abandoned.reset();
    auto transfer = llama_hidden_state_prepare(dst, storage, view);
    GGML_ASSERT(transfer && transfer->shared_bytes == ggml_backend_buffer_get_size(storage->buffer.get()));
    auto * original = ggml_backend_buffer_get_base(storage->buffer.get());
    transfer->commit(); transfer.reset();
    GGML_ASSERT(!dst->deferred && ggml_backend_buffer_get_base(dst->buffer.get()) == original &&
        dst->generation == storage->generation + 1 && dst->selected_row == storage->selected_row);

    std::puts("PASS: hidden-state span bounds, selection, identity and generation-staleness metadata");
}
