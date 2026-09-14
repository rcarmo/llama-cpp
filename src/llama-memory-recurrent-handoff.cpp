#include "llama-memory-recurrent.h"
#include "llama-memory-hybrid.h"
#include "llama-impl.h"

#include <cstring>
#include <limits>
#include <map>
#include <stdexcept>
#include <typeinfo>

namespace {
struct recurrent_binding {
    ggml_tensor * tensor;
    ggml_backend_buffer_t buffer;
    void * data;
};

bool same_tensor(const ggml_tensor * a, const ggml_tensor * b) {
    if (!a || !b) return a == b;
    return a->type == b->type && ggml_is_contiguous(a) && ggml_is_contiguous(b) &&
        std::memcmp(a->ne, b->ne, sizeof(a->ne)) == 0 && std::memcmp(a->nb, b->nb, sizeof(a->nb)) == 0;
}

void add_bytes(size_t & total, size_t n) {
    if (n > std::numeric_limits<size_t>::max() - total) throw std::overflow_error("hybrid handoff byte count");
    total += n;
}
}

bool llama_memory_recurrent::handoff_state_valid() const {
    if (!handoff_strict || handoff_deferred || !handoff_committed || size != 1 || n_seq_max != 1 ||
        cells.size() != 1 || rs_idx.size() != 1 || rs_idx[0] > handoff_valid_depth) return false;
    const auto & c = cells[0];
    if (used == 0) return c.is_empty() && c.pos == -1 && rs_idx[0] == 0;
    return used == 1 && head == 0 && n == 1 && c.pos >= 0 && c.tail == 0 && c.src == 0 &&
        c.seq_id.size() == 1 && c.has_seq_id(0) && rs_idx[0] <= n_rs_seq;
}

bool llama_memory_recurrent::handoff_begin_compute() {
    if (!handoff_strict) return true;
    if (handoff_deferred || !handoff_committed) return false;
    handoff_committed = false;
    return true;
}

void llama_memory_recurrent::handoff_end_compute(const llama_ubatch & batch, bool success) {
    if (!handoff_strict) return;
    handoff_committed = success;
    handoff_valid_depth = success && batch.n_seq_tokens > 0 ? std::min(n_rs_seq, batch.n_seq_tokens - 1) : 0;
    ++handoff_generation;
}

struct llama_memory_recurrent::handoff : llama_memory_transfer_i {
    llama_memory_recurrent & dst;
    std::vector<ggml_backend_buffer_ptr> buffers;
    std::vector<recurrent_binding> bindings;
    std::vector<mem_cell> cells;
    std::vector<uint32_t> rs_idx;
    uint32_t head, used, n, depth;
    int32_t rs_z;
    uint64_t generation;

    handoff(llama_memory_recurrent & dst, const llama_memory_recurrent & src) :
        dst(dst), cells(src.cells), rs_idx(src.rs_idx), head(src.head), used(src.used), n(src.n),
        depth(src.handoff_valid_depth), rs_z(src.rs_z), generation(src.handoff_generation) {}

    void commit() noexcept override {
        for (const auto & b : bindings) {
            b.tensor->buffer = b.buffer;
            b.tensor->data = b.data;
            b.tensor->extra = nullptr;
        }
        dst.cells.swap(cells);
        dst.rs_idx.swap(rs_idx);
        dst.handoff_buffers.swap(buffers);
        dst.head = head;
        dst.used = used;
        dst.n = n;
        dst.rs_z = rs_z;
        dst.handoff_valid_depth = depth;
        dst.handoff_generation = generation;
        dst.handoff_committed = true;
        dst.handoff_deferred = false;
        for (auto & cb : dst.ctxs_bufs) cb.second.reset();
    }
};

