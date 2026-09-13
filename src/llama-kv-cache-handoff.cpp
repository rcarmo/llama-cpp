#include "llama-kv-cache.h"
#include "llama-kv-cache-iswa.h"
#include "llama-impl.h"
#include <cstring>
#include <limits>
#include <stdexcept>
#include <typeinfo>

namespace {
struct binding {
    ggml_tensor * tensor;
    ggml_backend_buffer_t buffer;
    void * data;
};
void bind(const binding & b) noexcept {
    b.tensor->buffer = b.buffer;
    b.tensor->data = b.data;
    b.tensor->extra = nullptr;
}
bool same_tensor(const ggml_tensor * a, const ggml_tensor * b) {
    if (!a || !b) return a == b;
    return a->type == b->type && std::memcmp(a->ne,b->ne,sizeof(a->ne)) == 0 &&
           std::memcmp(a->nb,b->nb,sizeof(a->nb)) == 0 && ggml_is_contiguous(a) && ggml_is_contiguous(b);
}
void add_bytes(size_t & total, size_t n) {
    if (n > std::numeric_limits<size_t>::max()-total) throw std::overflow_error("KV byte count");
    total += n;
}
}

void llama_kv_cache::init_cpu_shared(const llama_memory_alloc_cb & alloc) {
    if (other || hparams.no_alloc) return;
    for (auto & cb : ctxs_bufs) {
        auto old = cb.second.get();
        if (!old || ggml_backend_buffer_is_host(old)) continue;
        // Context allocation may use a multi-buffer with no single address range.
        auto dev = ggml_backend_buft_get_device(ggml_backend_buffer_get_type(old));
        if (!dev || std::strcmp(ggml_backend_reg_name(ggml_backend_dev_backend_reg(dev)), "Vulkan") != 0 ||
            ggml_backend_buffer_get_size(old) > ggml_backend_buft_get_max_size(ggml_backend_buffer_get_type(old))) continue;
        ggml_backend_buffer_ptr replacement(alloc(ggml_backend_buffer_get_type(old), ggml_backend_buffer_get_size(old)));
        if (!replacement) continue;
        if (ggml_backend_buffer_get_type(old) != ggml_backend_buffer_get_type(replacement.get())) {
            throw std::runtime_error("shared KV allocator changed buffer type");
        }
        const uintptr_t base_old = (uintptr_t) ggml_backend_buffer_get_base(old);
        const uintptr_t base_new = (uintptr_t) ggml_backend_buffer_get_base(replacement.get());
        std::vector<binding> bindings;
        for (auto t = ggml_get_first_tensor(cb.first.get()); t; t = ggml_get_next_tensor(cb.first.get(), t)) {
            if (t->buffer != old || (uintptr_t)t->data < base_old) throw std::runtime_error("unsupported shared KV allocation");
            const size_t off = (uintptr_t)t->data-base_old;
            const size_t size = ggml_backend_buffer_get_size(replacement.get());
            if (off > size || ggml_nbytes(t) > size-off) throw std::runtime_error("shared KV range");
            bindings.push_back({t,replacement.get(),(void *)(base_new+off)});
        }
        ggml_backend_buffer_clear(replacement.get(),0);
        for (const auto & b : bindings) bind(b);
        cb.second = std::move(replacement);
    }
}

struct llama_kv_cache::handoff : llama_memory_transfer_i {
    llama_kv_cache & dst;
    std::vector<ggml_backend_buffer_ptr> buffers;
    std::vector<binding> bindings;
    llama_kv_cells_vec cells;
    std::vector<uint32_t> heads;
    std::vector<uint32_t> streams;
    handoff(llama_kv_cache & dst, const llama_kv_cache & src) : dst(dst), cells(src.v_cells), heads(src.v_heads), streams(src.seq_to_stream) {}
    void commit() noexcept override {
        for (const auto & b : bindings) bind(b);
        dst.v_cells.swap(cells);
        dst.v_heads.swap(heads);
        dst.seq_to_stream.swap(streams);
        dst.handoff_buffers.swap(buffers);
        for (auto & cb : dst.ctxs_bufs) cb.second.reset();
    }
};

