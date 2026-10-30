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


#include "llama-ext.h"
#include "llama-io.h"

#include <set>
#include <stdexcept>
#include <string>
#include <vector>

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

//
// llama_memory_bufs
//

ggml_backend_buffer_ptr llama_memory_bufs::alloc_buf(ggml_context * ctx, ggml_backend_buffer_type_t buft, bool no_alloc, const char * name) {
    ggml_backend_buffer_ptr buf;
    if (no_alloc) {
        buf.reset(ggml_backend_buft_alloc_buffer(buft, /*size =*/ 0)); // dummy buffer
        for (ggml_tensor * t = ggml_get_first_tensor(ctx); t != nullptr; t = ggml_get_next_tensor(ctx, t)) {
            t->buffer = buf.get(); // set dummy buffer so that the backend scheduler won't try to allocate the tensors
        }
    } else {
        buf.reset(ggml_backend_alloc_ctx_tensors_from_buft(ctx, buft)); // real buffer
    }
    if (!buf) {
        throw std::runtime_error(std::string("failed to allocate buffer for ") + name);
    }
    return buf;
}

ggml_backend_buffer_t llama_memory_bufs::emplace(ggml_context_ptr ctx, ggml_backend_buffer_type_t buft, const char * name, const llama_memory_init & init) {
    if (init.deferred) {
        bufs.emplace_back(std::move(ctx), nullptr);
        return nullptr;
    }
    ggml_backend_buffer_ptr buf = no_alloc
        ? alloc_buf(ctx.get(), buft, true, name)
        : ggml_backend_buffer_ptr(llama_memory_alloc(ctx.get(), buft, init));
    if (!buf) {
        throw std::runtime_error(std::string("failed to allocate buffer for ") + name);
    }

    // initialize the buffer to avoid NaNs in the padding
    ggml_backend_buffer_clear(buf.get(), 0);

    bufs.emplace_back(std::move(ctx), std::move(buf));

    return bufs.back().second.get();
}

std::map<ggml_backend_buffer_type_t, size_t> llama_memory_bufs::memory_breakdown() const {
    std::map<ggml_backend_buffer_type_t, size_t> ret;
    for (const auto & [ctx, buf] : bufs) {
        if (!buf) continue;
        ggml_backend_buffer_type_t buft = ggml_backend_buffer_get_type(buf.get());

        if (no_alloc) {
            GGML_ASSERT(ggml_backend_buffer_get_base(buf.get()) == nullptr);
            ret[buft] += ggml_backend_alloc_ctx_tensors_from_buft_size(ctx.get(), buft);
        } else {
            ret[buft] += ggml_backend_buffer_get_size(buf.get());
        }
    }
    return ret;
}

// collects the buffers of the tensors that a state write visits, without keeping the data
struct llama_memory_buffers_writer : public llama_io_write_i {
    std::set<ggml_backend_buffer_t> buffers;
    size_t size = 0;

    void write(const void *, size_t n) override {
        size += n;
    }

    void write_tensor(ggml_tensor * tensor, size_t, size_t n) override {
        buffers.insert(tensor->buffer);
        size += n;
    }

    size_t n_bytes() override {
        return size;
    }
};

std::vector<ggml_backend_buffer_t> llama_memory_get_buffers(const llama_memory_t mem) {
    if (mem == nullptr) {
        return {};
    }

    llama_memory_buffers_writer writer;

    mem->state_write(writer);

    return std::vector<ggml_backend_buffer_t>(writer.buffers.begin(), writer.buffers.end());
}