llama_memory_transfer_ptr llama_memory_recurrent::prepare_handoff(llama_memory_i & source,
        const llama_memory_view_cb & view, bool allow_copy, size_t & shared, size_t & copied) {
    auto * src = dynamic_cast<llama_memory_recurrent *>(&source);
    if (!src || src == this || typeid(*src) != typeid(llama_memory_recurrent) || typeid(*this) != typeid(llama_memory_recurrent) ||
        allow_copy || !handoff_strict || !handoff_deferred || !src->handoff_state_valid() ||
        used != 0 || !handoff_buffers.empty() || size != src->size || n_seq_max != src->n_seq_max || n_rs_seq != src->n_rs_seq ||
        r_l.size() != src->r_l.size() || s_l.size() != src->s_l.size() || p_l.size() != src->p_l.size()) return nullptr;
    for (const auto & c : cells) if (!c.is_empty() || c.pos != -1) return nullptr;
    for (size_t il = 0; il < r_l.size(); ++il) {
        if (!same_tensor(r_l[il], src->r_l[il]) || !same_tensor(s_l[il], src->s_l[il]) ||
            p_l[il] || src->p_l[il]) return nullptr;
    }
    auto tx = std::make_unique<handoff>(*this, *src);
    std::map<ggml_backend_buffer_t, ggml_backend_buffer_t> allocations;
    size_t mapped = 0;
    for (size_t il = 0; il < r_l.size(); ++il) {
        for (int kind = 0; kind < 2; ++kind) {
            auto * s = kind ? src->s_l[il] : src->r_l[il];
            auto * d = kind ? s_l[il] : r_l[il];
            if (!s) continue;
            if (!s->buffer || s->view_src) return nullptr;
            const auto base = (uintptr_t) ggml_backend_buffer_get_base(s->buffer);
            const size_t size = ggml_backend_buffer_get_size(s->buffer);
            const size_t bytes = ggml_nbytes(s);
            if ((uintptr_t) s->data < base) return nullptr;
            const size_t offset = (uintptr_t) s->data - base;
            if (offset > size || bytes > size - offset) return nullptr;
            auto it = allocations.find(s->buffer);
            if (it == allocations.end()) {
                ggml_backend_buffer_ptr host(view(s->buffer, 0, size));
                if (!host || !ggml_backend_buffer_is_host(host.get()) ||
                    ggml_backend_buffer_get_size(host.get()) < size || !ggml_backend_buffer_get_base(host.get())) return nullptr;
                ggml_backend_buffer_set_usage(host.get(), GGML_BACKEND_BUFFER_USAGE_ANY);
                it = allocations.emplace(s->buffer, host.get()).first;
                tx->buffers.push_back(std::move(host));
            }
            auto * ptr = (uint8_t *) ggml_backend_buffer_get_base(it->second) + offset;
            if ((uintptr_t) ptr % ggml_backend_buft_get_alignment(ggml_backend_cpu_buffer_type()) != 0) return nullptr;
            tx->bindings.push_back({d, it->second, ptr});
            add_bytes(mapped, bytes);
        }
    }
    if (!mapped) return nullptr;
    add_bytes(shared, mapped);
    GGML_UNUSED(copied);
    return tx;
}

bool llama_memory_hybrid::handoff_begin_compute() {
    return mem_recr->handoff_begin_compute();
}

void llama_memory_hybrid::handoff_end_compute(const llama_ubatch & batch, bool success) {
    mem_recr->handoff_end_compute(batch, success);
}

llama_memory_transfer_ptr llama_memory_hybrid::prepare_handoff(llama_memory_i & source,
        const llama_memory_view_cb & view, bool allow_copy, size_t & shared, size_t & copied) {
    auto * src = dynamic_cast<llama_memory_hybrid *>(&source);
    if (!src || src == this || typeid(*src) != typeid(llama_memory_hybrid) || typeid(*this) != typeid(llama_memory_hybrid) ||
        allow_copy || !src->mem_recr->handoff_state_valid()) return nullptr;
    if (src->mem_attn->seq_pos_max(0) != src->mem_recr->seq_pos_max(0)) return nullptr;
    struct hybrid_transfer : llama_memory_transfer_i {
        llama_memory_transfer_ptr attn, recr;
        void commit() noexcept override { attn->commit(); recr->commit(); }
    };
    auto tx = std::make_unique<hybrid_transfer>();
    size_t mapped = 0, migrated = 0;
    tx->attn = mem_attn->prepare_handoff(*src->mem_attn, view, false, mapped, migrated);
    if (!tx->attn) return nullptr;
    tx->recr = mem_recr->prepare_handoff(*src->mem_recr, view, false, mapped, migrated);
    if (!tx->recr || migrated) return nullptr;
    add_bytes(shared, mapped);
    GGML_UNUSED(copied);
    return tx;
}
