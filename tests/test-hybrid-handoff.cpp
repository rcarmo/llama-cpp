#include "../src/llama-memory-hybrid.h"
#include "../src/llama-model.h"
#include "../src/llama-io.h"
#include "../ggml/src/ggml-backend-impl.h"
#include <cstdio>
#include <cstring>
#include <stdexcept>

struct toy_model : llama_model {
    toy_model() : llama_model(llama_model_default_params()) {
        arch = LLM_ARCH_QWEN35;
        hparams.n_layer_all = 2;
        hparams.n_embd = 32;
        hparams.n_embd_head_k_full = 32;
        hparams.n_embd_head_v_full = 32;
        hparams.n_head_arr.fill(1);
        hparams.n_head_kv_arr.fill(1);
        hparams.is_recr_impl[0] = true;
        hparams.ssm_d_conv = 4;
        hparams.ssm_d_inner = 8;
        hparams.ssm_d_state = 4;
        hparams.ssm_n_group = 1;
    }
    void load_stats(llama_model_loader &) override {}
    void load_hparams(llama_model_loader &) override {}
    void load_vocab(llama_model_loader &) override {}
    bool load_tensors(llama_model_loader &) override { return false; }
    void load_arch_hparams(llama_model_loader &) override {}
    void load_arch_tensors(llama_model_loader &) override {}
    std::unique_ptr<llm_graph_context> build_arch_graph(const llm_graph_params &) const override { return nullptr; }
};

struct writer : llama_io_write_i {
    std::vector<uint8_t> bytes;
    void write(const void * p, size_t n) override {
        if (!n) return;
        const auto * b = (const uint8_t *) p;
        bytes.insert(bytes.end(), b, b + n);
    }
    void write_tensor(ggml_tensor * t, size_t off, size_t n) override {
        size_t p = bytes.size(); bytes.resize(p + n);
        ggml_backend_tensor_get(t, bytes.data() + p, off, n);
    }
    size_t n_bytes() override { return bytes.size(); }
};
static std::vector<uint8_t> state(llama_memory_i & mem) { writer w; mem.state_write(w); return w.bytes; }

static std::shared_ptr<llama_memory_hybrid> make(toy_model & model, bool deferred, uint32_t rollback = 3) {
    llama_memory_init init;
    init.strict = true;
    init.deferred = deferred;
    init.alloc = [](ggml_backend_buffer_type_t buft, size_t size) { return ggml_backend_buft_alloc_buffer(buft, size); };
    return std::make_shared<llama_memory_hybrid>(model, GGML_TYPE_F16, GGML_TYPE_F16, false,
            32, 1, 0, LLAMA_SWA_TYPE_NONE, GGML_TYPE_F32, GGML_TYPE_F32, 1, 1, rollback, false, false,
            nullptr, nullptr, init);
}

static void populate(llama_memory_hybrid & mem) {
    auto * a = mem.get_mem_attn();
    auto & cells = const_cast<llama_kv_cells &>(a->get_cells(0));
    for (int i = 0; i < 9; ++i) { cells.pos_set(i, i); cells.seq_add(i, 0); }
    auto * r = mem.get_mem_recr();
    r->head = 0; r->n = 1; r->used = 1;
    r->cells[0].pos = 8; r->cells[0].src = 0; r->cells[0].src0 = 0; r->cells[0].tail = 0; r->cells[0].seq_id.insert(0);
    for (auto * t : {r->r_l[0], r->s_l[0]}) {
        std::vector<float> data(ggml_nelements(t));
        for (size_t i = 0; i < data.size(); ++i) data[i] = (float) i + (t == r->r_l[0] ? 100 : 2000);
        ggml_backend_tensor_set(t, data.data(), 0, ggml_nbytes(t));
    }
    llama_ubatch batch = {}; batch.n_seq_tokens = 4;
    GGML_ASSERT(mem.handoff_begin_compute()); mem.handoff_end_compute(batch, true);
}

static llama_memory_view_cb view(std::shared_ptr<llama_memory_hybrid> owner, int & count, int fail = 0) {
    struct retained { std::shared_ptr<llama_memory_hybrid> owner; ggml_backend_buffer_ptr host; };
    return [owner, &count, fail](ggml_backend_buffer_t buffer, size_t offset, size_t size) -> ggml_backend_buffer_t {
        ++count;
        GGML_ASSERT(offset == 0 && size == ggml_backend_buffer_get_size(buffer));
        if (count == fail) return nullptr;
        auto * ctx = new retained { owner, ggml_backend_buffer_ptr(ggml_backend_cpu_buffer_from_ptr(ggml_backend_buffer_get_base(buffer), size)) };
        auto iface = ctx->host->iface;
        iface.get_base = [](ggml_backend_buffer_t b) { return ggml_backend_buffer_get_base(((retained *) b->context)->host.get()); };
        iface.clear = [](ggml_backend_buffer_t b, uint8_t v) { ggml_backend_buffer_clear(((retained *) b->context)->host.get(), v); };
        iface.free_buffer = [](ggml_backend_buffer_t b) { delete (retained *) b->context; };
        return ggml_backend_buffer_init(ctx->host->buft, iface, ctx, size);
    };
}

