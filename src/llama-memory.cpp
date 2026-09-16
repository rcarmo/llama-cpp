#include "llama-memory.h"
#include "ggml-alloc.h"
#include <stdexcept>

ggml_backend_buffer_t llama_memory_alloc(ggml_context * ctx, ggml_backend_buffer_type_t buft, const llama_memory_init & init) {
    if (init.deferred) {
        return nullptr;
    }
    if (!init.strict) {
        return ggml_backend_alloc_ctx_tensors_from_buft(ctx, buft);
    }
    const size_t size = ggml_backend_alloc_ctx_tensors_from_buft_size(ctx, buft);
    if (!init.alloc || size == 0 || size > ggml_backend_buft_get_max_size(buft)) {
        throw std::runtime_error("unsupported strict shared state allocation");
    }
    ggml_backend_buffer_ptr buffer(init.alloc(buft, size));
    if (!buffer || ggml_backend_buffer_get_type(buffer.get()) != buft || ggml_backend_buffer_get_size(buffer.get()) < size) {
        throw std::runtime_error("strict shared state allocator unavailable");
    }
    ggml_tallocr alloc = ggml_tallocr_new(buffer.get());
    for (auto * t = ggml_get_first_tensor(ctx); t; t = ggml_get_next_tensor(ctx, t)) {
        if (t->view_src) {
            if (ggml_backend_view_init(t) != GGML_STATUS_SUCCESS) {
                throw std::runtime_error("shared state view init failed");
            }
        } else if (ggml_tallocr_alloc(&alloc, t) != GGML_STATUS_SUCCESS) {
            throw std::runtime_error("shared state tensor allocation failed");
        }
    }
    ggml_backend_buffer_clear(buffer.get(), 0);
    return buffer.release();
}


llama_memory_status llama_memory_status_combine(llama_memory_status s0, llama_memory_status s1) {
    bool has_update = false;

    switch (s0) {
        case LLAMA_MEMORY_STATUS_SUCCESS:
            {
                has_update = true;
                break;
            }
        case LLAMA_MEMORY_STATUS_NO_UPDATE:
            {
                break;
            }
        case LLAMA_MEMORY_STATUS_FAILED_PREPARE:
        case LLAMA_MEMORY_STATUS_FAILED_COMPUTE:
            {
                return s0;
            }
    }

    switch (s1) {
        case LLAMA_MEMORY_STATUS_SUCCESS:
            {
                has_update = true;
                break;
            }
        case LLAMA_MEMORY_STATUS_NO_UPDATE:
            {
                break;
            }
        case LLAMA_MEMORY_STATUS_FAILED_PREPARE:
        case LLAMA_MEMORY_STATUS_FAILED_COMPUTE:
            {
                return s1;
            }
    }

    // if either status has an update, then the combined status has an update
    return has_update ? LLAMA_MEMORY_STATUS_SUCCESS : LLAMA_MEMORY_STATUS_NO_UPDATE;
}

bool llama_memory_status_is_fail(llama_memory_status status) {
    switch (status) {
        case LLAMA_MEMORY_STATUS_SUCCESS:
        case LLAMA_MEMORY_STATUS_NO_UPDATE:
            {
                return false;
            }
        case LLAMA_MEMORY_STATUS_FAILED_PREPARE:
        case LLAMA_MEMORY_STATUS_FAILED_COMPUTE:
            {
                return true;
            }
    }

    return false;
}