llama_memory_transfer_ptr llama_kv_cache::prepare_handoff(llama_memory_i & source, const llama_memory_view_cb & view, bool allow_copy, size_t & shared, size_t & copied) {
    auto src = dynamic_cast<llama_kv_cache *>(&source);
    if (!src || typeid(*src)!=typeid(llama_kv_cache) || typeid(*this)!=typeid(llama_kv_cache) || src == this || other || src->other || v_cells_impl.use_count()!=1 || src->v_cells_impl.use_count()!=1 ||
        hparams.no_alloc || src->hparams.no_alloc || !handoff_buffers.empty() ||
        v_trans!=src->v_trans || n_seq_max!=src->n_seq_max || n_stream!=src->n_stream || n_pad!=src->n_pad ||
        n_swa!=src->n_swa || swa_type!=src->swa_type || get_size()!=src->get_size() ||
        attn_rot_k!=src->attn_rot_k || attn_rot_v!=src->attn_rot_v || map_layer_ids!=src->map_layer_ids ||
        layers.size()!=src->layers.size() || !sc_info.empty() || !src->sc_info.empty() || get_has_shift() || src->get_has_shift()) return nullptr;
    for (const auto & c : v_cells) if (c.get_used()) return nullptr;
    // Check every layout before acquiring buffers or copying payloads.
    for (size_t i=0;i<layers.size();++i) {
        const auto & d=layers[i]; const auto & s=src->layers[i];
        if (d.il!=s.il || !same_tensor(d.k,s.k) || !same_tensor(d.v,s.v)) return nullptr;
        for (auto t : {d.k,d.v}) if (t && (!t->buffer || !ggml_backend_buffer_is_host(t->buffer))) return nullptr;
    }
    auto result = std::make_unique<handoff>(*this,*src);
    size_t n_shared=0,n_copied=0;
    std::vector<uint8_t> scratch;
    for (size_t i=0;i<layers.size();++i) for (int v=0;v<2;++v) {
        auto s=v?src->layers[i].v:src->layers[i].k;
        auto d=v?layers[i].v:layers[i].k;
        if (!s) continue;
        const size_t n=ggml_nbytes(s);
        const uintptr_t base=(uintptr_t)ggml_backend_buffer_get_base(s->buffer);
        if ((uintptr_t)s->data<base) return nullptr;
        const size_t offset=(uintptr_t)s->data-base;
        ggml_backend_buffer_ptr buffer(view(s->buffer,offset,n));
        if (buffer) {
            if (!ggml_backend_buffer_is_host(buffer.get()) || ggml_backend_buffer_get_size(buffer.get())<n) return nullptr;
            add_bytes(n_shared,n);
        } else {
            if (!allow_copy) return nullptr;
            buffer.reset(ggml_backend_buft_alloc_buffer(ggml_backend_cpu_buffer_type(),n));
            if (!buffer) throw std::bad_alloc();
            scratch.resize(std::min(n,size_t(1)<<20));
            auto out=(uint8_t *)ggml_backend_buffer_get_base(buffer.get());
            for(size_t pos=0;pos<n;) {
                const size_t len=std::min(scratch.size(),n-pos);
                ggml_backend_tensor_get(s,scratch.data(),pos,len);
                std::memcpy(out+pos,scratch.data(),len);
                pos+=len;
            }
            add_bytes(n_copied,n);
        }
        ggml_backend_buffer_set_usage(buffer.get(), GGML_BACKEND_BUFFER_USAGE_ANY);
        auto ptr=(uint8_t *)ggml_backend_buffer_get_base(buffer.get());
        result->bindings.push_back({d,buffer.get(),ptr});
        for (auto t : v?layers[i].v_stream:layers[i].k_stream) {
            if (t->view_src!=d || t->view_offs>n || ggml_nbytes(t)>n-t->view_offs) return nullptr;
            result->bindings.push_back({t,buffer.get(),ptr+t->view_offs});
        }
        result->buffers.push_back(std::move(buffer));
    }
    add_bytes(shared,n_shared); add_bytes(copied,n_copied);
    return result;
}

void llama_kv_cache_iswa::init_cpu_shared(const llama_memory_alloc_cb & alloc) {
    kv_base->init_cpu_shared(alloc);
    kv_swa->init_cpu_shared(alloc);
}

llama_memory_transfer_ptr llama_kv_cache_iswa::prepare_handoff(llama_memory_i & source, const llama_memory_view_cb & view, bool allow_copy, size_t & shared, size_t & copied) {
    auto src=dynamic_cast<llama_kv_cache_iswa *>(&source);
    if (!src || typeid(*src)!=typeid(llama_kv_cache_iswa) || typeid(*this)!=typeid(llama_kv_cache_iswa) || src==this) return nullptr;
    struct pair_transfer : llama_memory_transfer_i {
        llama_memory_transfer_ptr base,swa;
        void commit() noexcept override { base->commit(); swa->commit(); }
    };
    auto result=std::make_unique<pair_transfer>();
    size_t n_shared=0,n_copied=0;
    result->base=kv_base->prepare_handoff(*src->kv_base,view,allow_copy,n_shared,n_copied);
    if (!result->base) return nullptr;
    result->swa=kv_swa->prepare_handoff(*src->kv_swa,view,allow_copy,n_shared,n_copied);
    if (!result->swa) return nullptr;
    add_bytes(shared,n_shared); add_bytes(copied,n_copied);
    return result;
}