int main() {
    toy_model model;
    {
        auto src = make(model, false), dst = make(model, true);
        populate(*src);
        GGML_ASSERT(!dst->get_mem_recr()->r_l[0]->buffer && !dst->get_mem_attn()->get_k_storage(1)->buffer);
        GGML_ASSERT(!dst->handoff_begin_compute());
        GGML_ASSERT(src->seq_rm(0, 7, -1));
        GGML_ASSERT(src->get_mem_recr()->rs_idx[0] == 2 && src->seq_pos_max(0) == 6);
        const auto before = state(*src);
        size_t shared = 0, copied = 0; int count = 0;
        auto fail = view(src, count, 2);
        GGML_ASSERT(!dst->prepare_handoff(*src, fail, false, shared, copied));
        GGML_ASSERT(count == 2 && shared == 0 && copied == 0 && state(*src) == before);
        GGML_ASSERT(src->get_mem_recr()->rs_idx[0] == 2 && !dst->get_mem_recr()->r_l[0]->data);
        count = 0;
        auto cb = view(src, count);
        auto abandoned = dst->prepare_handoff(*src, cb, false, shared, copied);
        GGML_ASSERT(abandoned); abandoned.reset();
        GGML_ASSERT(state(*src) == before && !dst->get_mem_recr()->r_l[0]->data);
        shared = 0; count = 0;
        auto tx = dst->prepare_handoff(*src, cb, false, shared, copied);
        const size_t required = ggml_nbytes(src->get_mem_recr()->r_l[0]) + ggml_nbytes(src->get_mem_recr()->s_l[0]) +
            ggml_nbytes(src->get_mem_attn()->get_k_storage(1)) + ggml_nbytes(src->get_mem_attn()->get_v_storage(1));
        GGML_ASSERT(tx && shared == required && copied == 0 && count == 2);
        auto * ptr = src->get_mem_recr()->r_l[0]->data;
        std::weak_ptr<llama_memory_hybrid> lifetime = src;
        tx->commit(); tx.reset(); cb = {}; fail = {}; src.reset();
        GGML_ASSERT(!lifetime.expired() && dst->get_mem_recr()->r_l[0]->data == ptr && state(*dst) == before);
        GGML_ASSERT(dst->get_mem_recr()->rs_idx[0] == 2);
        GGML_ASSERT(!dst->seq_rm(0, 6, -1));
        llama_memory_recurrent_context context(dst->get_mem_recr());
        GGML_ASSERT(context.s_copy(0) == 2 && dst->get_mem_recr()->rs_idx[0] == 0);
        GGML_ASSERT(context.s_copy(0) == 0);
        dst->clear(true);
        GGML_ASSERT(dst->seq_pos_max(0) == -1 && ((float *) ptr)[0] == 0);
        dst.reset(); GGML_ASSERT(lifetime.expired());
    }
    {
        auto src = make(model, false), dst = make(model, true);
        populate(*src); int count = 0; auto cb = view(src, count); size_t s = 0, c = 0;
        GGML_ASSERT(!dst->prepare_handoff(*src, cb, true, s, c));
        auto wrong = make(model, true, 2);
        GGML_ASSERT(!wrong->prepare_handoff(*src, cb, false, s, c) && s == 0);
        llama_ubatch short_batch = {}; short_batch.n_seq_tokens = 1;
        GGML_ASSERT(src->handoff_begin_compute()); src->handoff_end_compute(short_batch, true);
        GGML_ASSERT(!src->seq_rm(0, 8, -1));
        GGML_ASSERT(src->handoff_begin_compute()); src->handoff_end_compute(short_batch, false);
        GGML_ASSERT(!dst->prepare_handoff(*src, cb, false, s, c));
        GGML_ASSERT(!src->handoff_begin_compute());
    }
    {
        llama_memory_init init; init.strict = true;
        bool rejected = false;
        try { llama_memory_recurrent r(model, GGML_TYPE_F32, GGML_TYPE_F32, false, 1, 1, 3, nullptr, init); }
        catch (const std::runtime_error &) { rejected = true; }
        GGML_ASSERT(rejected);
    }
    std::puts("PASS: strict hybrid descriptor-only allocation, complete R/S planes, pending rollback, copy-zero coverage, atomic failed/abandoned prepare, source lifetime and stale snapshot rejection");
}
